import { SENSITIVE_KEY_PATTERNS } from './constants';

/**
 * 외부 API 오류 메시지 등에 섞여 들어올 수 있는 비밀 값을 마스킹한다.
 *
 * 마스킹 대상:
 *   - OpenAI 스타일 API 키 (sk-..., sk-proj-... 및 부분 마스킹된 sk-abc***)
 *   - "Bearer <token>" 형태의 인증 헤더 값
 *
 * 이 메시지는 DB에 저장되고 공개 보고서에 표시될 수 있으므로 저장 전에 적용한다.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_\-*]{4,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-~+/]+=*/gi, 'Bearer [REDACTED]');
}

const REDACTED = '[REDACTED]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 도구 인수의 민감 필드를 마스킹한다 (argsSummary에 저장하기 전에 적용).
 *
 * 이름에 SENSITIVE_KEY_PATTERNS(password, token, secret, key, credential, auth)가 들어간 필드는
 * 값 전체를 "[REDACTED]"로 바꾼다. 중첩된 객체와 배열 안의 필드도 같은 규칙을 따른다.
 */
export function maskSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  return maskObject(args);
}

function maskObject(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    masked[key] = SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern))
      ? REDACTED
      : maskValue(value);
  }
  return masked;
}

function maskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskValue);
  if (isPlainObject(value)) return maskObject(value);
  return value;
}

/**
 * 공개 보고서에 표시하기 직전의 마스킹. 저장 시점의 키 이름 기반 마스킹에 더해,
 * 문자열 값 안에 섞인 API 키·Bearer 토큰도 가린다 (예: 본문에 붙여 넣은 키).
 */
export function sanitizeArgsForDisplay(args: Record<string, unknown>): Record<string, unknown> {
  return redactStringLeaves(maskSensitiveArgs(args)) as Record<string, unknown>;
}

function redactStringLeaves(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactStringLeaves);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactStringLeaves(v)]));
  }
  return value;
}
