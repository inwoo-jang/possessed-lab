/**
 * Experiment Runner — 핵심 실행 루프
 *
 * 모든 실험 실행은 이 파일을 통과한다.
 *
 * 지원하는 두 가지 실행 경로:
 *
 *   DETERMINISTIC_TEST:
 *     ForcedToolCall 배열 → createDeterministicInjector → Policy Gate → Sandbox
 *     LLM 없음. agentProposed = false. Policy Gate 자체의 정확성 검증 목적.
 *
 *   LIVE_EXPERIMENT:
 *     LLM Tool Calling 루프 → Policy Gate → Sandbox
 *     실제 LLM(또는 MockLLMAdapter)이 정상 요청에서 도구를 자유롭게 선택.
 *     "Agent가 스스로 금지된 도구를 제안하는가?" 관측 목적.
 *     agentProposed = true.
 *
 * 공통 불변식:
 *   - 모든 도구 호출은 반드시 Policy Gate를 통과한다 (bypass 없음)
 *   - toolCallId: 하나의 도구 호출 시도를 묶는 UUID
 *   - policyCheckId: 판정 이벤트(POLICY_CHECKED)와 결과 이벤트(EXECUTED/BLOCKED) 연결
 *   - PROPOSED → POLICY_CHECKED → EXECUTED|BLOCKED 이벤트 순서 보장
 *   - 예외 발생 시 ERROR 이벤트 (VIOLATION으로 오인 금지)
 */

import { v4 as uuidv4 } from 'uuid';
import type { ActionEvent, Policy, RunMode } from '@/lib/types';
import type { EventWriter } from '@/lib/event-log';
import { evaluatePolicy } from '@/server/policy/gate';
import { executeInSandbox } from '@/server/tools/sandbox';
import type { MockToolRegistry } from '@/server/tools/registry';
import { SENSITIVE_KEY_PATTERNS, MAX_AGENT_STEPS } from '@/lib/constants';
import {
  createDeterministicInjector,
  type ForcedToolCall,
} from './deterministic-injector';
import type { LLMAdapter, LLMMessage, LLMToolCall } from './llm-client';

// ---------------------------------------------------------------------------
// Runner 입력 타입
// ---------------------------------------------------------------------------

interface BaseRunnerInput {
  runId: string;
  experimentId: string;
  policy: Policy;
  registry: MockToolRegistry;
  eventWriter?: EventWriter;  // optional — 미제공 시 InMemoryEventWriter 사용
}

export interface DeterministicRunnerInput extends BaseRunnerInput {
  runMode: 'DETERMINISTIC_TEST';
  forcedCalls: ForcedToolCall[];
}

export interface LiveRunnerInput extends BaseRunnerInput {
  runMode: 'LIVE_EXPERIMENT';
  systemPrompt: string;
  userRequest: string;
  llmAdapter: LLMAdapter;
}

export type RunnerInput = DeterministicRunnerInput | LiveRunnerInput;

export type RunnerResult = {
  events: ActionEvent[];
  /** Agent가 스스로 금지 도구를 제안한 횟수 (agentProposed: true + VIOLATION/NEEDS_APPROVAL) */
  overreachAttempts: number;
  /** 정상 실행된 도구 수 (EXECUTED) */
  executedCount: number;
  /** 차단된 도구 호출 수 (BLOCKED) */
  blockedCount: number;
};

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 실험을 실행하고 이벤트 스트림을 반환한다.
 *
 * runMode에 따라 DETERMINISTIC_TEST 또는 LIVE_EXPERIMENT 경로를 선택한다.
 * eventWriter가 없으면 InMemoryEventWriter를 기본값으로 사용한다.
 */
export async function runExperiment(input: RunnerInput): Promise<RunnerResult> {
  // eventWriter 기본값 보장
  if (!input.eventWriter) {
    const { InMemoryEventWriter } = await import('@/lib/event-log');
    (input as RunnerInput).eventWriter = new InMemoryEventWriter();
  }
  const safeInput = input as RunnerInput & { eventWriter: EventWriter };

  if (safeInput.runMode === 'DETERMINISTIC_TEST') {
    return runDeterministicExperiment(safeInput as DeterministicRunnerInput & { eventWriter: EventWriter });
  }
  return runLiveExperiment(safeInput as LiveRunnerInput & { eventWriter: EventWriter });
}

