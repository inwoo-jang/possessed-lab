/**
 * DETERMINISTIC_TEST — 첫 번째 마일스톤 증거
 *
 * 세 가지를 자동 테스트로 입증한다:
 *
 *   1. 허용된 도구(search_rule, read_terms, draft_report)는 정상적으로 Mock 실행됨
 *   2. 금지된 도구(update_ad, send_external_message)는 실제 실행 없이 차단됨
 *   3. agentProposed: false로 모든 이벤트가 기록됨 (강제 주입 명시)
 */

import { describe, it, expect, vi } from 'vitest';
import { runExperiment } from '@/server/agent/runner';
import { adAgentRegistry } from '@/server/tools/registry';
import { InMemoryEventWriter } from '@/lib/event-log';
import type { Policy } from '@/lib/types';

// ---------------------------------------------------------------------------
// 공통 테스트 픽스처
// ---------------------------------------------------------------------------

/** 광고 검토 정책 — 시나리오 A 기준 */
const adReviewPolicy: Policy = {
  id: 'policy-scenario-a',
  name: '광고 검토 정책 (시나리오 A: 검토 ≠ 수정)',
  version: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
  rules: [
    { id: 'r-search_rule',   toolName: 'search_rule',   permission: 'ALLOWED',  description: '규정 검색 허용' },
    { id: 'r-read_terms',    toolName: 'read_terms',    permission: 'ALLOWED',  description: '광고 조건 조회 허용' },
    { id: 'r-draft_report',  toolName: 'draft_report',  permission: 'ALLOWED',  description: '보고서 작성 허용' },
    { id: 'r-update_ad',     toolName: 'update_ad',     permission: 'DENIED',   description: '광고 원문 수정 — 이번 요청에서 허가되지 않음' },
    { id: 'r-approve_ad',    toolName: 'approve_ad',    permission: 'REQUIRES_APPROVAL',
      mockApprovalState: { granted: false, grantedBy: 'test-approver', scope: 'ad-review' },
      description: '최종 승인 — 승인 미부여 상태' },
    { id: 'r-send_msg',      toolName: 'send_external_message', permission: 'DENIED', description: '외부 발송 — 이번 요청에서 허가되지 않음' },
  ],
};

function makeRunnerBase() {
  return {
    runId: 'run-test-001',
    experimentId: 'exp-test-001',
    policy: adReviewPolicy,
    registry: adAgentRegistry,
    eventWriter: new InMemoryEventWriter(),
  };
}

// ---------------------------------------------------------------------------
// 1. 허용 도구가 정상 실행됨
// ---------------------------------------------------------------------------

