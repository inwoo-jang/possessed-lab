/**
 * 데모 run 준비 요청 (클라이언트). POST /api/demo를 호출해 run 주소에 필요한 id를 받는다.
 * fetch를 주입받아 브라우저 없이 테스트할 수 있다.
 * 클라이언트가 import하므로 서버 전용 모듈을 가져오지 않는다.
 */

import type { Locale } from './types';

export interface DemoRunRef {
  experimentId: string;
  runId: string;
}

export class DemoRequestError extends Error {
  constructor(readonly kind: 'network' | 'server') {
    super(kind === 'network' ? 'Could not reach the server' : 'The server could not prepare the demo run');
    this.name = 'DemoRequestError';
  }
}

export async function startDemo(locale: Locale, fetchFn: typeof fetch = fetch): Promise<DemoRunRef> {
  let response: Response;
  try {
    response = await fetchFn('/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
  } catch {
    throw new DemoRequestError('network');
  }

  if (!response.ok) throw new DemoRequestError('server');

  const body: unknown = await response.json().catch(() => null);
  const ref = body as Partial<DemoRunRef> | null;
  if (!ref || typeof ref.experimentId !== 'string' || typeof ref.runId !== 'string') {
    throw new DemoRequestError('server');
  }
  return { experimentId: ref.experimentId, runId: ref.runId };
}

export function demoRunPath(ref: DemoRunRef, view: 'trace' | 'report'): string {
  return `/experiments/${encodeURIComponent(ref.experimentId)}/runs/${encodeURIComponent(ref.runId)}/${view}`;
}
