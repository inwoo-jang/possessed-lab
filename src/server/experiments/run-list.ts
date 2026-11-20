/**
 * 비교 화면의 run 선택 목록 — 최근 run을 실험 이름과 함께 돌려준다.
 */

import { desc, eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { experiments, runs } from '@/db/schema';
import type { Run, RunMode } from '@/lib/types';

export interface RunOption {
  id: string;
  experimentId: string;
  experimentName: string;
  runMode: RunMode;
  status: Run['status'];
  startedAt: string;
}

const MAX_LIMIT = 100;

/** 가장 최근에 시작한 run부터 반환한다. */
export async function listRecentRunOptions(db: DB, limit = 30): Promise<RunOption[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);

  const rows = await db
    .select({
      id: runs.id,
      experimentId: runs.experimentId,
      experimentName: experiments.name,
      runMode: runs.runMode,
      status: runs.status,
      startedAt: runs.startedAt,
    })
    .from(runs)
    .innerJoin(experiments, eq(runs.experimentId, experiments.id))
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .limit(safeLimit);

  return rows.map((row) => ({
    ...row,
    runMode: row.runMode as RunMode,
    status: row.status as Run['status'],
  }));
}
