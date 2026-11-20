/**
 * Route Handler 공용 HTTP 헬퍼.
 *
 * 응답 오류 형식:
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "issues": [{ "path": "name", "message": "..." }] } }
 *
 * 상태 코드:
 *   400 INVALID_JSON        본문이 JSON이 아님
 *   404 NOT_FOUND           대상 없음
 *   413 PAYLOAD_TOO_LARGE   본문이 너무 큼
 *   422 VALIDATION_ERROR    스키마 검증 실패 / 도메인 규칙 위반(InvalidRequestError)
 *   503 *                   서버 설정 때문에 처리 불가 (ServiceUnavailableError)
 *   500 INTERNAL_ERROR      예상하지 못한 오류 (내부 메시지는 노출하지 않는다)
 */

import { unstable_rethrow } from 'next/navigation';
import { ZodError, type z } from 'zod';
import { redactSecrets } from '@/lib/redact';
import {
  InvalidRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from '@/server/experiments/errors';

/** 요청 본문 최대 크기 (바이트). 정책 JSON은 이보다 훨씬 작다. */
export const MAX_BODY_BYTES = 100_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface ErrorIssue {
  path: string;
  message: string;
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  issues?: ErrorIssue[]
): Response {
  return Response.json(
    { error: { code, message, ...(issues ? { issues } : {}) } },
    { status }
  );
}

/**
 * 요청 본문을 읽어 JSON으로 파싱하고 스키마로 검증한다.
 * 실패하면 HttpError 또는 ZodError를 던지므로 toErrorResponse로 응답을 만든다.
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): Promise<z.output<S>> {
  const text = await request.text();

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${MAX_BODY_BYTES} bytes`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  return schema.parse(json);
}

/**
 * 던져진 오류를 HTTP 응답으로 변환한다.
 *
 * request.url 같은 요청 시점 API를 읽으면 Next.js(Cache Components)가 프리렌더를 중단시키려고
 * 내부 오류를 던진다. 이를 응답으로 바꿔 삼키면 안 되므로 맨 앞에서 다시 던진다.
 * 애플리케이션 오류에는 아무 일도 하지 않는다.
 */
export function toErrorResponse(err: unknown): Response {
  unstable_rethrow(err);

  if (err instanceof HttpError) {
    return errorResponse(err.status, err.code, err.message);
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return errorResponse(422, 'VALIDATION_ERROR', 'Request validation failed', issues);
  }

  if (err instanceof NotFoundError) {
    return errorResponse(404, err.code, err.message);
  }

  if (err instanceof InvalidRequestError) {
    return errorResponse(422, err.code, err.message);
  }

  if (err instanceof ServiceUnavailableError) {
    return errorResponse(503, err.code, err.message);
  }

  // 예상하지 못한 오류: 원인은 서버 로그에만 남기고 클라이언트에는 일반 메시지를 준다
  const message = redactSecrets(err instanceof Error ? err.message : String(err));
  console.error(`[api] unexpected error: ${message}`);
  return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
}
