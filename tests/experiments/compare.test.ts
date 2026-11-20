/**
 * Task 2.3 — Run Compare 검증
 *
 * 핵심:
 *   - 호출은 step 번호가 아니라 (toolName, 같은 도구의 n번째 호출)로 맞춘다
 *   - changed는 판정/결과가 달라졌거나 한쪽에만 있는 호출일 때만 true
 *   - 실행 유형·시나리오가 다르거나 미완료 run이 섞이면 경고한다
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDB } from '../helpers/test-db';
import {
  compareRuns,
  diffCalls,
  diffPolicies,
  summarizeCalls,
} from '@/server/experiments/compare';
import {
  createExperiment,
  executeRun,
  prepareRun,
} from '@/server/experiments/run-service';
import { getScenarioPolicy } from '@/server/experiments/scenarios';
import { NotFoundError } from '@/server/experiments/errors';
import { MockLLMAdapter } from '@/server/agent/llm-client';
import type { ActionEvent, PolicySnapshot, PolicyVerdict } from '@/lib/types';

// ---------------------------------------------------------------------------
// 이벤트 팩토리
// ---------------------------------------------------------------------------

let seq = 0;

function ev(p: Partial<ActionEvent> & Pick<ActionEvent, 'toolCallId' | 'toolName' | 'phase'>): ActionEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    experimentId: 'x',
    runId: 'r',
    policyCheckId: null,
    step: seq,
    argsSummary: {},
    verdict: null,
    policyRuleId: null,
    agentProposed: false,
    runMode: 'DETERMINISTIC_TEST',
    mockResult: null,
    errorMessage: null,
    timestamp: '2026-11-06T00:00:00.000Z',
    ...p,
  };
}

/** 도구 호출 1건이 만드는 이벤트들 (PROPOSED → POLICY_CHECKED → 결과) */
function call(
  toolCallId: string,
  toolName: string,
  verdict: PolicyVerdict,
  result: 'EXECUTED' | 'BLOCKED' | 'ERROR' | null,
  agentProposed = false
): ActionEvent[] {
  const events = [
    ev({ toolCallId, toolName, phase: 'PROPOSED', agentProposed }),
    ev({ toolCallId, toolName, phase: 'POLICY_CHECKED', verdict, agentProposed }),
  ];
  if (result) events.push(ev({ toolCallId, toolName, phase: result, verdict, agentProposed }));
  return events;
}

// ---------------------------------------------------------------------------
// summarizeCalls
// ---------------------------------------------------------------------------

describe('summarizeCalls', () => {
  it('toolCallId가 같은 이벤트 3개를 호출 1건으로 묶는다', () => {
    const calls = summarizeCalls(call('tc1', 'update_ad', 'VIOLATION', 'BLOCKED', true));

    expect(calls).toEqual([
      { toolName: 'update_ad', occurrenceIndex: 0, verdict: 'VIOLATION', outcome: 'BLOCKED', agentProposed: true },
    ]);
  });

  it('같은 도구의 호출은 발생 순서대로 occurrenceIndex가 올라간다', () => {
    const calls = summarizeCalls([
      ...call('tc1', 'update_ad', 'VIOLATION', 'BLOCKED'),
      ...call('tc2', 'search_rule', 'ALLOWED', 'EXECUTED'),
      ...call('tc3', 'update_ad', 'VIOLATION', 'BLOCKED'),
    ]);

    expect(calls.map((c) => `${c.toolName}#${c.occurrenceIndex}`)).toEqual([
      'update_ad#0',
      'search_rule#0',
      'update_ad#1',
    ]);
  });

  it('결과 이벤트가 없으면 INCOMPLETE이다', () => {
    const [c] = summarizeCalls(call('tc1', 'search_rule', 'ALLOWED', null));
    expect(c.outcome).toBe('INCOMPLETE');
    expect(c.verdict).toBe('ALLOWED');
  });

  it('판정 전에 끊긴 호출은 verdict가 null이다', () => {
    const [c] = summarizeCalls([ev({ toolCallId: 'tc1', toolName: 'search_rule', phase: 'PROPOSED' })]);
    expect(c.verdict).toBeNull();
    expect(c.outcome).toBe('INCOMPLETE');
  });

  it('허용됐지만 실행 중 오류가 난 호출은 verdict ALLOWED, outcome ERROR다 (위반이 아니다)', () => {
    const [c] = summarizeCalls(call('tc1', 'search_rule', 'ALLOWED', 'ERROR'));
    expect(c.verdict).toBe('ALLOWED');
    expect(c.outcome).toBe('ERROR');
  });

  it('입력 배열의 순서가 섞여 있어도 step 기준으로 정렬해 요약한다', () => {
    const ordered = [
      ...call('tc1', 'search_rule', 'ALLOWED', 'EXECUTED'),
      ...call('tc2', 'update_ad', 'VIOLATION', 'BLOCKED'),
    ];
    const shuffled = [...ordered].reverse();
    expect(summarizeCalls(shuffled)).toEqual(summarizeCalls(ordered));
  });
});

