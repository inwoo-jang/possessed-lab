import { Suspense } from 'react';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { DemoActions } from '@/components/demo/DemoActions';
import { TraceView } from '@/components/timeline/TraceView';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/types';
import { buildDemoRun } from '@/server/experiments/demo';
import { getScenario } from '@/server/experiments/scenarios';

const linkClass =
  'text-sm text-possessed-muted underline-offset-4 hover:text-possessed-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert';

const buttonBase =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert';

export default async function DemoPage() {
  const t = await getTranslations('demo');

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <Link href="/" className={linkClass}>
        ← {t('back')}
      </Link>
      <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-2 text-sm text-possessed-muted">{t('intro')}</p>
      {/* 시드는 직접 쓴 시퀀스다. 실제 Agent가 얼마나 자주 이러는지에 대한 증거가 아님을 밝힌다. */}
      <p role="note" className="mb-6 text-sm text-possessed-text">
        {t('scriptedNote')}
      </p>

      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">…</p>}>
        <DemoContent />
      </Suspense>
    </main>
  );
}

/**
 * 시드는 DB 없이 그대로 보여 준다 (읽기 전용, 쓰기 없음).
 * "Run live" 버튼은 서버에 키가 있는지에 따라 달라지므로 요청 시점에 실행한다.
 * (빌드 시점에 키가 없으면 "없음"으로 굳는다)
 */
async function DemoContent() {
  await connection();

  const [t, tExperiment, locale] = await Promise.all([
    getTranslations('demo'),
    getTranslations('experiment'),
    getLocale() as Promise<Locale>,
  ]);

  const { experiment, run, events } = buildDemoRun(locale);
  const scenarioName = getScenario(experiment.scenarioId)?.name[locale] ?? experiment.scenarioId;

  // 키의 값이 아니라 존재 여부만 사용한다. 값은 어디에도 전달하지 않는다.
  const liveAvailable = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div className="space-y-8">
      <TraceView
        experimentName={experiment.name}
        scenarioName={scenarioName}
        run={{ runMode: run.runMode, status: run.status, metadata: run.metadata }}
        events={events}
      />

      <section aria-labelledby="demo-next" className="space-y-4">
        <h2 id="demo-next" className="text-lg font-semibold">
          {t('nextHeading')}
        </h2>

        <div className="space-y-1">
          <p className="text-sm text-possessed-muted">{t('savedRunHint')}</p>
          <DemoActions />
        </div>

        <div className="space-y-1">
          <p className="text-sm text-possessed-muted">{t('liveHint')}</p>
          {liveAvailable ? (
            <Link
              href="/experiments/new?runMode=LIVE_EXPERIMENT"
              className={`${buttonBase} bg-possessed-crimson text-possessed-text hover:brightness-110`}
            >
              {t('runLive')}
            </Link>
          ) : (
            <div className="flex max-w-sm flex-col gap-1">
              <button
                type="button"
                disabled
                aria-describedby="demo-live-unavailable"
                className={`${buttonBase} w-fit cursor-not-allowed border border-possessed-border text-possessed-muted opacity-70`}
              >
                {t('runLive')}
              </button>
              <p id="demo-live-unavailable" className="text-xs text-possessed-muted">
                {tExperiment('liveUnavailable')}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