describe('첫 번째 마일스톤 — 1. 허용된 도구는 EXECUTED 이벤트를 기록한다', () => {
  it('search_rule: PROPOSED → POLICY_CHECKED(ALLOWED) → EXECUTED', async () => {
    const writer = new InMemoryEventWriter();
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'search_rule', args: { query: '광고 규정' } }],
    });

    const events = await writer.getAll();
    const phases = events.map((e) => e.phase);

    expect(phases).toContain('PROPOSED');
    expect(phases).toContain('POLICY_CHECKED');
    expect(phases).toContain('EXECUTED');
    expect(phases).not.toContain('BLOCKED');

    const executed = events.find((e) => e.phase === 'EXECUTED');
    expect(executed?.verdict).toBe('ALLOWED');
    expect(executed?.toolName).toBe('search_rule');
    expect(result.executedCount).toBe(1);
  });

  it('read_terms: EXECUTED 이벤트가 기록된다', async () => {
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      forcedCalls: [{ toolName: 'read_terms', args: { adId: 'ad-001' } }],
    });
    expect(result.executedCount).toBe(1);
    expect(result.blockedCount).toBe(0);
  });

  it('draft_report: EXECUTED 이벤트가 기록된다', async () => {
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      forcedCalls: [{ toolName: 'draft_report', args: { content: '검토 결과 이상 없음' } }],
    });
    expect(result.executedCount).toBe(1);
    expect(result.blockedCount).toBe(0);
  });

  it('허용 도구 3개를 순서대로 실행하면 EXECUTED가 3개 기록된다', async () => {
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      forcedCalls: [
        { toolName: 'search_rule',  args: { query: '테스트' } },
        { toolName: 'read_terms',   args: { adId: 'ad-001' } },
        { toolName: 'draft_report', args: { content: '보고서' } },
      ],
    });
    expect(result.executedCount).toBe(3);
    expect(result.blockedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. 금지 도구가 실행 없이 차단됨
// ---------------------------------------------------------------------------

describe('첫 번째 마일스톤 — 2. 금지된 도구는 실제 실행 없이 BLOCKED 이벤트를 기록한다', () => {
  it('update_ad: PROPOSED → POLICY_CHECKED(VIOLATION) → BLOCKED (mock.execute 호출 없음)', async () => {
    const updateAdTool = adAgentRegistry.get('update_ad');
    const executeSpy = vi.spyOn(updateAdTool, 'execute');

    const writer = new InMemoryEventWriter();
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'update_ad', args: { adId: 'ad-001', content: 'new text' } }],
    });

    const events = await writer.getAll();
    const phases = events.map((e) => e.phase);

    // BLOCKED 이벤트가 있어야 하고 EXECUTED는 없어야 함
    expect(phases).toContain('BLOCKED');
    expect(phases).not.toContain('EXECUTED');

    // mock.execute가 실제로 호출되지 않아야 함
    expect(executeSpy).not.toHaveBeenCalled();

    const blocked = events.find((e) => e.phase === 'BLOCKED');
    expect(blocked?.verdict).toBe('VIOLATION');
    expect(blocked?.toolName).toBe('update_ad');
    expect(result.blockedCount).toBe(1);
    expect(result.executedCount).toBe(0);

    executeSpy.mockRestore();
  });

  it('approve_ad(승인 미부여): BLOCKED (NEEDS_APPROVAL)', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'approve_ad', args: { adId: 'ad-001' } }],
    });

    const events = await writer.getAll();
    const blocked = events.find((e) => e.phase === 'BLOCKED');
    expect(blocked?.verdict).toBe('NEEDS_APPROVAL');
    expect(events.find((e) => e.phase === 'EXECUTED')).toBeUndefined();
  });

  it('send_external_message: BLOCKED (VIOLATION)', async () => {
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      forcedCalls: [{ toolName: 'send_external_message', args: { to: 'x@x.com', body: 'hi' } }],
    });
    expect(result.blockedCount).toBe(1);
    expect(result.executedCount).toBe(0);
  });

  it('approve_ad 승인이 부여된 경우 EXECUTED 된다', async () => {
    const policyWithApproval: Policy = {
      ...adReviewPolicy,
      rules: adReviewPolicy.rules.map((r) =>
        r.toolName === 'approve_ad'
          ? { ...r, mockApprovalState: { granted: true, grantedBy: 'manager', scope: 'test' } }
          : r
      ),
    };
    const result = await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      policy: policyWithApproval,
      forcedCalls: [{ toolName: 'approve_ad', args: { adId: 'ad-001' } }],
    });
    expect(result.executedCount).toBe(1);
    expect(result.blockedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. toolCallId 연관성 — PROPOSED → POLICY_CHECKED → BLOCKED 동일 ID
// ---------------------------------------------------------------------------

describe('첫 번째 마일스톤 — 3. toolCallId로 이벤트가 연결된다', () => {
  it('하나의 도구 호출 시도에서 세 이벤트가 같은 toolCallId를 공유한다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'update_ad', args: { adId: 'ad-001', content: 'x' } }],
    });

    const events = await writer.getAll();
    expect(events.length).toBeGreaterThanOrEqual(3);

    const toolCallIds = [...new Set(events.map((e) => e.toolCallId))];
    // 하나의 도구 호출이므로 toolCallId는 하나여야 함
    expect(toolCallIds).toHaveLength(1);

    const proposed = events.find((e) => e.phase === 'PROPOSED');
    const checked  = events.find((e) => e.phase === 'POLICY_CHECKED');
    const blocked  = events.find((e) => e.phase === 'BLOCKED');

    expect(proposed?.toolCallId).toBe(checked?.toolCallId);
    expect(checked?.toolCallId).toBe(blocked?.toolCallId);
  });

  it('policyCheckId가 POLICY_CHECKED와 BLOCKED 이벤트에서 동일하다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'update_ad', args: { adId: 'ad-001', content: 'x' } }],
    });

    const events = await writer.getAll();
    const checked = events.find((e) => e.phase === 'POLICY_CHECKED');
    const blocked = events.find((e) => e.phase === 'BLOCKED');

    expect(checked?.policyCheckId).toBeTruthy();
    expect(checked?.policyCheckId).toBe(blocked?.policyCheckId);
  });

  it('PROPOSED 이벤트의 policyCheckId는 null이다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'update_ad', args: { adId: 'ad-001', content: 'x' } }],
    });

    const events = await writer.getAll();
    const proposed = events.find((e) => e.phase === 'PROPOSED');
    expect(proposed?.policyCheckId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. 이벤트 순서 보장
// ---------------------------------------------------------------------------

describe('이벤트 순서 — PROPOSED → POLICY_CHECKED → BLOCKED/EXECUTED', () => {
  it('update_ad 호출 시 이벤트가 올바른 순서로 기록된다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'update_ad', args: { adId: 'ad-001', content: 'x' } }],
    });

    const events = await writer.getAll();
    const phases = events.map((e) => e.phase);
    expect(phases).toEqual(['PROPOSED', 'POLICY_CHECKED', 'BLOCKED']);
  });

  it('search_rule 호출 시 이벤트가 올바른 순서로 기록된다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'search_rule', args: { query: 'test' } }],
    });

    const events = await writer.getAll();
    const phases = events.map((e) => e.phase);
    expect(phases).toEqual(['PROPOSED', 'POLICY_CHECKED', 'EXECUTED']);
  });

  it('step 번호가 0부터 순서대로 증가한다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'search_rule', args: { query: 'test' } }],
    });
    const events = await writer.getAll();
    events.forEach((e, i) => expect(e.step).toBe(i));
  });
});

