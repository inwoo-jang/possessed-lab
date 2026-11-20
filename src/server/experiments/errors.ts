/**
 * 서비스 계층 도메인 오류.
 *
 * HTTP 상태 코드는 모른다. 라우트 계층(src/server/api/http.ts)이 매핑한다.
 */

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** 요청은 형식상 올바르지만 도메인 규칙에 맞지 않는 경우 */
export class InvalidRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}

/** 서버 설정 때문에 지금은 처리할 수 없는 경우 (예: API 키 없음) */
export class ServiceUnavailableError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
