/**
 * Task 3.7 — POST /api/demo 라우트 검증
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db/client', () => ({ getDb: () => h.db }));

import { POST as postDemo } from '@/app/api/demo/route';
import { POST as postRun } from '@/app/api/runs/route';
import { createTestDb } from '../helpers/test-db';
import { getRunById, getRunEvents } from '@/server/experiments/service';
import type { DB } from '@/db/client';

beforeEach(() => {
  h.db = createTestDb();
});

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/demo', () => {
  it('REPLAY_DEMO run을 만들고 201과 id를 돌려준다', async () => {
    const res = await postDemo(post('/api/demo', { locale: 'ko' }));
    const body = (await res.json()) as Record<string, string>;

    expect(res.status).toBe(201);
    expect(body.runMode).toBe('REPLAY_DEMO');

    const run = await getRunById(h.db as DB, body.runId);
    expect(run?.runMode).toBe('REPLAY_DEMO');
    expect(run?.metadata.locale).toBe('ko');
    expect((await getRunEvents(h.db as DB, body.runId)).length).toBeGreaterThan(0);
  });

  it('다시 호출하면 200으로 같은 run을 돌려준다 (행이 늘지 않는다)', async () => {
    const first = (await (await postDemo(post('/api/demo', { locale: 'en' }))).json()) as Record<string, string>;
    const res = await postDemo(post('/api/demo', { locale: 'en' }));
    const second = (await res.json()) as Record<string, string>;

    expect(res.status).toBe(200);
    expect(second.runId).toBe(first.runId);
  });

  it('locale을 생략하면 en이다', async () => {
    const body = (await (await postDemo(post('/api/demo', {}))).json()) as Record<string, string>;
    expect((await getRunById(h.db as DB, body.runId))?.metadata.locale).toBe('en');
  });

  it('지원하지 않는 locale은 422다', async () => {
    const res = await postDemo(post('/api/demo', { locale: 'fr' }));
    expect(res.status).toBe(422);
  });

  it('JSON이 아니면 400이다', async () => {
    const res = await postDemo(post('/api/demo', 'not json'));
    expect(res.status).toBe(400);
  });

  it('/api/runs로는 REPLAY_DEMO를 만들 수 없다', async () => {
    const res = await postRun(post('/api/runs', { experimentId: 'demo-experiment', runMode: 'REPLAY_DEMO' }));
    expect(res.status).toBe(422);
  });
});
