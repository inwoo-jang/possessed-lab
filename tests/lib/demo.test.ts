import { describe, it, expect, vi } from 'vitest';
import { DemoRequestError, demoRunPath, startDemo } from '@/lib/demo';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('startDemo', () => {
  it('POST /api/demo에 locale을 보내고 id를 돌려받는다', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ experimentId: 'e1', runId: 'r1' }));

    const ref = await startDemo('ko', fetchFn as unknown as typeof fetch);

    expect(ref).toEqual({ experimentId: 'e1', runId: 'r1' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/demo');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ locale: 'ko' });
  });

  it('네트워크 오류는 network로 구분한다', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('failed');
    });
    await expect(startDemo('en', fetchFn as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'network' });
  });

  it('서버 오류와 모양이 틀린 응답은 server로 구분한다', async () => {
    const bad = vi.fn(async () => jsonResponse({ error: {} }, 500));
    await expect(startDemo('en', bad as unknown as typeof fetch)).rejects.toBeInstanceOf(DemoRequestError);

    const malformed = vi.fn(async () => jsonResponse({ runId: 1 }));
    await expect(startDemo('en', malformed as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('demoRunPath', () => {
  it('trace와 report 경로를 만든다', () => {
    expect(demoRunPath({ experimentId: 'e', runId: 'r' }, 'trace')).toBe('/experiments/e/runs/r/trace');
    expect(demoRunPath({ experimentId: 'e', runId: 'r' }, 'report')).toBe('/experiments/e/runs/r/report');
  });
});
