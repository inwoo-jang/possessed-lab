import { describe, it, expect, vi } from 'vitest';
import { fetchRunEvents, isTerminalStatus, pollDelay, MAX_POLL_ATTEMPTS } from '@/lib/trace-polling';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('isTerminalStatus', () => {
  it.each([
    ['COMPLETED', true],
    ['FAILED', true],
    ['PENDING', false],
    ['RUNNING', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isTerminalStatus(status)).toBe(expected);
  });
});

describe('pollDelay', () => {
  it('정상일 때는 기본 간격이다', () => {
    expect(pollDelay(0)).toBe(1500);
  });

  it('연속 실패하면 간격이 늘어난다', () => {
    expect(pollDelay(1)).toBe(3000);
    expect(pollDelay(2)).toBe(6000);
  });

  it('간격은 8초를 넘지 않는다 (서버가 오래 죽어 있어도)', () => {
    expect(pollDelay(3)).toBe(8000);
    expect(pollDelay(20)).toBe(8000);
  });

  it('기본 간격을 바꿀 수 있다', () => {
    expect(pollDelay(0, 500)).toBe(500);
  });

  it('최대 시도 횟수는 유한하다 (무한 폴링 방지)', () => {
    expect(Number.isFinite(MAX_POLL_ATTEMPTS)).toBe(true);
    expect(MAX_POLL_ATTEMPTS).toBeGreaterThan(0);
  });
});

describe('fetchRunEvents', () => {
  it('정상 응답이면 상태와 이벤트를 돌려준다', async () => {
    const fetchImpl = vi.fn(async () => json({ runId: 'r1', status: 'RUNNING', events: [{ id: 'e1' }] })) as unknown as typeof fetch;

    const result = await fetchRunEvents('r1', { fetchImpl });

    expect(result).toEqual({ ok: true, status: 'RUNNING', events: [{ id: 'e1' }] });
  });

  it('올바른 경로로 요청하고 캐시를 쓰지 않는다', async () => {
    const fetchImpl = vi.fn(async () => json({ status: 'COMPLETED', events: [] }));
    await fetchRunEvents('run-1', { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledWith('/api/runs/run-1/events', expect.objectContaining({ cache: 'no-store' }));
  });

  it('runId는 URL 인코딩한다 (경로를 벗어나는 값을 막는다)', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: 'COMPLETED', events: [] }));
    await fetchRunEvents('../secret?x=1', { fetchImpl: fetchImpl as unknown as typeof fetch });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe('/api/runs/..%2Fsecret%3Fx%3D1/events');
  });

  it('AbortSignal을 전달한다', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: 'COMPLETED', events: [] }));
    await fetchRunEvents('r1', { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });

    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it('네트워크 오류는 실패로 취급한다 (던지지 않는다)', async () => {
    const fetchImpl = (async () => { throw new TypeError('network down'); }) as unknown as typeof fetch;
    expect(await fetchRunEvents('r1', { fetchImpl })).toEqual({ ok: false });
  });

  it('취소(abort)도 실패로 취급한다', async () => {
    const fetchImpl = (async () => { throw new DOMException('aborted', 'AbortError'); }) as unknown as typeof fetch;
    expect(await fetchRunEvents('r1', { fetchImpl })).toEqual({ ok: false });
  });

  it.each([404, 500, 503])('HTTP %s 는 실패로 취급한다', async (status) => {
    const fetchImpl = (async () => json({ error: { code: 'X' } }, status)) as unknown as typeof fetch;
    expect(await fetchRunEvents('r1', { fetchImpl })).toEqual({ ok: false });
  });

  it('JSON이 아닌 응답(프록시 오류 페이지 등)은 실패로 취급한다', async () => {
    const fetchImpl = (async () => new Response('<html>bad gateway</html>', { status: 200 })) as unknown as typeof fetch;
    expect(await fetchRunEvents('r1', { fetchImpl })).toEqual({ ok: false });
  });

  it.each([
    ['null', null],
    ['events가 배열이 아님', { status: 'RUNNING', events: 'nope' }],
    ['events가 없음', { status: 'RUNNING' }],
    ['status가 없음', { events: [] }],
    ['알 수 없는 status', { status: 'DONE', events: [] }],
    ['status가 문자열이 아님', { status: 1, events: [] }],
  ])('형태가 잘못된 응답(%s)은 실패로 취급한다', async (_label, body) => {
    const fetchImpl = (async () => json(body)) as unknown as typeof fetch;
    expect(await fetchRunEvents('r1', { fetchImpl })).toEqual({ ok: false });
  });
});
