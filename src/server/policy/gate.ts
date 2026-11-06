import { v4 as uuidv4 } from 'uuid';
import { evaluate } from './evaluator';
import type { PolicyGateInput, PolicyGateResult } from './types';

/**
 * Policy Gate — 모든 도구 호출은 이 함수를 통과해야 한다.
 *
 * bypass 경로 없음.
 * 판정은 순수 TypeScript 규칙으로 결정된다. LLM 응답이 영향을 주지 않는다.
 *
 * 반환값의 policyCheckId는 PROPOSED → POLICY_CHECKED → BLOCKED/EXECUTED
 * 이벤트 간 연관을 보장하기 위해 사용된다.
 */
export function evaluatePolicy(input: PolicyGateInput): PolicyGateResult {
  const policyCheckId = uuidv4();

  const result = evaluate({
    toolName: input.toolName,
    policy: input.policy,
  });

  return {
    policyCheckId,
    toolCallId: input.toolCallId,
    verdict: result.verdict,
    policyRuleId: result.policyRuleId,
    reason: result.reason,
  };
}
