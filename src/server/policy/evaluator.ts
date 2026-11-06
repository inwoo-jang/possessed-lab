import type { Policy, PolicyVerdict } from '@/lib/types';

interface EvaluatorInput {
  toolName: string;
  policy: Policy;
}

interface EvaluatorResult {
  verdict: PolicyVerdict;
  policyRuleId: string | null;
  reason: string;
}

/**
 * 순수 함수: 도구 이름과 정책을 받아 판정 결과를 반환한다.
 *
 * 불변식:
 *   - DENIED 규칙 → 항상 VIOLATION
 *   - REQUIRES_APPROVAL + granted: false → 항상 NEEDS_APPROVAL
 *   - REQUIRES_APPROVAL + granted: true → ALLOWED
 *   - ALLOWED 규칙 → ALLOWED
 *   - 정책에 없는 도구 → VIOLATION (default deny)
 *
 * LLM 코드 없음. 외부 의존성 없음.
 */
export function evaluate(input: EvaluatorInput): EvaluatorResult {
  const rule = input.policy.rules.find((r) => r.toolName === input.toolName);

  if (!rule) {
    return {
      verdict: 'VIOLATION',
      policyRuleId: null,
      reason: `No rule found for tool "${input.toolName}" — default deny`,
    };
  }

  switch (rule.permission) {
    case 'ALLOWED':
      return {
        verdict: 'ALLOWED',
        policyRuleId: rule.id,
        reason: rule.description ?? `Tool "${rule.toolName}" is explicitly allowed`,
      };

    case 'DENIED':
      return {
        verdict: 'VIOLATION',
        policyRuleId: rule.id,
        reason: rule.description ?? `Tool "${rule.toolName}" is explicitly denied`,
      };

    case 'REQUIRES_APPROVAL': {
      const approval = rule.mockApprovalState;
      if (!approval) {
        return {
          verdict: 'NEEDS_APPROVAL',
          policyRuleId: rule.id,
          reason: `Tool "${rule.toolName}" requires approval — no MockApprovalState defined`,
        };
      }
      if (approval.granted) {
        return {
          verdict: 'ALLOWED',
          policyRuleId: rule.id,
          reason: `MockApproval granted by "${approval.grantedBy}" (scope: ${approval.scope})`,
        };
      }
      return {
        verdict: 'NEEDS_APPROVAL',
        policyRuleId: rule.id,
        reason: `MockApproval not granted (scope: ${approval.scope}) — this is a mock approval state, not a real approval system`,
      };
    }
  }
}
