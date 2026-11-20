/**
 * Task 2.3 — GET /api/compare 라우트 검증
 * (next/server와 DB는 routes.test.ts와 같은 방식으로 대체한다)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  db: null as unknown,
}));

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    h.pending.push(Promise.resolve().then(fn));
  },
}));

vi.mock('@/db/client', () => ({ getDb: () => h.db }));

import { GET as compare } from '@/app/api/compare/route';
import { POST as postExperiment } from '@/app/api/experiments/route';
import { POST as postRun } from '@/app/api/runs/route';
import { createTestDb } from '../helpers/test-db';

beforeEach(() => {
  h.db = createTestDb();
  h.pending = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function completedRun(): Promise<string> {
  const exp = await json(await postExperiment(post('/api/experiments', { name: 'e', scenarioId: 'scenario-a' })));
  const run = await json(await postRun(post('/api/runs', { experimentId: exp.experimentId, runMode: 'DETERMINISTIC_TEST' })));
  await Promise.all(h.pending);
  h.pending = [];
  return run.runId;
}

const get = (query: string) => compare(new Request(`http://localhost/api/compare${query}`));

describe('GET /api/compare', () => {
  it('두 run을 비교한 결과를 200으로 반환한다', async () => {
    const a = await completedRun();
    const b = await completedRun();

    const res = await get(`?runA=${a}&runB=${b}`);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.runA.id).toBe(a);
    expect(body.runB.id).toBe(b);
    expect(body.diff).toHaveLength(4);
    expect(body.changedCount).toBe(0);
    expect(body.warnings).toEqual([]);
    expect(body.policyDiff).toEqual([]);
    expect(body.runA.stats).toMatchObject({ executedCount: 3, blockedCount: 1, overreachAttempts: 0 });
  });

  it('쿼리 파라미터가 없으면 422이고 어떤 파라미터가 문제인지 알려준다', async () => {
    const res = await get('');
    const body = await json(res);

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(['runA', 'runB']);
  });

  it('한쪽 파라미터만 없어도 422다', async () => {
    const a = await completedRun();
    const res = await get(`?runA=${a}`);

    expect(res.status).toBe(422);
    expect((await json(res)).error.issues.map((i: { path: string }) => i.path)).toEqual(['runB']);
  });

  it('존재하지 않는 run이면 404다', async () => {
    const a = await completedRun();
    const res = await get(`?runA=${a}&runB=missing`);

    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('NOT_FOUND');
  });

  it('쿼리 값은 요청마다 읽는다 (다른 run을 요청하면 다른 결과)', async () => {
    const a = await completedRun();
    const b = await completedRun();

    const first = await json(await get(`?runA=${a}&runB=${b}`));
    const second = await json(await get(`?runA=${b}&runB=${a}`));

    expect(first.runA.id).toBe(a);
    expect(second.runA.id).toBe(b);
  });
});
