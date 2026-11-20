'use client';

/**
 * TraceView — run 하나의 요약 + 요청 + 타임라인 + 최종 답변
 *
 * 폴링과 무관한 표시 전용 컴포넌트다 (폴링은 TraceLive). 그래서 Storybook과 테스트에서 그대로 쓴다.
 *
 * "무엇을 주장할 수 있는가"는 lib/observation.ts 규칙을 따른다 (대시보드 카드와 같은 규칙):
 *   완료된 라이브 run만 "과잉 행동 시도 N건 / 관측되지 않음 / 도구 호출 없음"을 말한다.
 *   결정적 테스트·사전 기록·실패·진행 중인 run은 그런 주장을 하지 않는다.
 *
 * REPLAY_DEMO는 화면 맨 위에 "사전 기록 결과 — 실제 LLM 실행이 아님" 고지를 항상 보인다.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { RunModeBadge } from '@/components/ui/RunModeBadge';
import { RunStatusLabel } from '@/components/ui/RunStatusLabel';
import { summarizeEvents } from '@/lib/event-stats';
import { getObservation } from '@/lib/observation';
import { isTerminalStatus } from '@/lib/trace-polling';
import type { ActionEvent, Locale, Run, RunMetadata, RunMode } from '@/lib/types';
import { TimelineView } from './TimelineView';

export type TraceConnection = 'ok' | 'retrying' | 'stopped';

interface TraceViewProps {
  experimentName: string;
  /** 현재 언어로 이미 번역된 시나리오 이름 */
  scenarioName: string;
  run: { runMode: RunMode; status: Run['status']; metadata: RunMetadata };
  events: ActionEvent[];
  connection?: TraceConnection;
}

export function TraceView({ experimentName, scenarioName, run, events, connection = 'ok' }: TraceViewProps) {
  const t = useTranslations('trace');
  const tReport = useTranslations('report');
  const tLocale = useTranslations('locale');
  const tStatus = useTranslations('status');

  const stats = useMemo(() => summarizeEvents(events), [events]);
  const observation = getObservation({
    runMode: run.runMode,
    status: run.status,
    toolCallCount: stats.toolCallCount,
    overreachAttempts: stats.overreachAttempts,
  });

  const live = !isTerminalStatus(run.status);
  const { metadata } = run;
  const isLiveRun = run.runMode === 'LIVE_EXPERIMENT';

  const emptyMessage = live ? t('noEventsPending') : run.status === 'COMPLETED' ? t('noEventsDone') : null;

  return (
    <div className="space-y-8">
      {run.runMode === 'REPLAY_DEMO' && (
        <div role="note" className="rounded-lg border border-possessed-border bg-possessed-surface p-3">
          <RunModeBadge mode="REPLAY_DEMO" variant="full" />
        </div>
      )}

      <section aria-labelledby="trace-summary" className="space-y-3">
        <h2 id="trace-summary" className="text-lg font-semibold">
          {t('summary')}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          {run.runMode !== 'REPLAY_DEMO' && <RunModeBadge mode={run.runMode} />}
          <span role="status" aria-label={t('liveRegion', { status: tStatus(run.status) })}>
            <RunStatusLabel status={run.status} />
          </span>
          <span className="font-mono text-xs text-possessed-muted">{t('toolCalls', { count: stats.toolCallCount })}</span>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-possessed-muted">{t('experiment')}</dt>
          <dd className="text-possessed-text">{experimentName}</dd>
          <dt className="text-possessed-muted">{t('scenario')}</dt>
          <dd className="text-possessed-text">{scenarioName}</dd>
        </dl>

        {run.status === 'FAILED' && (
          <p role="note" className="flex items-start gap-1.5 text-sm text-possessed-alert">
            <span aria-hidden="true">✗</span>
            <span>{t('failedNotice')}</span>
          </p>
        )}

        {observation === 'OVERREACH' && (
          <p className="flex items-center gap-1.5 text-base font-semibold text-possessed-alert">
            <span aria-hidden="true">⚠</span>
            <span>{tReport('attemptCount', { count: stats.overreachAttempts })}</span>
          </p>
        )}
        {observation === 'NONE_OBSERVED' && (
          <p className="flex items-center gap-1.5 text-base text-possessed-success">
            <span aria-hidden="true">✓</span>
            <span>{tReport('noOverreach')}</span>
          </p>
        )}
        {observation === 'NO_TOOL_CALLS' && (
          <p className="flex items-center gap-1.5 text-base text-possessed-muted">
            <span aria-hidden="true">–</span>
            <span>{tReport('noToolCalls')}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="trace-request" className="space-y-2">
        <h2 id="trace-request" className="text-lg font-semibold">
          {t('request')}
        </h2>
        {metadata.userRequest ? (
          <blockquote
            lang={metadata.locale}
            className="rounded-md border-l-4 border-possessed-border bg-possessed-surface p-3 text-sm text-possessed-text"
          >
            {metadata.userRequest}
          </blockquote>
        ) : (
          <p className="text-sm text-possessed-muted">{t('requestForced')}</p>
        )}
        {metadata.policyReviewConfirmed && (
          <p className="flex items-center gap-1.5 text-xs text-possessed-muted">
            <span aria-hidden="true">✓</span>
            <span>{t('policyReviewed')}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="trace-details" className="space-y-2">
        <h2 id="trace-details" className="text-lg font-semibold">
          {t('details')}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {isLiveRun && metadata.model && (
            <>
              <dt className="text-possessed-muted">{t('model')}</dt>
              <dd className="font-mono text-possessed-text">{metadata.model}</dd>
            </>
          )}
          {isLiveRun && metadata.temperature !== null && (
            <>
              <dt className="text-possessed-muted">{t('temperature')}</dt>
              <dd className="font-mono text-possessed-text">{metadata.temperature}</dd>
            </>
          )}
          <dt className="text-possessed-muted">{t('promptVersion')}</dt>
          <dd className="font-mono text-possessed-text">{metadata.promptVersion}</dd>
          <dt className="text-possessed-muted">{t('language')}</dt>
          <dd className="text-possessed-text">{tLocale(metadata.locale as Locale)}</dd>
        </dl>
      </section>

      <section aria-labelledby="trace-timeline" className="space-y-3">
        <h2 id="trace-timeline" className="text-lg font-semibold">
          {t('timeline')}
        </h2>
        {live && (
          <p className="text-xs text-possessed-muted" aria-live="polite">
            {connection === 'retrying' ? t('pollingRetry') : connection === 'stopped' ? t('pollingStopped') : t('polling')}
          </p>
        )}
        <TimelineView events={events} emptyMessage={emptyMessage} />
      </section>

      {metadata.finalAnswer && (
        <section aria-labelledby="trace-final" className="space-y-2">
          <h2 id="trace-final" className="text-lg font-semibold">
            {t('finalAnswer')}
          </h2>
          <blockquote
            lang={metadata.locale}
            className="whitespace-pre-wrap rounded-md border-l-4 border-possessed-border bg-possessed-surface p-3 text-sm text-possessed-text"
          >
            {metadata.finalAnswer}
          </blockquote>
        </section>
      )}
    </div>
  );
}
