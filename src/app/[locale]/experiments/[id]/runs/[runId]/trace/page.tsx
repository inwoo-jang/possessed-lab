import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { TraceLive } from '@/components/timeline/TraceLive';
import { getDb } from '@/db/client';
import { Link } from '@/i18n/navigation';
import { getExperimentById, getRunById, getRunEvents } from '@/server/experiments/service';
import { getScenario } from '@/server/experiments/scenarios';

type Params = Promise<{ id: string; runId: string }>;

export default async function TracePage({ params }: { params: Params }) {
  const t = await getTranslations('trace');

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <Link
        href="/"
        className="text-sm text-possessed-muted underline-offset-4 hover:text-possessed-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert"
      >
        ← {t('back')}
      </Link>
      <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">{t('title')}</h1>

      <Suspense fallback={<p role="status" className="mb-6 text-sm text-possessed-muted">…</p>}>
        <ReportLink params={params} label={t('viewReport')} />
        <TraceContent params={params} />
      </Suspense>
    </main>
  );
}

async function ReportLink({ params, label }: { params: Params; label: string }) {
  const { id, runId } = await params;
  return (
    <p className="mb-6">
      <Link
        href={`/experiments/${id}/runs/${runId}/report`}
        className="text-sm text-possessed-alert underline underline-offset-4 hover:text-possessed-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert"
      >
        {label} →
      </Link>
    </p>
  );
}

/**
 * run과 이벤트를 DB에서 읽는 부분. 요청마다 새로 렌더링해야 하므로 connection()으로 요청 시점에 실행한다.
 * (better-sqlite3는 동기 호출이라 Next.js가 동적 데이터로 감지하지 못한다)
 */
async function TraceContent({ params }: { params: Params }) {
  await connection();

  const { id, runId } = await params;
  const db = getDb();

  const run = await getRunById(db, runId);
  // 다른 실험의 run을 이 실험 주소로 열 수 없게 한다
  if (!run || run.experimentId !== id) notFound();

  const experiment = await getExperimentById(db, id);
  if (!experiment) notFound();

  const [events, locale] = await Promise.all([getRunEvents(db, runId), getLocale()]);
  const scenarioName = getScenario(experiment.scenarioId)?.name[locale] ?? experiment.scenarioId;

  return (
    <TraceLive
      // 서버 데이터가 바뀌면(실행 종료 후 refresh) 새 초기 상태로 다시 마운트한다
      key={`${run.status}:${events.length}:${run.metadata.finalAnswer ? 'a' : '-'}`}
      runId={run.id}
      experimentName={experiment.name}
      scenarioName={scenarioName}
      run={{ runMode: run.runMode, status: run.status, metadata: run.metadata }}
      initialEvents={events}
    />
  );
}
