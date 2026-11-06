/**
 * LLM Adapter — Tool Calling 인터페이스
 *
 * 역할:
 *   - LLM에게 사용자 요청과 도구 목록을 전달하고 응답을 받음
 *   - 도구 선택 결과(ToolCallProposal[])만 반환 — 실제 실행하지 않음
 *   - Policy Gate나 Sandbox와 완전히 분리됨
 *
 * 핵심 원칙:
 *   - Adapter는 "Agent가 무엇을 하고 싶었는가"를 기록하는 관측 지점
 *   - 실제 실행 여부는 오직 Policy Gate → Sandbox 경로에서만 결정됨
 */

import type { ToolDefinition } from '@/server/tools/types';

// ---------------------------------------------------------------------------
// LLM Adapter 인터페이스
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** tool role일 때: 응답 대상 tool_call_id */
  tool_call_id?: string;
  /** assistant role일 때: tool_calls */
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;           // OpenAI tool_call_id
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON 문자열
  };
}

export type LLMResponse =
  | { type: 'tool_calls'; toolCalls: LLMToolCall[] }
  | { type: 'final_answer'; content: string };

/**
 * LLM Adapter 인터페이스.
 *
 * 구현체:
 *   - OpenAIAdapter: 실제 OpenAI API 호출 (LIVE_EXPERIMENT용)
 *   - MockLLMAdapter: 사전 정의된 응답 반환 (테스트용)
 */
export interface LLMAdapter {
  /**
   * 대화 히스토리와 도구 목록을 받아 다음 LLM 응답을 반환한다.
   *
   * @param messages 현재까지의 대화 히스토리
   * @param tools 사용 가능한 도구 목록
   * @returns tool_calls 또는 final_answer
   */
  chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// OpenAI Adapter (LIVE_EXPERIMENT 전용)
// ---------------------------------------------------------------------------

/**
 * OpenAI GPT Tool Calling Adapter.
 *
 * 보안:
 *   - API 키는 process.env.OPENAI_API_KEY에서만 읽음
 *   - 클라이언트 번들에 절대 포함되지 않음 (서버 전용)
 */
export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(options?: { model?: string; temperature?: number }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
        'LIVE_EXPERIMENT requires a valid API key. ' +
        'For testing without an API key, use MockLLMAdapter.'
      );
    }
    this.apiKey = apiKey;
    this.model = options?.model ?? 'gpt-4o';
    this.temperature = options?.temperature ?? 0.0;
  }

  async chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages: messages.map(serializeMessage),
        tools,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenAIChatCompletion;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('OpenAI API returned no choices');
    }

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      return {
        type: 'tool_calls',
        toolCalls: choice.message.tool_calls,
      };
    }

    return {
      type: 'final_answer',
      content: choice.message.content ?? '',
    };
  }

  getModel(): string { return this.model; }
  getTemperature(): number { return this.temperature; }
}

// ---------------------------------------------------------------------------
// Mock LLM Adapter (결정적 테스트 전용)
// ---------------------------------------------------------------------------

export type MockLLMTurn =
  | { type: 'tool_calls'; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }
  | { type: 'final_answer'; content: string };

/**
 * Mock LLM Adapter.
 *
 * 사전 정의된 turn 배열을 순서대로 반환한다.
 * API 키 없이 LIVE_EXPERIMENT 경로를 결정적으로 테스트할 수 있다.
 *
 * 사용 예:
 *   const mock = new MockLLMAdapter([
 *     { type: 'tool_calls', toolCalls: [{ name: 'update_ad', args: { adId: 'ad-1', content: '...' } }] },
 *     { type: 'final_answer', content: '완료되었습니다.' },
 *   ]);
 */
export class MockLLMAdapter implements LLMAdapter {
  private turns: MockLLMTurn[];
  private callCount = 0;
  /** 호출 이력 (테스트 검증용) */
  readonly callHistory: Array<{ messages: LLMMessage[]; tools: ToolDefinition[] }> = [];

  constructor(turns: MockLLMTurn[]) {
    this.turns = turns;
  }

  async chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    this.callHistory.push({ messages: [...messages], tools: [...tools] });

    const turn = this.turns[this.callCount];
    this.callCount++;

    if (!turn) {
      // 설정된 turn을 모두 소진하면 final_answer 반환
      return { type: 'final_answer', content: '[MockLLMAdapter] No more turns defined.' };
    }

    if (turn.type === 'final_answer') {
      return turn;
    }

    // tool_calls를 OpenAI 형식으로 변환
    return {
      type: 'tool_calls',
      toolCalls: turn.toolCalls.map((tc, i) => ({
        id: `mock-tool-call-${this.callCount}-${i}`,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      })),
    };
  }

  getTotalCalls(): number { return this.callCount; }
}

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

function serializeMessage(msg: LLMMessage): Record<string, unknown> {
  const base: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };
  if (msg.tool_call_id) base.tool_call_id = msg.tool_call_id;
  if (msg.tool_calls) base.tool_calls = msg.tool_calls;
  return base;
}

// OpenAI API 응답 타입 (최소 정의)
interface OpenAIChatCompletion {
  choices: Array<{
    finish_reason: string;
    message: {
      role: string;
      content: string | null;
      tool_calls?: LLMToolCall[];
    };
  }>;
}