// ---------------------------------------------------------------------------
// DETERMINISTIC_TEST 실행 경로
// ---------------------------------------------------------------------------

async function runDeterministicExperiment(
  input: DeterministicRunnerInput & { eventWriter: EventWriter }
): Promise<RunnerResult> {
  const events: ActionEvent[] = [];
  let step = 0;

  const proposals = createDeterministicInjector(input.forcedCalls);

  for await (const proposal of proposals) {
    const toolCallId = uuidv4();

    // 1. PROPOSED 이벤트
    const proposedEvent = makeEvent({
      runId: input.runId,
      experimentId: input.experimentId,
      toolCallId,
      policyCheckId: null,
      step: step++,
      toolName: proposal.toolName,
      argsSummary: maskSensitiveArgs(proposal.args),
      phase: 'PROPOSED',
      verdict: null,
      policyRuleId: null,
      agentProposed: false, // 강제 주입 — Agent가 스스로 제안하지 않음
      runMode: 'DETERMINISTIC_TEST',
      mockResult: null,
      errorMessage: null,
    });
    await input.eventWriter.write(proposedEvent);
    events.push(proposedEvent);

    // 2. Policy Gate 통과 (필수, bypass 없음)
    const gateResult = evaluatePolicy({
      toolCallId,
      toolName: proposal.toolName,
      args: proposal.args,
      policy: input.policy,
      agentProposed: false,
    });

    // 3. POLICY_CHECKED 이벤트
    const checkedEvent = makeEvent({
      runId: input.runId,
      experimentId: input.experimentId,
      toolCallId,
      policyCheckId: gateResult.policyCheckId,
      step: step++,
      toolName: proposal.toolName,
      argsSummary: maskSensitiveArgs(proposal.args),
      phase: 'POLICY_CHECKED',
      verdict: gateResult.verdict,
      policyRuleId: gateResult.policyRuleId,
      agentProposed: false,
      runMode: 'DETERMINISTIC_TEST',
      mockResult: null,
      errorMessage: null,
    });
    await input.eventWriter.write(checkedEvent);
    events.push(checkedEvent);

    // 4. ALLOWED → 실행 / 그 외 → 차단
    if (gateResult.verdict === 'ALLOWED') {
      const resultEvent = await executeToolAndRecord({
        runId: input.runId,
        experimentId: input.experimentId,
        toolCallId,
        policyCheckId: gateResult.policyCheckId,
        step: step++,
        toolName: proposal.toolName,
        args: proposal.args,
        agentProposed: false,
        runMode: 'DETERMINISTIC_TEST',
        registry: input.registry,
      });
      await input.eventWriter.write(resultEvent);
      events.push(resultEvent);
    } else {
      const blockedEvent = makeEvent({
        runId: input.runId,
        experimentId: input.experimentId,
        toolCallId,
        policyCheckId: gateResult.policyCheckId,
        step: step++,
        toolName: proposal.toolName,
        argsSummary: maskSensitiveArgs(proposal.args),
        phase: 'BLOCKED',
        verdict: gateResult.verdict,
        policyRuleId: gateResult.policyRuleId,
        agentProposed: false,
        runMode: 'DETERMINISTIC_TEST',
        mockResult: null,
        errorMessage: null,
      });
      await input.eventWriter.write(blockedEvent);
      events.push(blockedEvent);
    }
  }

  return summarize(events);
}

// ---------------------------------------------------------------------------
// LIVE_EXPERIMENT 실행 경로
// ---------------------------------------------------------------------------

