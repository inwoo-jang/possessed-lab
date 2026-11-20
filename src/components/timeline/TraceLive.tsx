'use client';

/**
 * TraceLive — 진행 중인 run을 폴링으로 갱신하는 래퍼
 *
 * 서버가 렌더링한 초기 데이터로 시작하고, run이 끝나지 않았으면 이벤트를 주기적으로 가져온다.
 * 끝나면(COMPLETED/FAILED) 폴링을 멈추고 router.refresh()로 서버 데이터를 다시 받는다
 * (최종 답변 같은 값은 실행이 끝난 뒤에 저장되므로).
 *
 * 부모(서버 페이지)는 key에 상태를 넣어서, 새로고침된 데이터가 오면 이 컴포넌트가 다시 마운트되게 한다.
 *
 * 폴링이 실패해도 화면은 마지막 상태를 유지하고, 간격을 늘려가며 재시도한다.
 * 너무 오래 끝나지 않으면 멈추고 안내한다.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  MAX_POLL_ATTEMPTS,
  fetchRunEvents,
  isTerminalStatus,
  pollDelay,
} from '@/lib/trace-polling';
import type { ActionEvent, Run, RunMetadata, RunMode } from '@/lib/types';
import { TraceView, type TraceConnection } from './TraceView';

interface TraceLiveProps {
  runId: string;
  experimentName: string;
  scenarioName: string;
  run: { runMode: RunMode; status: Run['status']; metadata: RunMetadata };
  initialEvents: ActionEvent[];
}

export function TraceLive({ runId, experimentName, scenarioName, run, initialEvents }: TraceLiveProps) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [status, setStatus] = useState(run.status);
  const [connection, setConnection] = useState<TraceConnection>('ok');

  // 효과는 마운트 시점의 상태만 필요하다 (이후 변화는 효과 안에서 직접 다룬다)
  const initialStatus = useRef(run.status);

  useEffect(() => {
    if (isTerminalStatus(initialStatus.current)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let failures = 0;
    let attempts = 0;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;

      const result = await fetchRunEvents(runId, { signal: controller.signal });
      if (cancelled) return;

      if (result.ok) {
        failures = 0;
        setConnection('ok');
        setEvents(result.events);
        setStatus(result.status);

        if (isTerminalStatus(result.status)) {
          router.refresh(); // 끝난 뒤에 저장되는 값(최종 답변)을 서버에서 다시 받는다
          return;
        }
      } else {
        failures += 1;
        setConnection('retrying');
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        setConnection('stopped');
        return;
      }
      timer = setTimeout(tick, pollDelay(failures));
    };

    timer = setTimeout(tick, pollDelay(0));

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId, router]);

  return (
    <TraceView
      experimentName={experimentName}
      scenarioName={scenarioName}
      run={{ ...run, status }}
      events={events}
      connection={connection}
    />
  );
}
