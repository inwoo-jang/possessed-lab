/**
 * Dashboard 조회 — 최근 실험 요약과 과잉 행동 시도 요약
 *
 * 요약 수치의 의미를 지키는 규칙:
 *   - 과잉 행동 시도는 "완료된 LIVE_EXPERIMENT run"에서만 집계한다.
 *   - DETERMINISTIC_TEST는 호출을 강제로 주입하므로 Agent의 행동을 측정하지 않는다.
 *   - FAILED/미완료 run은 관측이 끝나지 않았으므로 "과잉 행동 없음"으로 세지 않는다.
 *   - 완료됐더라도 Agent가 도구를 한 번도 호출하지 않은 run은 관측된 것이 없으므로 세지 않는다.
 *     (실제 모델이 검토 대상을 몰라 되묻기만 하고 끝난 사례가 있었다)
 *   - 그래서 시도 횟수만 돌려주지 않고, 몇 번의 run에서 나온 값인지(observedLiveRuns)를 함께 준다.
 *     observedLiveRuns가 0이면 "0건"이 아니라 "아직 측정된 것이 없음"이다.
 *
 * MVP 규모를 가정해 run별로 이벤트를 읽어 집계한다 (정의는 lib/event-stats.ts 한 곳).
 */

import { and, desc, eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { experiments, runs } from '@/db/schema';
import { summarizeEvents, type EventStats } from '@/lib/event-stats';
import type { Experiment, Run, RunMode } from '@/lib/types';
import { getRunEvents, listRunsByExperiment } from './service';

export interface LastRunSummary {
  id: string;
  runMode: RunMode;
  status: Run['status'];
  startedAt: string;
  stats: EventStats;
}

export interface ExperimentSummary {
  experiment: Experiment;
  /** 실행 기록이 없으면 null */
  lastRun: LastRunSummary | null;
}

export interface OverreachSummary {
  /**
   * 집계 대상: 완료되었고, Agent가 도구를 한 번 이상 호출한 LIVE_EXPERIMENT run 수.
   * 0이면 아직 측정된 것이 없다 ("0건"이 아니다).
   */
  observedLiveRuns: number;
  /**
   * 완료되었지만 Agent가 도구를 전혀 호출하지 않은 LIVE_EXPERIMENT run 수.
   * Agent의 행동을 관측하지 못한 것이므로 집계에서 제외하고 따로 알린다.
   * (예: 검토 대상을 몰라 되묻기만 하고 끝난 경우)
   */
  inconclusiveLiveRuns: number;
  /** 집계 대상 run들에서 Agent가 스스로 제안했지만 정책이 차단한 호출 수 */
  overreachAttempts: number;
}

const MAX_LIMIT = 20;

/** 가장 최근에 만든 실험부터, 각 실험의 마지막 run 요약과 함께 반환한다. */
export async function listRecentExperimentSummaries(db: DB, limit = 3): Promise<ExperimentSummary[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);

  const rows = await db
    .select()
    .from(experiments)
    .orderBy(desc(experiments.createdAt), desc(experiments.id))
    .limit(safeLimit);

  const summaries: ExperimentSummary[] = [];
  for (const row of rows) {
    const experiment: Experiment = {
      id: row.id,
      name: row.name,
      scenarioId: row.scenarioId,
      policyId: row.policyId,
      createdAt: row.createdAt,
    };

    const experimentRuns = await listRunsByExperiment(db, experiment.id);
    const last = [...experimentRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

    summaries.push({
      experiment,
      lastRun: last
        ? {
            id: last.id,
            runMode: last.runMode,
            status: last.status,
            startedAt: last.startedAt,
            stats: summarizeEvents(await getRunEvents(db, last.id)),
          }
        : null,
    });
  }

  return summaries;
}

/**
 * 완료된 LIVE_EXPERIMENT run에서 과잉 행동 시도를 집계한다.
 * 도구를 한 번도 호출하지 않은 run은 관측된 것이 없으므로 집계 대상에서 빼고 따로 센다.
 */
export async function getOverreachSummary(db: DB): Promise<OverreachSummary> {
  const liveRuns = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.runMode, 'LIVE_EXPERIMENT'), eq(runs.status, 'COMPLETED')));

  let observedLiveRuns = 0;
  let inconclusiveLiveRuns = 0;
  let overreachAttempts = 0;

  for (const run of liveRuns) {
    const stats = summarizeEvents(await getRunEvents(db, run.id));
    if (stats.toolCallCount === 0) {
      inconclusiveLiveRuns += 1;
      continue;
    }
    observedLiveRuns += 1;
    overreachAttempts += stats.overreachAttempts;
  }

  return { observedLiveRuns, inconclusiveLiveRuns, overreachAttempts };
}
