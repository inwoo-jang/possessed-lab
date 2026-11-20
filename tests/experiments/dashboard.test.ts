/**
 * Task 3.1 — Dashboard 조회 검증
 *
 * 핵심: 과잉 행동 요약은 "완료된 LIVE run"만 센다.
 *   - FAILED/진행 중 run은 관측이 끝나지 않았으므로 세지 않는다
 *   - DETERMINISTIC_TEST는 호출을 강제로 주입하므로 세지 않는다
 *   - 완료됐더라도 도구를 한 번도 호출하지 않은 run은 관측된 것이 없으므로 세지 않고 따로 센다
 *   - 집계 대상 run이 없으면 observedLiveRuns가 0이다 ("0건"이 아니라 "측정된 것 없음")
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDB } from '../helpers/test-db';
import {
  getOverreachSummary,
  listRecentExperimentSummaries,
} from '@/server/experiments/dashboard';
import {
  saveActionEvent,
  saveExperiment,
  savePolicy,
  saveRun,
} from '@/server/experiments/service';
import { getScenarioPolicy } from '@/server/experiments/scenarios';
import type { ActionEvent, Run, RunMode } from '@/lib/types';

let db: TestDB;
let seq = 0;

beforeEach(async () => {
  db = createTestDb();
  seq = 0;
  // 모든 실험이 공유하는 정책 한 개
  await savePolicy(db, { ...getScenarioPolicy('scenario-a')!, id: 'policy-shared' });
});

// ---------------------------------------------------------------------------
// 시드 헬퍼 — 시각을 직접 지정해 정렬이 우연에 기대지 않게 한다
// ---------------------------------------------------------------------------

async function seedExperiment(id: string, createdAt: string, scenarioId = 'scenario-a') {
  await saveExperiment(db, { id, name: `exp ${id}`, scenarioId, policyId: 'policy-shared', createdAt });
}

interface SeedRunOptions {
  id: string;
  experimentId: string;
  runMode: RunMode;
  status: Run['status'];
  startedAt: string;
  /** Agent가 스스로 제안했고 차단된 호출 수 (agentProposed: true) */
  overreach?: number;
  /** 강제 주입되어 차단된 호출 수 (agentProposed: false) */
  injectedBlocked?: number;
  executed?: number;
}

async function seedRun(o: SeedRunOptions) {
  const policy = getScenarioPolicy('scenario-a')!;
  await saveRun(db, {
    id: o.id,
    experimentId: o.experimentId,
    runMode: o.runMode,
    metadata: {
      model: null, temperature: null, promptVersion: 'v1', policyVersion: 1,
      locale: 'en', variantId: null, userRequest: null, policyReviewConfirmed: false,
    },
    policySnapshot: { ...policy, snapshotAt: o.startedAt },
    status: o.status,
    startedAt: o.startedAt,
    completedAt: o.status === 'COMPLETED' ? o.startedAt : null,
  });

  const event = (phase: ActionEvent['phase'], agentProposed: boolean): ActionEvent => {
    seq += 1;
    return {
      id: `evt-${seq}`, experimentId: o.experimentId, runId: o.id,
      toolCallId: `tc-${seq}`, policyCheckId: null, step: seq,
      toolName: phase === 'EXECUTED' ? 'search_rule' : 'update_ad', argsSummary: {},
      phase, verdict: phase === 'BLOCKED' ? 'VIOLATION' : 'ALLOWED', policyRuleId: null,
      agentProposed, runMode: o.runMode, mockResult: null, errorMessage: null,
      timestamp: o.startedAt,
    };
  };

  for (let i = 0; i < (o.overreach ?? 0); i++) await saveActionEvent(db, event('BLOCKED', true));
  for (let i = 0; i < (o.injectedBlocked ?? 0); i++) await saveActionEvent(db, event('BLOCKED', false));
  for (let i = 0; i < (o.executed ?? 0); i++) await saveActionEvent(db, event('EXECUTED', o.runMode === 'LIVE_EXPERIMENT'));
}

// ---------------------------------------------------------------------------
// listRecentExperimentSummaries
// ---------------------------------------------------------------------------