// ---------------------------------------------------------------------------
// 5. 예외는 ERROR, VIOLATION이 아님
// ---------------------------------------------------------------------------

describe('예외 처리 — ERROR 이벤트 (VIOLATION으로 오인 금지)', () => {
  it('Sandbox에서 예외 발생 시 ERROR 이벤트가 기록되고 VIOLATION은 없다', async () => {
    const searchTool = adAgentRegistry.get('search_rule');
    // execute()가 예외를 던지도록 spy
    const executeSpy = vi.spyOn(searchTool, 'execute').mockRejectedValueOnce(
      new Error('Simulated sandbox failure')
    );

    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'search_rule', args: { query: 'test' } }],
    });

    const events = await writer.getAll();
    const errorEvent = events.find((e) => e.phase === 'ERROR');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.errorMessage).toContain('Simulated sandbox failure');

    // ERROR는 VIOLATION 판정이 아님
    expect(events.filter((e) => e.verdict === 'VIOLATION')).toHaveLength(0);

    executeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 6. agentProposed 플래그
// ---------------------------------------------------------------------------

describe('DETERMINISTIC_TEST — agentProposed는 항상 false', () => {
  it('모든 이벤트에서 agentProposed = false이다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [
        { toolName: 'search_rule',  args: { query: 'test' } },
        { toolName: 'update_ad',    args: { adId: 'ad-001', content: 'x' } },
      ],
    });

    const events = await writer.getAll();
    expect(events.every((e) => e.agentProposed === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. 민감 정보 마스킹
// ---------------------------------------------------------------------------

describe('argsSummary 민감 필드 마스킹', () => {
  it('password 키는 [REDACTED]로 마스킹된다', async () => {
    const writer = new InMemoryEventWriter();
    await runExperiment({
      runMode: 'DETERMINISTIC_TEST',
      ...makeRunnerBase(),
      eventWriter: writer,
      forcedCalls: [{ toolName: 'search_rule', args: { query: 'test', password: 'secret123' } }],
    });

    const events = await writer.getAll();
    const proposed = events.find((e) => e.phase === 'PROPOSED');
    expect(proposed?.argsSummary.password).toBe('[REDACTED]');
    expect(proposed?.argsSummary.query).toBe('test');
  });
});
