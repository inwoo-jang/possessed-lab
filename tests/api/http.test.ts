import { describe, it, expect, vi, afterEach } from 'vitest';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { HttpError, toErrorResponse, parseJsonBody } from '@/server/api/http';
import { InvalidRequestError, NotFoundError, ServiceUnavailableError } from '@/server/experiments/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

/** redirect()가 던지는 Next.js 내부 제어 오류를 얻는다 (프리렌더 중단 신호와 같은 종류) */
function captureFrameworkError(): unknown {
  try {
    redirect('/somewhere');
  } catch (err) {
    return err;
  }
  throw new Error('redirect() did not throw');
}

describe('toErrorResponse', () => {
  it('Next.js 내부 제어 오류는 응답으로 바꾸지 않고 다시 던진다', () => {
    const internal = captureFrameworkError();
    expect(() => toErrorResponse(internal)).toThrow();
  });

  it('프레임워크 오류를 500으로 로깅하지 않는다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      toErrorResponse(captureFrameworkError());
    } catch {
      // 다시 던져지는 것이 정상
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('일반 애플리케이션 오류는 여전히 500 응답으로 바뀐다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = toErrorResponse(new Error('db exploded'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db exploded');
  });

  it.each([
    [new HttpError(413, 'PAYLOAD_TOO_LARGE', 'big'), 413],
    [new NotFoundError('Run', 'x'), 404],
    [new InvalidRequestError('UNKNOWN_TOOL', 'bad'), 422],
    [new ServiceUnavailableError('LIVE_UNAVAILABLE', 'no key'), 503],
  ])('도메인 오류 %# 는 올바른 상태 코드로 매핑된다', (err, status) => {
    expect(toErrorResponse(err).status).toBe(status);
  });

  it('Zod 오류는 422와 필드 위치를 반환한다', async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    if (parsed.success) throw new Error('expected failure');

    const res = toErrorResponse(parsed.error);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.issues[0].path).toBe('name');
  });
});

describe('parseJsonBody', () => {
  const schema = z.object({ n: z.number() });
  const req = (body: string) => new Request('http://localhost/x', { method: 'POST', body });

  it('유효한 JSON은 스키마 출력을 반환한다', async () => {
    await expect(parseJsonBody(req('{"n":1}'), schema)).resolves.toEqual({ n: 1 });
  });

  it('JSON이 아니면 400 HttpError', async () => {
    await expect(parseJsonBody(req('{oops'), schema)).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });

  it('스키마에 맞지 않으면 ZodError', async () => {
    await expect(parseJsonBody(req('{"n":"x"}'), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