describe('listRecentExperimentSummaries', () => {
  it('실험이 없으면 빈 배열이다', async () => {
    expect(await listRecentExperimentSummaries(db)).toEqual([]);
  });

  it('가장 최근에 만든 실험부터 limit개만 반환한다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedExperiment('e2', '2026-11-02T00:00:00.000Z');
    await seedExperiment('e3', '2026-11-03T00:00:00.000Z');
    await seedExperiment('e4', '2026-11-04T00:00:00.000Z');

    const result = await listRecentExperimentSummaries(db, 3);
    expect(result.map((s) => s.experiment.id)).toEqual(['e4', 'e3', 'e2']);
  });

  it('기본 limit은 3이다', async () => {
    for (let i = 1; i <= 5; i++) await seedExperiment(`e${i}`, `2026-11-0${i}T00:00:00.000Z`);
    expect(await listRecentExperimentSummaries(db)).toHaveLength(3);
  });

  it('limit은 1~20으로 보정된다', async () => {
    for (let i = 1; i <= 25; i++) {
      await seedExperiment(`e${String(i).padStart(2, '0')}`, `2026-11-01T00:${String(i).padStart(2, '0')}:00.000Z`);
    }
    expect(await listRecentExperimentSummaries(db, 0)).toHaveLength(1);
    expect(await listRecentExperimentSummaries(db, -5)).toHaveLength(1);
    expect(await listRecentExperimentSummaries(db, 1000)).toHaveLength(20);
  });

  it('실행 기록이 없는 실험은 lastRun이 null이다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    const [summary] = await listRecentExperimentSummaries(db);
    expect(summary.lastRun).toBeNull();
  });

  it('여러 run 중 시작 시각이 가장 늦은 run을 lastRun으로 고른다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'r-old', experimentId: 'e1', runMode: 'DETERMINISTIC_TEST', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', executed: 1 });
    await seedRun({ id: 'r-new', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T03:00:00.000Z', overreach: 2, executed: 3 });
    await seedRun({ id: 'r-mid', experimentId: 'e1', runMode: 'DETERMINISTIC_TEST', status: 'COMPLETED', startedAt: '2026-11-01T02:00:00.000Z' });

    const [summary] = await listRecentExperimentSummaries(db);
    expect(summary.lastRun).toMatchObject({
      id: 'r-new',
      runMode: 'LIVE_EXPERIMENT',
      status: 'COMPLETED',
      stats: { overreachAttempts: 2, executedCount: 3, blockedCount: 2, toolCallCount: 5 },
    });
  });

  it('다른 실험의 run이 섞이지 않는다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedExperiment('e2', '2026-11-02T00:00:00.000Z');
    await seedRun({ id: 'r1', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-03T00:00:00.000Z', overreach: 4 });

    const [e2, e1] = await listRecentExperimentSummaries(db);
    expect(e2.experiment.id).toBe('e2');
    expect(e2.lastRun).toBeNull();
    expect(e1.lastRun?.stats.overreachAttempts).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getOverreachSummary
// ---------------------------------------------------------------------------

describe('getOverreachSummary', () => {
  it('run이 하나도 없으면 observedLiveRuns가 0이다', async () => {
    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });

  it('완료된 LIVE run의 시도만 합산하고, run 수를 함께 반환한다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'a', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', overreach: 2, executed: 3 });
    await seedRun({ id: 'b', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T02:00:00.000Z', overreach: 1 });
    await seedRun({ id: 'c', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T03:00:00.000Z', executed: 3 });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 3, inconclusiveLiveRuns: 0, overreachAttempts: 3 });
  });

  it('FAILED·RUNNING·PENDING LIVE run은 세지 않는다 (관측이 끝나지 않음)', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'ok', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', overreach: 1 });
    await seedRun({ id: 'failed', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'FAILED', startedAt: '2026-11-01T02:00:00.000Z', overreach: 5 });
    await seedRun({ id: 'running', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'RUNNING', startedAt: '2026-11-01T03:00:00.000Z', overreach: 7 });
    await seedRun({ id: 'pending', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'PENDING', startedAt: '2026-11-01T04:00:00.000Z', overreach: 9 });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 1, inconclusiveLiveRuns: 0, overreachAttempts: 1 });
  });

  it('DETERMINISTIC_TEST는 세지 않는다 (강제 주입은 Agent의 시도가 아니다)', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'det', experimentId: 'e1', runMode: 'DETERMINISTIC_TEST', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', injectedBlocked: 4, executed: 3 });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });

  it('REPLAY_DEMO는 세지 않는다 (사전 기록은 실제 관측이 아니다)', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'demo', experimentId: 'e1', runMode: 'REPLAY_DEMO', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', overreach: 3 });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });

  it('도구를 사용했지만 시도가 없으면 observedLiveRuns > 0, overreachAttempts = 0이다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'a', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', executed: 3 });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 1, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });

  // 실제 모델(gpt-4o)에서 나온 사례: 검토 대상을 몰라 도구를 쓰지 않고 되묻기만 하고 끝났다.
  // run은 COMPLETED지만 Agent의 행동을 관측하지 못한 것이다.
  it('완료됐지만 도구를 한 번도 호출하지 않은 run은 집계하지 않고 따로 센다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'asked-back', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z' });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 1, overreachAttempts: 0 });
  });

  it('도구를 쓴 run과 쓰지 않은 run이 섞이면 각각 올바르게 센다', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'used-1', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T01:00:00.000Z', overreach: 1, executed: 2 });
    await seedRun({ id: 'used-2', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T02:00:00.000Z', executed: 2 });
    await seedRun({ id: 'asked-back', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', startedAt: '2026-11-01T03:00:00.000Z' });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 2, inconclusiveLiveRuns: 1, overreachAttempts: 1 });
  });

  it('FAILED run은 호출이 0건이어도 "제외된 run"으로도 세지 않는다 (완료된 run만 대상)', async () => {
    await seedExperiment('e1', '2026-11-01T00:00:00.000Z');
    await seedRun({ id: 'failed', experimentId: 'e1', runMode: 'LIVE_EXPERIMENT', status: 'FAILED', startedAt: '2026-11-01T01:00:00.000Z' });

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });
});
