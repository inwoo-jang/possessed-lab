/**
 * Task 2.2 — Route Handler 검증
 *
 * 핸들러 함수를 직접 호출한다. 다음 두 가지를 목으로 대체한다:
 *   - next/server의 after(): 요청 범위 밖에서는 쓸 수 없으므로, 예약된 작업을 모았다가 직접 기다린다
 *   - @/db/client의 getDb(): 인메모리 DB를 주입한다
 *
 * LIVE_EXPERIMENT는 검증 단계에서 거부되는 경우만 다룬다.
 * 통과하면 실제 OpenAI를 호출하는 after() 작업이 예약되기 때문이다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  db: null as unknown,
  failDb: false,
}));

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    h.pending.push(Promise.resolve().then(fn));
  },
}));

vi.mock('@/db/client', () => ({
  getDb: () => {
    if (h.failDb) throw new Error('boom: connection string postgres://user:pw@host sk-leak123456');
    return h.db;
  },
}));

import { POST as postExperiment } from '@/app/api/experiments/route';
import { POST as postRun } from '@/app/api/runs/route';
import { GET as getRun } from '@/app/api/runs/[runId]/route';
import { GET as getRunEvents } from '@/app/api/runs/[runId]/events/route';
import { MAX_BODY_BYTES } from '@/server/api/http';
import { createTestDb } from '../helpers/test-db';

beforeEach(() => {
  h.db = createTestDb();
  h.pending = [];
  h.failDb = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 요청 헬퍼
// ---------------------------------------------------------------------------

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

async function createExperimentId(scenarioId = 'scenario-a'): Promise<string> {
  const res = await postExperiment(post('/api/experiments', { name: 'exp', scenarioId }));
  expect(res.status).toBe(201);
  return (await json(res)).experimentId;
}

// ---------------------------------------------------------------------------
// POST /api/experiments
// ---------------------------------------------------------------------------

describe('POST /api/experiments', () => {
  it('정책 없이 만들면 201과 experimentId/policyId를 반환한다', async () => {
    const res = await postExperiment(post('/api/experiments', { name: '실험 1', scenarioId: 'scenario-b' }));
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.experimentId).toBeTruthy();
    expect(body.policyId).toMatch(/^policy-/);
    expect(body.experiment.scenarioId).toBe('scenario-b');
  });

  it('JSON이 아니면 400 INVALID_JSON', async () => {
    const res = await postExperiment(post('/api/experiments', '{ not json'));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('INVALID_JSON');
  });

  it('필수 필드가 없으면 422 VALIDATION_ERROR와 문제 위치를 알려준다', async () => {
    const res = await postExperiment(post('/api/experiments', { scenarioId: 'scenario-a' }));
    const body = await json(res);

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues.map((i: { path: string }) => i.path)).toContain('name');
  });

  it('REQUIRES_APPROVAL 규칙에 mockApprovalState가 없으면 422', async () => {
    const res = await postExperiment(
      post('/api/experiments', {
        name: 'x',
        scenarioId: 'scenario-a',
        policy: { name: 'p', rules: [{ toolName: 'approve_ad', permission: 'REQUIRES_APPROVAL' }] },
      })
    );
    expect(res.status).toBe(422);
    const paths = (await json(res)).error.issues.map((i: { path: string }) => i.path);
    expect(paths.join(',')).toContain('mockApprovalState');
  });

  it('같은 도구가 두 규칙에 있으면 422', async () => {
    const res = await postExperiment(
      post('/api/experiments', {
        name: 'x',
        scenarioId: 'scenario-a',
        policy: {
          name: 'p',
          rules: [
            { toolName: 'update_ad', permission: 'DENIED' },
            { toolName: 'update_ad', permission: 'ALLOWED' },
          ],
        },
      })
    );
    expect(res.status).toBe(422);
  });

  it('등록되지 않은 도구는 422 UNKNOWN_TOOL', async () => {
    const res = await postExperiment(
      post('/api/experiments', {
        name: 'x',
        scenarioId: 'scenario-a',
        policy: { name: 'p', rules: [{ toolName: 'format_disk', permission: 'ALLOWED' }] },
      })
    );
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe('UNKNOWN_TOOL');
  });

  it('존재하지 않는 시나리오는 404', async () => {
    const res = await postExperiment(post('/api/experiments', { name: 'x', scenarioId: 'scenario-z' }));
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('NOT_FOUND');
  });

  it('본문이 너무 크면 413', async () => {
    const huge = JSON.stringify({ name: 'x'.repeat(MAX_BODY_BYTES), scenarioId: 'scenario-a' });
    const res = await postExperiment(post('/api/experiments', huge));
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

// ---------------------------------------------------------------------------
// POST /api/runs → GET /api/runs/[runId] → GET .../events
// ---------------------------------------------------------------------------

describe('DETERMINISTIC_TEST 전체 흐름', () => {
  it('202로 runId를 즉시 반환하고, 백그라운드 실행 후 COMPLETED와 이벤트를 조회할 수 있다', async () => {
    const experimentId = await createExperimentId('scenario-a');

    const res = await postRun(post('/api/runs', { experimentId, runMode: 'DETERMINISTIC_TEST' }));
    const accepted = await json(res);
    expect(res.status).toBe(202);
    expect(accepted.status).toBe('PENDING');

    // 응답 시점에는 실행이 끝나지 않았다 (실행은 after()로 예약됨)
    const before = await json(await getRun(new Request('http://localhost'), ctx(accepted.runId)));
    expect(before.status).toBe('PENDING');
    expect(h.pending).toHaveLength(1);

    await Promise.all(h.pending);

    const run = await json(await getRun(new Request('http://localhost'), ctx(accepted.runId)));
    expect(run.status).toBe('COMPLETED');
    expect(run.runMode).toBe('DETERMINISTIC_TEST');
    expect(run.policySnapshot.rules).toHaveLength(6);
    expect(run.metadata.model).toBeNull();

    const eventsRes = await getRunEvents(new Request('http://localhost'), ctx(accepted.runId));
    const events = await json(eventsRes);
    expect(eventsRes.status).toBe(200);
    expect(events.status).toBe('COMPLETED');
    expect(events.events).toHaveLength(12);
    expect(events.events.map((e: { step: number }) => e.step)).toEqual([...Array(12).keys()]);

    const blocked = events.events.filter((e: { phase: string }) => e.phase === 'BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ toolName: 'update_ad', verdict: 'VIOLATION', agentProposed: false });
  });
});

describe('POST /api/runs — 거부 케이스', () => {
  it('REPLAY_DEMO로는 run을 만들 수 없다 (422)', async () => {
    const experimentId = await createExperimentId();
    const res = await postRun(post('/api/runs', { experimentId, runMode: 'REPLAY_DEMO' }));

    expect(res.status).toBe(422);
    expect(h.pending).toHaveLength(0);
  });

  it('존재하지 않는 실험은 404이고 실행이 예약되지 않는다', async () => {
    const res = await postRun(post('/api/runs', { experimentId: 'nope', runMode: 'DETERMINISTIC_TEST' }));
    expect(res.status).toBe(404);
    expect(h.pending).toHaveLength(0);
  });

  it('runMode가 없으면 422', async () => {
    const res = await postRun(post('/api/runs', { experimentId: 'x' }));
    expect(res.status).toBe(422);
  });

  it('LIVE_EXPERIMENT는 API 키가 없으면 503이고 실행이 예약되지 않는다', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const experimentId = await createExperimentId();
    const res = await postRun(post('/api/runs', { experimentId, runMode: 'LIVE_EXPERIMENT' }));

    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe('LIVE_UNAVAILABLE');
    expect(h.pending).toHaveLength(0);
  });

  it('모호한 변형은 확인 없이는 422 POLICY_REVIEW_REQUIRED이고 실행이 예약되지 않는다', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const experimentId = await createExperimentId();
    const res = await postRun(
      post('/api/runs', { experimentId, runMode: 'LIVE_EXPERIMENT', variantId: 'a-vague' })
    );

    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe('POLICY_REVIEW_REQUIRED');
    expect(h.pending).toHaveLength(0);
  });

  it('DETERMINISTIC_TEST에 variantId를 보내면 422', async () => {
    const experimentId = await createExperimentId();
    const res = await postRun(
      post('/api/runs', { experimentId, runMode: 'DETERMINISTIC_TEST', variantId: 'a-vague' })
    );
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe('VARIANT_NOT_APPLICABLE');
  });
});

describe('GET 조회 — 없는 run', () => {
  it('GET /api/runs/[runId]는 404', async () => {
    const res = await getRun(new Request('http://localhost'), ctx('missing'));
    expect(res.status).toBe(404);
  });

  it('GET /api/runs/[runId]/events는 404', async () => {
    const res = await getRunEvents(new Request('http://localhost'), ctx('missing'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 예상하지 못한 오류
// ---------------------------------------------------------------------------

describe('500 응답', () => {
  it('내부 오류 메시지(연결 문자열·키)를 클라이언트에 노출하지 않는다', async () => {
    h.failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await postExperiment(post('/api/experiments', { name: 'x', scenarioId: 'scenario-a' }));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('postgres://');
    expect(text).not.toContain('sk-leak');
    expect(text).not.toContain('boom');
  });

  it('서버 로그에도 키는 마스킹된다', async () => {
    h.failDb = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await postExperiment(post('/api/experiments', { name: 'x', scenarioId: 'scenario-a' }));

    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('[api] unexpected error');
    expect(logged).not.toContain('sk-leak123456');
  });
});