async function runLiveExperiment(input: LiveRunnerInput & { eventWriter: EventWriter }): Promise<RunnerResult> {
  const events: ActionEvent[] = [];
  let step = 0;

  // 대화 히스토리 초기화
  const messages: LLMMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userRequest },
  ];

  // 모든 도구 목록을 LLM에 전달 (허가 여부 무관 — Agent의 자율적 선택을 관측)
  const tools = input.registry.toToolDefinitions();

  let loopCount = 0;

  while (loopCount < MAX_AGENT_STEPS) {
    loopCount++;

    // LLM 응답 요청
    let llmResponse;
    try {
      llmResponse = await input.llmAdapter.chat(messages, tools);
    } catch (err) {
      // LLM 호출 자체가 실패한 경우 — ERROR 이벤트 기록 후 종료
      const errorEvent = makeEvent({
        runId: input.runId,
        experimentId: input.experimentId,
        toolCallId: uuidv4(),
        policyCheckId: null,
        step: step++,
        toolName: '[llm_call]',
        argsSummary: {},
        phase: 'ERROR',
        verdict: null,
        policyRuleId: null,
        agentProposed: true,
        runMode: 'LIVE_EXPERIMENT',
        mockResult: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      await input.eventWriter.write(errorEvent);
      events.push(errorEvent);
      break;
    }

    // LLM이 최종 답변을 반환하면 루프 종료
    if (llmResponse.type === 'final_answer') {
      break;
    }

    // LLM이 도구 호출을 제안한 경우
    const toolCallResponses: LLMMessage[] = [];

    for (const toolCall of llmResponse.toolCalls) {
      const toolCallId = uuidv4();
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;

      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        args = { _raw: toolCall.function.arguments };
      }

      // 1. PROPOSED 이벤트 (agentProposed: true — LLM이 스스로 선택)
      const proposedEvent = makeEvent({
        runId: input.runId,
        experimentId: input.experimentId,
        toolCallId,
        policyCheckId: null,
        step: step++,
        toolName,
        argsSummary: maskSensitiveArgs(args),
        phase: 'PROPOSED',
        verdict: null,
        policyRuleId: null,
        agentProposed: true, // ← 핵심: Agent가 스스로 이 도구를 선택했음
        runMode: 'LIVE_EXPERIMENT',
        mockResult: null,
        errorMessage: null,
      });
      await input.eventWriter.write(proposedEvent);
      events.push(proposedEvent);

      // 2. Policy Gate 통과 (필수, bypass 없음)
      const gateResult = evaluatePolicy({
        toolCallId,
        toolName,
        args,
        policy: input.policy,
        agentProposed: true,
      });

      // 3. POLICY_CHECKED 이벤트
      const checkedEvent = makeEvent({
        runId: input.runId,
        experimentId: input.experimentId,
        toolCallId,
        policyCheckId: gateResult.policyCheckId,
        step: step++,
        toolName,
        argsSummary: maskSensitiveArgs(args),
        phase: 'POLICY_CHECKED',
        verdict: gateResult.verdict,
        policyRuleId: gateResult.policyRuleId,
        agentProposed: true,
        runMode: 'LIVE_EXPERIMENT',
        mockResult: null,
        errorMessage: null,
      });
      await input.eventWriter.write(checkedEvent);
      events.push(checkedEvent);

      // 4. 판정에 따라 실행 또는 차단
      let toolResultContent: string;

      if (gateResult.verdict === 'ALLOWED') {
        const resultEvent = await executeToolAndRecord({
          runId: input.runId,
          experimentId: input.experimentId,
          toolCallId,
          policyCheckId: gateResult.policyCheckId,
          step: step++,
          toolName,
          args,
          agentProposed: true,
          runMode: 'LIVE_EXPERIMENT',
          registry: input.registry,
        });
        await input.eventWriter.write(resultEvent);
        events.push(resultEvent);

        // LLM에게 실행 결과 전달
        const mockResult = resultEvent.mockResult as { data?: unknown } | null;
        toolResultContent = JSON.stringify(mockResult?.data ?? resultEvent.mockResult ?? {});
      } else {
        // 차단 — BLOCKED 이벤트 기록
        const blockedEvent = makeEvent({
          runId: input.runId,
          experimentId: input.experimentId,
          toolCallId,
          policyCheckId: gateResult.policyCheckId,
          step: step++,
          toolName,
          argsSummary: maskSensitiveArgs(args),
          phase: 'BLOCKED',
          verdict: gateResult.verdict,
          policyRuleId: gateResult.policyRuleId,
          agentProposed: true,
          runMode: 'LIVE_EXPERIMENT',
          mockResult: null,
          errorMessage: null,
        });
        await input.eventWriter.write(blockedEvent);
        events.push(blockedEvent);

        // LLM에게 차단 사실을 알림 (왜 차단됐는지 포함)
        toolResultContent = JSON.stringify({
          blocked: true,
          reason: gateResult.reason,
          verdict: gateResult.verdict,
        });
      }

      // 도구 응답을 대화 히스토리에 추가 (LLM의 다음 결정을 위해)
      toolCallResponses.push({
        role: 'tool',
        content: toolResultContent,
        tool_call_id: toolCall.id,
      });
    }

    // LLM의 도구 호출 메시지와 응답을 히스토리에 추가
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: llmResponse.toolCalls,
    });
    messages.push(...toolCallResponses);
  }

  return summarize(events);
}

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

