/**
 * 진행 중인 run의 이벤트를 가져오는 폴링 로직 (브라우저에서 호출)
 *
 * 화면(React)과 분리해 두어 가짜 fetch로 테스트할 수 있다.
 * 서버 응답을 그대로 믿지 않고 형태를 검증한다. 이상한 응답은 "실패"로 취급해 재시도하게 한다.
 */

import { RUN_STATUSES } from './constants';
import type { ActionEvent, Run } from './types';

export type RunStatus = Run['status'];

export type PollResult =
  | { ok: true; status: RunStatus; events: ActionEvent[] }
  | { ok: false };

/** 더 이상 바뀌지 않는 상태 */
export function isTerminalStatus(status: RunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

/** 폴링 간격(ms): 정상이면 일정하게, 연속 실패하면 서서히 늘린다 (최대 8초) */
export function pollDelay(consecutiveFailures: number, baseMs = 1500): number {
  if (consecutiveFailures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** consecutiveFailures, 8000);
}

export const MAX_POLL_ATTEMPTS = 150; // 기본 간격으로 약 4분. 그 뒤에는 멈추고 안내한다

export async function fetchRunEvents(
  runId: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<PollResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(`/api/runs/${encodeURIComponent(runId)}/events`, {
      signal: options.signal,
      cache: 'no-store',
    });
  } catch {
    return { ok: false };
  }
  if (!res.ok) return { ok: false };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false };
  }

  const body = json as { status?: unknown; events?: unknown } | null;
  if (!body || typeof body !== 'object') return { ok: false };
  if (!Array.isArray(body.events)) return { ok: false };
  if (typeof body.status !== 'string' || !(RUN_STATUSES as readonly string[]).includes(body.status)) {
    return { ok: false };
  }

  return { ok: true, status: body.status as RunStatus, events: body.events as ActionEvent[] };
}
