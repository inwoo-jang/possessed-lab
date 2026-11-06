import { describe, it, expect } from 'vitest';
import {
  PolicyRuleSchema,
  ActionEventSchema,
  MockApprovalStateSchema,
  PolicySchema,
} from '@/lib/schemas';

describe('PolicyRuleSchema', () => {
  it('유효한 ALLOWED 규칙을 통과시킨다', () => {
    const result = PolicyRuleSchema.safeParse({
      id: 'rule-1',
      toolName: 'search_rule',
      permission: 'ALLOWED',
      description: '규정 검색 허용',
    });
    expect(result.success).toBe(true);
  });

  it('toolName이 없으면 parse 실패', () => {
    const result = PolicyRuleSchema.safeParse({
      id: 'rule-1',
      permission: 'ALLOWED',
    });
    expect(result.success).toBe(false);
  });

  it('잘못된 permission 값은 parse 실패', () => {
    const result = PolicyRuleSchema.safeParse({
      id: 'rule-1',
      toolName: 'update_ad',
      permission: 'MAYBE', // 잘못된 값
    });
    expect(result.success).toBe(false);
  });

  it('REQUIRES_APPROVAL 규칙에 mockApprovalState가 포함될 수 있다', () => {
    const result = PolicyRuleSchema.safeParse({
      id: 'rule-approval',
      toolName: 'approve_ad',
      permission: 'REQUIRES_APPROVAL',
      mockApprovalState: {
        granted: false,
        grantedBy: 'test-approver',
        scope: 'ad-review',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ActionEventSchema', () => {
  const validEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    experimentId: 'exp-1',
    runId: 'run-1',
    toolCallId: '550e8400-e29b-41d4-a716-446655440001',
    policyCheckId: null,
    step: 0,
    toolName: 'update_ad',
    argsSummary: { adId: 'ad-001' },
    phase: 'PROPOSED',
    verdict: null,
    policyRuleId: null,
    agentProposed: true,
    runMode: 'LIVE_EXPERIMENT',
    mockResult: null,
    errorMessage: null,
    timestamp: '2026-11-06T00:00:00.000Z',
  };

  it('유효한 ActionEvent를 통과시킨다', () => {
    const result = ActionEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('agentProposed를 boolean으로 검증한다', () => {
    const result = ActionEventSchema.safeParse({
      ...validEvent,
      agentProposed: 'yes', // 문자열은 실패
    });
    expect(result.success).toBe(false);
  });

  it('잘못된 phase 값은 실패', () => {
    const result = ActionEventSchema.safeParse({
      ...validEvent,
      phase: 'UNKNOWN_PHASE',
    });
    expect(result.success).toBe(false);
  });

  it('잘못된 runMode 값은 실패', () => {
    const result = ActionEventSchema.safeParse({
      ...validEvent,
      runMode: 'INVALID_MODE',
    });
    expect(result.success).toBe(false);
  });

  it('toolCallId가 UUID 형식이 아니면 실패', () => {
    const result = ActionEventSchema.safeParse({
      ...validEvent,
      toolCallId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('MockApprovalStateSchema', () => {
  it('granted: false 상태를 통과시킨다', () => {
    const result = MockApprovalStateSchema.safeParse({
      granted: false,
      grantedBy: 'test-approver',
      scope: 'ad-review',
    });
    expect(result.success).toBe(true);
  });

  it('grantedBy가 빈 문자열이면 실패', () => {
    const result = MockApprovalStateSchema.safeParse({
      granted: true,
      grantedBy: '',
      scope: 'ad-review',
    });
    expect(result.success).toBe(false);
  });
});

describe('PolicySchema', () => {
  it('rules가 비어있으면 실패', () => {
    const result = PolicySchema.safeParse({
      id: 'policy-1',
      name: 'Test Policy',
      version: 1,
      rules: [],
      createdAt: '2026-11-06T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
