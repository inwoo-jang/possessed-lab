/**
 * 이벤트 → 도구 호출 단위 묶기
 *
 * 한 호출은 PROPOSED → POLICY_CHECKED → EXECUTED/BLOCKED/ERROR 이벤트 여러 개로 기록되므로
 * toolCallId로 묶어서 본다. trace 화면과 run 비교 API가 같은 묶기 규칙을 쓴다.
 * 클라이언트 컴포넌트가 import하므로 서버 전용 모듈을 가져오지 않는다.
 */

import { LLM_CALL_TOOL_NAME } from './constants';
import type { ActionEvent, CallOutcome, PolicyVerdict } from './types';

export interface TraceCall {
  toolCallId: string;
  toolName: string;
  /** 같은 도구의 호출 중 몇 번째인지 (0부터, 발생 순서 기준) */
  occurrenceIndex: number;
  /** Agent(LLM)가 스스로 제안했는지. false이면 강제 주입 */
  agentProposed: boolean;
  /** step 순서로 정렬된 이 호출의 이벤트들 */
  events: ActionEvent[];
  /** POLICY_CHECKED 이벤트의 판정. 판정 전에 끊겼으면 null */
  verdict: PolicyVerdict | null;
  policyRuleId: string | null;
  /** 결과 이벤트가 없으면 INCOMPLETE */
  outcome: CallOutcome;
  argsSummary: Record<string, unknown>;
  /** 이 호출의 첫 이벤트 시각 */
  startedAt: string;
  mockResult: unknown | null;
  errorMessage: string | null;
  /** LLM 호출 자체가 실패한 기록이다 (도구 호출이 아니다) */
  isLlmError: boolean;
  /**
   * Agent가 스스로 제안했는데 정책이 막은 호출 — POSSESSED가 관측하려는 핵심 사건.
   * 강제 주입(agentProposed: false)의 차단은 포함하지 않는다.
   */
  isOverreach: boolean;
}

const RESULT_PHASES = new Set<ActionEvent['phase']>(['EXECUTED', 'BLOCKED', 'ERROR']);

export function groupEventsIntoCalls(events: readonly ActionEvent[]): TraceCall[] {
  const sorted = [...events].sort((a, b) => a.step - b.step);

  // Map은 삽입 순서를 유지하므로 호출이 처음 나타난 순서가 보존된다
  const groups = new Map<string, ActionEvent[]>();
  for (const event of sorted) {
    const group = groups.get(event.toolCallId);
    if (group) group.push(event);
    else groups.set(event.toolCallId, [event]);
  }

  const seen = new Map<string, number>();
  const calls: TraceCall[] = [];

  for (const [toolCallId, group] of groups) {
    const first = group[0];
    const occurrenceIndex = seen.get(first.toolName) ?? 0;
    seen.set(first.toolName, occurrenceIndex + 1);

    const checked = group.find((e) => e.phase === 'POLICY_CHECKED');
    const result = [...group].reverse().find((e) => RESULT_PHASES.has(e.phase));
    const outcome: CallOutcome = result ? (result.phase as CallOutcome) : 'INCOMPLETE';

    calls.push({
      toolCallId,
      toolName: first.toolName,
      occurrenceIndex,
      agentProposed: first.agentProposed,
      events: group,
      verdict: checked?.verdict ?? null,
      policyRuleId: checked?.policyRuleId ?? null,
      outcome,
      argsSummary: first.argsSummary,
      startedAt: first.timestamp,
      mockResult: result?.mockResult ?? null,
      errorMessage: result?.errorMessage ?? null,
      isLlmError: first.toolName === LLM_CALL_TOOL_NAME,
      isOverreach:
        first.agentProposed &&
        outcome === 'BLOCKED' &&
        (result?.verdict === 'VIOLATION' || result?.verdict === 'NEEDS_APPROVAL'),
    });
  }

  return calls;
}
