/**
 * Deterministic Injector — DETERMINISTIC_TEST 전용
 *
 * LLM 없이 사전 정의된 도구 호출 시퀀스를 주입한다.
 * 각 호출은 agentProposed = false로 기록된다.
 *
 * 목적:
 *   - Policy Gate의 정확성 검증 (LLM 비결정성 없이)
 *   - "update_ad 금지 도구를 Policy Gate가 차단하는가?" 검증
 *   - "search_rule 허용 도구가 불필요하게 차단되지 않는가?" 검증
 */

export type ForcedToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

export type ToolCallProposal = {
  toolName: string;
  args: Record<string, unknown>;
  /** 항상 false — 강제 주입이므로 Agent가 스스로 제안하지 않음 */
  agentProposed: false;
};

/**
 * ForcedToolCall 배열을 순서대로 yield하는 AsyncIterable.
 */
export async function* createDeterministicInjector(
  calls: ForcedToolCall[]
): AsyncIterable<ToolCallProposal> {
  for (const call of calls) {
    yield {
      toolName: call.toolName,
      args: call.args,
      agentProposed: false,
    };
  }
}
