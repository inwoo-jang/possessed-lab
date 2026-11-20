import { Suspense } from 'react';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { ExperimentCard } from '@/components/dashboard/ExperimentCard';
import { OverreachSummaryCard } from '@/components/dashboard/OverreachSummaryCard';
import { getDb } from '@/db/client';
import { Link } from '@/i18n/navigation';
import { getOverreachSummary, listRecentExperimentSummaries } from '@/server/experiments/dashboard';
import { getScenario } from '@/server/experiments/scenarios';

const RECENT_LIMIT = 3;

const buttonBase =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert';

export default async function Home() {
  const t = await getTranslations('dashboard');

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <section className="py-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-lg text-possessed-muted">{t('subtitle')}</p>
        {/* 이전 색(#47303A)은 배경 대비가 약 1.6:1이라 AA 기준 미달이어서 muted 색을 쓴다 */}
        <p className="mt-1 text-sm text-possessed-muted">{t('slogan')}</p>
      </section>

      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">{t('loading')}</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}

/**
 * DB와 서버 환경을 읽는 부분. 요청마다 새로 렌더링해야 하므로 connection()으로 요청 시점에 실행한다.
 * (better-sqlite3는 동기 호출이라 Next.js가 동적 데이터로 감지하지 못한다.
 *  connection() 없이는 빌드 시점의 빈 목록이 정적 HTML로 굳는다.)
 */
async function DashboardContent() {
  await connection();

  const [t, tExperiment, tNav, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('experiment'),
    getTranslations('nav'),
    getLocale(),
  ]);

  const db = getDb();
  const [summaries, overreach] = await Promise.all([
    listRecentExperimentSummaries(db, RECENT_LIMIT),
    getOverreachSummary(db),
  ]);

  // 키의 값이 아니라 존재 여부만 사용한다. 값은 어디에도 전달하지 않는다.
  const liveAvailable = Boolean(process.env.OPENAI_API_KEY);

  return (
    <>
      <div className="mb-10 flex flex-wrap items-start justify-center gap-3">
        <Link href="/demo" className={`${buttonBase} bg-possessed-crimson text-possessed-text hover:brightness-110`}>
          {t('runDemo')}
        </Link>

        <Link href="/compare" className={`${buttonBase} border border-possessed-border text-possessed-text hover:bg-possessed-surface`}>
          {tNav('compare')}
        </Link>

        {liveAvailable ? (
          <Link
            href="/experiments/new?runMode=LIVE_EXPERIMENT"
            className={`${buttonBase} border border-possessed-border text-possessed-text hover:bg-possessed-surface`}
          >
            {t('runLive')}
          </Link>
        ) : (
          <div className="flex max-w-xs flex-col items-center gap-1">
            <button
              type="button"
              disabled
              aria-describedby="live-unavailable"
              className={`${buttonBase} cursor-not-allowed border border-possessed-border text-possessed-muted opacity-70`}
            >
              {t('runLive')}
            </button>
            <p id="live-unavailable" className="text-center text-xs text-possessed-muted">
              {tExperiment('liveUnavailable')}
            </p>
          </div>
        )}
      </div>

      <section aria-labelledby="summary-heading" className="mb-10">
        <h2 id="summary-heading" className="mb-3 text-lg font-semibold">
          {t('overreachSummary')}
        </h2>
        <OverreachSummaryCard
          observedLiveRuns={overreach.observedLiveRuns}
          inconclusiveLiveRuns={overreach.inconclusiveLiveRuns}
          overreachAttempts={overreach.overreachAttempts}
        />
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-lg font-semibold">
          {t('recentExperiments')}
        </h2>

        {summaries.length === 0 ? (
          <p className="rounded-lg border border-possessed-border bg-possessed-surface p-4 text-sm text-possessed-muted">
            {t('emptyState')}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map(({ experiment, lastRun }) => (
              <li key={experiment.id}>
                <ExperimentCard
                  name={experiment.name}
                  scenarioName={getScenario(experiment.scenarioId)?.name[locale] ?? experiment.scenarioId}
                  href={lastRun ? `/experiments/${experiment.id}/runs/${lastRun.id}/trace` : undefined}
                  lastRun={
                    lastRun
                      ? {
                          runMode: lastRun.runMode,
                          status: lastRun.status,
                          executedCount: lastRun.stats.executedCount,
                          blockedCount: lastRun.stats.blockedCount,
                          overreachAttempts: lastRun.stats.overreachAttempts,
                          toolCallCount: lastRun.stats.toolCallCount,
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
