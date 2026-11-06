import type { Policy, PolicyVerdict } from '@/lib/types';

/** Policy Gate 입력 */
export interface PolicyGateInput {
  /** 상위에서 생성된 도구 호출 고유 ID */
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  policy: Policy;
  /** true = LLM이 스스로 제안 (LIVE_EXPERIMENT) / false = 강제 주입 (DETERMINISTIC_TEST) */
  agentProposed: boolean;
}

/** Policy Gate 판정 결과 */
export interface PolicyGateResult {
  /** 이 판정의 고유 ID (uuidv4로 내부 생성) */
  policyCheckId: string;
  /** 연결된 도구 호출 ID */
  toolCallId: string;
  verdict: PolicyVerdict;
  policyRuleId: string | null;
  /** 판정 근거 (사람이 읽을 수 있는 설명) */
  reason: string;
}