// ---------------------------------------------------------------------------
// diffCalls
// ---------------------------------------------------------------------------

describe('diffCalls', () => {
  const summarize = (...groups: ActionEvent[][]) => summarizeCalls(groups.flat());

  it('동일한 두 호출 목록은 모두 changed: false다', () => {
    const a = summarize(call('a1', 'search_rule', 'ALLOWED', 'EXECUTED'), call('a2', 'update_ad', 'VIOLATION', 'BLOCKED'));
    const b = summarize(call('b1', 'search_rule', 'ALLOWED', 'EXECUTED'), call('b2', 'update_ad', 'VIOLATION', 'BLOCKED'));

    const diff = diffCalls(a, b);
    expect(diff).toHaveLength(2);
    expect(diff.every((d) => !d.changed)).toBe(true);
  });

  it('판정과 결과가 달라지면 changed: true다', () => {
    const a = summarize(call('a1', 'update_ad', 'VIOLATION', 'BLOCKED'));
    const b = summarize(call('b1', 'update_ad', 'ALLOWED', 'EXECUTED'));

    const [d] = diffCalls(a, b);
    expect(d).toMatchObject({
      toolName: 'update_ad',
      verdictA: 'VIOLATION',
      verdictB: 'ALLOWED',
      outcomeA: 'BLOCKED',
      outcomeB: 'EXECUTED',
      changed: true,
    });
  });

  it('판정은 같지만 결과만 달라도 changed: true다 (EXECUTED vs ERROR)', () => {
    const a = summarize(call('a1', 'search_rule', 'ALLOWED', 'EXECUTED'));
    const b = summarize(call('b1', 'search_rule', 'ALLOWED', 'ERROR'));
    expect(diffCalls(a, b)[0].changed).toBe(true);
  });

  it('agentProposed만 다르면 changed: false이고 값은 그대로 전달된다', () => {
    const a = summarize(call('a1', 'update_ad', 'VIOLATION', 'BLOCKED', false)); // 강제 주입
    const b = summarize(call('b1', 'update_ad', 'VIOLATION', 'BLOCKED', true)); // LLM이 제안

    const [d] = diffCalls(a, b);
    expect(d.changed).toBe(false);
    expect(d.agentProposedA).toBe(false);
    expect(d.agentProposedB).toBe(true);
  });

  it('호출 순서가 달라도 step이 아니라 도구 이름으로 맞춘다', () => {
    const a = summarize(call('a1', 'search_rule', 'ALLOWED', 'EXECUTED'), call('a2', 'update_ad', 'VIOLATION', 'BLOCKED'));
    const b = summarize(call('b1', 'update_ad', 'VIOLATION', 'BLOCKED'), call('b2', 'search_rule', 'ALLOWED', 'EXECUTED'));

    const diff = diffCalls(a, b);
    expect(diff.map((d) => d.toolName)).toEqual(['search_rule', 'update_ad']);
    expect(diff.every((d) => !d.changed)).toBe(true);
  });

  it('B에만 있는 호출은 changed: true이고 A쪽 값은 null이다 (agentProposedA도 null)', () => {
    const a = summarize(call('a1', 'search_rule', 'ALLOWED', 'EXECUTED'));
    const b = summarize(
      call('b1', 'search_rule', 'ALLOWED', 'EXECUTED'),
      call('b2', 'update_ad', 'VIOLATION', 'BLOCKED', true)
    );

    const diff = diffCalls(a, b);
    expect(diff).toHaveLength(2);
    expect(diff[1]).toMatchObject({
      toolName: 'update_ad',
      verdictA: null,
      outcomeA: null,
      agentProposedA: null,
      agentProposedB: true,
      changed: true,
    });
  });

  it('A에만 있는 호출도 changed: true이고 B쪽 값은 null이다', () => {
    const a = summarize(call('a1', 'update_ad', 'VIOLATION', 'BLOCKED'));
    const [d] = diffCalls(a, []);
    expect(d).toMatchObject({ verdictB: null, outcomeB: null, agentProposedB: null, changed: true });
  });

  it('같은 도구를 재시도한 경우 n번째끼리 맞춘다 (두 번째 시도는 B에 없음)', () => {
    const a = summarize(call('a1', 'update_ad', 'VIOLATION', 'BLOCKED'), call('a2', 'update_ad', 'VIOLATION', 'BLOCKED'));
    const b = summarize(call('b1', 'update_ad', 'VIOLATION', 'BLOCKED'));

    const diff = diffCalls(a, b);
    expect(diff.map((d) => [d.occurrenceIndex, d.changed])).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('결과 순서는 A의 순서를 따르고 B에만 있는 호출이 뒤에 붙는다', () => {
    const a = summarize(call('a1', 'read_terms', 'ALLOWED', 'EXECUTED'), call('a2', 'search_rule', 'ALLOWED', 'EXECUTED'));
    const b = summarize(
      call('b1', 'draft_report', 'ALLOWED', 'EXECUTED'),
      call('b2', 'search_rule', 'ALLOWED', 'EXECUTED'),
      call('b3', 'read_terms', 'ALLOWED', 'EXECUTED')
    );

    expect(diffCalls(a, b).map((d) => d.toolName)).toEqual(['read_terms', 'search_rule', 'draft_report']);
  });
});

// ---------------------------------------------------------------------------
// diffPolicies
// ---------------------------------------------------------------------------

describe('diffPolicies', () => {
  const snapshot = (): PolicySnapshot => ({
    ...getScenarioPolicy('scenario-a')!,
    snapshotAt: '2026-11-06T00:00:00.000Z',
  });

  it('같은 정책이면 차이가 없다', () => {
    expect(diffPolicies(snapshot(), snapshot())).toEqual([]);
  });

  it('권한이 달라진 규칙만 반환한다', () => {
    const b = snapshot();
    b.rules = b.rules.map((r) => (r.toolName === 'update_ad' ? { ...r, permission: 'ALLOWED' as const } : r));

    expect(diffPolicies(snapshot(), b)).toEqual([
      {
        toolName: 'update_ad',
        a: { permission: 'DENIED', approvalGranted: null },
        b: { permission: 'ALLOWED', approvalGranted: null },
      },
    ]);
  });

  it('권한은 같고 Mock 승인 상태만 달라도 반환한다', () => {
    const b = snapshot();
    b.rules = b.rules.map((r) =>
      r.toolName === 'approve_ad' ? { ...r, mockApprovalState: { granted: true, grantedBy: 'x', scope: 'y' } } : r
    );

    const [d] = diffPolicies(snapshot(), b);
    expect(d.toolName).toBe('approve_ad');
    expect(d.a).toEqual({ permission: 'REQUIRES_APPROVAL', approvalGranted: false });
    expect(d.b).toEqual({ permission: 'REQUIRES_APPROVAL', approvalGranted: true });
  });

  it('한쪽에만 있는 규칙은 다른 쪽이 null이다', () => {
    const b = snapshot();
    b.rules = b.rules.filter((r) => r.toolName !== 'send_external_message');

    const [d] = diffPolicies(snapshot(), b);
    expect(d.toolName).toBe('send_external_message');
    expect(d.a).not.toBeNull();
    expect(d.b).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compareRuns (DB)
// ---------------------------------------------------------------------------

describe('compareRuns', () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** 시나리오 기본 정책에서 update_ad만 ALLOWED로 바꾼 정책 입력 */
  const loosenedPolicy = () => ({
    name: 'loosened',
    rules: getScenarioPolicy('scenario-a')!.rules.map((r) => ({
      toolName: r.toolName,
      permission: r.toolName === 'update_ad' ? ('ALLOWED' as const) : r.permission,
      ...(r.mockApprovalState ? { mockApprovalState: r.mockApprovalState } : {}),
    })),
  });

  async function runDeterministic(scenarioId = 'scenario-a', policy?: ReturnType<typeof loosenedPolicy>) {
    const { experiment } = await createExperiment(db, { name: 'e', scenarioId, ...(policy ? { policy } : {}) });
    const run = await prepareRun(db, { experimentId: experiment.id, runMode: 'DETERMINISTIC_TEST', locale: 'en', policyReviewConfirmed: false });
    await executeRun(db, run.id);
    return run;
  }

  it('정책 수정 전/후 비교: update_ad의 판정·결과만 바뀌고 정책 diff가 원인을 보여준다', async () => {
    const before = await runDeterministic('scenario-a');
    const after = await runDeterministic('scenario-a', loosenedPolicy());

    const result = await compareRuns(db, before.id, after.id);

    expect(result.warnings).toEqual([]);
    expect(result.diff.map((d) => d.toolName)).toEqual(['search_rule', 'read_terms', 'update_ad', 'draft_report']);
    expect(result.changedCount).toBe(1);

    const changed = result.diff.filter((d) => d.changed);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      toolName: 'update_ad',
      verdictA: 'VIOLATION',
      outcomeA: 'BLOCKED',
      verdictB: 'ALLOWED',
      outcomeB: 'EXECUTED',
    });

    expect(result.policyDiff).toEqual([
      {
        toolName: 'update_ad',
        a: { permission: 'DENIED', approvalGranted: null },
        b: { permission: 'ALLOWED', approvalGranted: null },
      },
    ]);

    expect(result.runA.stats).toMatchObject({ executedCount: 3, blockedCount: 1 });
    expect(result.runB.stats).toMatchObject({ executedCount: 4, blockedCount: 0 });
  });

  it('같은 run끼리 비교하면 모두 changed: false이고 경고가 없다', async () => {
    const run = await runDeterministic();
    const result = await compareRuns(db, run.id, run.id);

    expect(result.changedCount).toBe(0);
    expect(result.diff.every((d) => !d.changed)).toBe(true);
    expect(result.policyDiff).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('같은 정책으로 두 번 실행해도 차이가 없다 (결정적)', async () => {
    const first = await runDeterministic();
    const second = await runDeterministic();
    expect((await compareRuns(db, first.id, second.id)).changedCount).toBe(0);
  });

  it('실행 유형이 다르면 RUN_MODE_MISMATCH 경고를 포함한다', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const det = await runDeterministic();

    const { experiment } = await createExperiment(db, { name: 'live', scenarioId: 'scenario-a' });
    const live = await prepareRun(db, { experimentId: experiment.id, runMode: 'LIVE_EXPERIMENT', locale: 'en', policyReviewConfirmed: false });
    await executeRun(db, live.id, {
      createLlmAdapter: () =>
        new MockLLMAdapter([
          { type: 'tool_calls', toolCalls: [{ name: 'update_ad', args: { adId: 'a', content: 'b' } }] },
          { type: 'final_answer', content: 'done' },
        ]),
    });

    const result = await compareRuns(db, det.id, live.id);

    expect(result.warnings.map((w) => w.code)).toContain('RUN_MODE_MISMATCH');
    // 강제 주입 vs LLM 제안: 정책 결과가 같으면 changed가 아니다
    const updateAd = result.diff.find((d) => d.toolName === 'update_ad')!;
    expect(updateAd.changed).toBe(false);
    expect(updateAd.agentProposedA).toBe(false);
    expect(updateAd.agentProposedB).toBe(true);
    // LLM이 제안한 시도만 과잉 행동 시도로 집계된다
    expect(result.runA.stats.overreachAttempts).toBe(0);
    expect(result.runB.stats.overreachAttempts).toBe(1);
    // LLM run에는 search_rule 등이 없으므로 A에만 있는 호출은 changed다
    expect(result.diff.find((d) => d.toolName === 'search_rule')).toMatchObject({ changed: true, outcomeB: null });
  });

  it('시나리오가 다르면 SCENARIO_MISMATCH 경고를 포함한다', async () => {
    const a = await runDeterministic('scenario-a');
    const b = await runDeterministic('scenario-b');

    const result = await compareRuns(db, a.id, b.id);
    expect(result.warnings.map((w) => w.code)).toContain('SCENARIO_MISMATCH');
    expect(result.runA.scenarioId).toBe('scenario-a');
    expect(result.runB.scenarioId).toBe('scenario-b');
  });

  it('미완료 run이 섞이면 RUN_NOT_COMPLETED 경고를 포함한다', async () => {
    const done = await runDeterministic();
    const { experiment } = await createExperiment(db, { name: 'pending', scenarioId: 'scenario-a' });
    const pending = await prepareRun(db, { experimentId: experiment.id, runMode: 'DETERMINISTIC_TEST', locale: 'en', policyReviewConfirmed: false });

    const result = await compareRuns(db, done.id, pending.id);
    const warning = result.warnings.find((w) => w.code === 'RUN_NOT_COMPLETED');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain(pending.id);
    expect(warning!.message).not.toContain(done.id);
  });

  it('존재하지 않는 run이면 어느 쪽이든 NotFoundError다', async () => {
    const run = await runDeterministic();
    await expect(compareRuns(db, 'missing', run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(compareRuns(db, run.id, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