/**
 * 도구를 sandbox에서 실행하고 결과 이벤트를 반환한다.
 * 예외 발생 시 ERROR 이벤트를 반환한다 (VIOLATION으로 오인 금지).
 */
async function executeToolAndRecord(params: {
  runId: string;
  experimentId: string;
  toolCallId: string;
  policyCheckId: string;
  step: number;
  toolName: string;
  args: Record<string, unknown>;
  agentProposed: boolean;
  runMode: RunMode;
  registry: MockToolRegistry;
}): Promise<ActionEvent> {
  let tool;
  try {
    tool = params.registry.get(params.toolName);
  } catch (err) {
    // Registry에 없는 도구 — ERROR 이벤트 (Policy Gate에서 VIOLATION이어야 했음)
    return makeEvent({
      runId: params.runId,
      experimentId: params.experimentId,
      toolCallId: params.toolCallId,
      policyCheckId: params.policyCheckId,
      step: params.step,
      toolName: params.toolName,
      argsSummary: maskSensitiveArgs(params.args),
      phase: 'ERROR',
      verdict: null,
      policyRuleId: null,
      agentProposed: params.agentProposed,
      runMode: params.runMode,
      mockResult: null,
      errorMessage: `Tool not found in registry: "${params.toolName}". ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const sandboxResult = await executeInSandbox(tool, params.args);

  if (!sandboxResult.ok) {
    // Sandbox 실행 중 예외 — ERROR 이벤트 (VIOLATION이 아님)
    return makeEvent({
      runId: params.runId,
      experimentId: params.experimentId,
      toolCallId: params.toolCallId,
      policyCheckId: params.policyCheckId,
      step: params.step,
      toolName: params.toolName,
      argsSummary: maskSensitiveArgs(params.args),
      phase: 'ERROR',
      verdict: null,
      policyRuleId: null,
      agentProposed: params.agentProposed,
      runMode: params.runMode,
      mockResult: null,
      errorMessage: sandboxResult.errorMessage,
    });
  }

  return makeEvent({
    runId: params.runId,
    experimentId: params.experimentId,
    toolCallId: params.toolCallId,
    policyCheckId: params.policyCheckId,
    step: params.step,
    toolName: params.toolName,
    argsSummary: maskSensitiveArgs(params.args),
    phase: 'EXECUTED',
    verdict: 'ALLOWED',
    policyRuleId: null,
    agentProposed: params.agentProposed,
    runMode: params.runMode,
    mockResult: sandboxResult.result,
    errorMessage: null,
  });
}

/** ActionEvent 생성 헬퍼 */
function makeEvent(fields: Omit<ActionEvent, 'id' | 'timestamp'>): ActionEvent {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...fields,
  };
}

/** 민감 필드 마스킹 */
function maskSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) =>
      lowerKey.includes(pattern)
    );
    masked[key] = isSensitive ? '[REDACTED]' : value;
  }
  return masked;
}

/** 실행 결과 집계 */
function summarize(events: ActionEvent[]): RunnerResult {
  const overreachAttempts = events.filter(
    (e) =>
      e.agentProposed === true &&
      e.phase === 'BLOCKED' &&
      (e.verdict === 'VIOLATION' || e.verdict === 'NEEDS_APPROVAL')
  ).length;

  const executedCount = events.filter((e) => e.phase === 'EXECUTED').length;
  const blockedCount = events.filter((e) => e.phase === 'BLOCKED').length;

  return { events, overreachAttempts, executedCount, blockedCount };
}
