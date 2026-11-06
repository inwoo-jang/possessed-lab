import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '@/server/policy/gate';
import type { Policy } from '@/lib/types';

/** 테스트용 광고 검토 정책 */
const testPolicy: Policy = {
  id: 'policy-test-001',
  name: 'Ad Review Policy',
  version: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
  rules: [
    // 허용 도구
    {
      id: 'rule-search_rule',
      toolName: 'search_rule',
      permission: 'ALLOWED',
      description: '규정 검색 허용',
    },
    {
      id: 'rule-read_terms',
      toolName: 'read_terms',
      permission: 'ALLOWED',
      description: '광고 조건 조회 허용',
    },
    {
      id: 'rule-draft_report',
      toolName: 'draft_report',
      permission: 'ALLOWED',
      description: '검토 보고서 작성 허용',
    },
    // 금지 도구
    {
      id: 'rule-update_ad',
      toolName: 'update_ad',
      permission: 'DENIED',
      description: '광고 원문 수정 — 이번 요청에서 허가되지 않음',
    },
    {
      id: 'rule-send_external_message',
      toolName: 'send_external_message',
      permission: 'DENIED',
      description: '외부 채널 발송 — 이번 요청에서 허가되지 않음',
    },
    // 승인 필요 도구
    {
      id: 'rule-approve_ad',
      toolName: 'approve_ad',
      permission: 'REQUIRES_APPROVAL',
      mockApprovalState: {
        granted: false,
        grantedBy: 'test-approver',
        scope: 'ad-review-only',
      },
      description: '최종 승인 — Mock 승인 미부여 상태',
    },
  ],
};

const baseInput = {
  toolCallId: '550e8400-e29b-41d4-a716-446655440000',
  args: {},
  policy: testPolicy,
  agentProposed: false,
};

describe('Policy Gate — 불변식 검증', () => {
  // 테스트 1: DENIED 도구 → 항상 VIOLATION
  it('DENIED 도구(update_ad)는 항상 VIOLATION을 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'update_ad' });
    expect(result.verdict).toBe('VIOLATION');
    expect(result.policyRuleId).toBe('rule-update_ad');
  });

  it('DENIED 도구(send_external_message)는 항상 VIOLATION을 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'send_external_message' });
    expect(result.verdict).toBe('VIOLATION');
  });

  // 테스트 2: ALLOWED 도구 → ALLOWED
  it('ALLOWED 도구(search_rule)는 ALLOWED를 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'search_rule' });
    expect(result.verdict).toBe('ALLOWED');
    expect(result.policyRuleId).toBe('rule-search_rule');
  });

  it('ALLOWED 도구(read_terms)는 ALLOWED를 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'read_terms' });
    expect(result.verdict).toBe('ALLOWED');
  });

  it('ALLOWED 도구(draft_report)는 ALLOWED를 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'draft_report' });
    expect(result.verdict).toBe('ALLOWED');
  });

  // 테스트 3: REQUIRES_APPROVAL + granted: false → NEEDS_APPROVAL
  it('REQUIRES_APPROVAL + granted: false 인 approve_ad는 NEEDS_APPROVAL을 반환한다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'approve_ad' });
    expect(result.verdict).toBe('NEEDS_APPROVAL');
    expect(result.policyRuleId).toBe('rule-approve_ad');
  });

  // 테스트 4: REQUIRES_APPROVAL + granted: true → ALLOWED
  it('REQUIRES_APPROVAL + granted: true 이면 ALLOWED를 반환한다', () => {
    const policyWithGranted: Policy = {
      ...testPolicy,
      rules: testPolicy.rules.map((r) =>
        r.toolName === 'approve_ad'
          ? {
              ...r,
              mockApprovalState: { granted: true, grantedBy: 'manager', scope: 'ad-review' },
            }
          : r
      ),
    };
    const result = evaluatePolicy({
      ...baseInput,
      toolName: 'approve_ad',
      policy: policyWithGranted,
    });
    expect(result.verdict).toBe('ALLOWED');
  });

  // 테스트 5: 정책에 없는 도구 → VIOLATION (default deny)
  it('정책에 등록되지 않은 도구는 VIOLATION을 반환한다 (default deny)', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'unknown_tool' });
    expect(result.verdict).toBe('VIOLATION');
    expect(result.policyRuleId).toBeNull();
  });

  // 테스트 6: policyCheckId와 toolCallId 연관 보장
  it('판정 결과에 policyCheckId(UUID)와 toolCallId가 올바르게 포함된다', () => {
    const toolCallId = '550e8400-e29b-41d4-a716-446655440099';
    const result = evaluatePolicy({ ...baseInput, toolCallId, toolName: 'update_ad' });

    expect(result.toolCallId).toBe(toolCallId);
    // policyCheckId는 새로운 UUID
    expect(result.policyCheckId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    // policyCheckId != toolCallId (별개의 UUID)
    expect(result.policyCheckId).not.toBe(toolCallId);
  });

  // 테스트 7: 각 호출마다 새로운 policyCheckId 생성
  it('같은 도구를 두 번 호출하면 서로 다른 policyCheckId가 생성된다', () => {
    const r1 = evaluatePolicy({ ...baseInput, toolName: 'update_ad' });
    const r2 = evaluatePolicy({ ...baseInput, toolName: 'update_ad' });
    expect(r1.policyCheckId).not.toBe(r2.policyCheckId);
  });

  // 테스트 8: reason이 항상 비어있지 않은 문자열임을 보장
  it('판정 reason은 항상 비어있지 않은 문자열이다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'update_ad' });
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  // 테스트 9: 정책에 없는 도구의 reason에는 도구 이름이 포함된다
  it('정책에 없는 도구의 reason에는 해당 도구 이름이 포함된다', () => {
    const result = evaluatePolicy({ ...baseInput, toolName: 'some_unknown_tool' });
    expect(result.reason).toContain('some_unknown_tool');
  });
});
