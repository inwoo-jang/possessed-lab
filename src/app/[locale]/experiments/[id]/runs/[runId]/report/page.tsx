import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { ForensicReport } from '@/components/forensic-report/ForensicReport';
import { getDb } from '@/db/client';
import { Link } from '@/i18n/navigation';
import { getExperimentById, getRunById, getRunEvents } from '@/server/experiments/service';
import { getScenario } from '@/server/experiments/scenarios';

type Params = Promise<{ id: string; runId: string }>;

const linkClass =
  'text-sm text-possessed-muted underline-offset-4 hover:text-possessed-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert';

export default async function ReportPage({ params }: { params: Params }) {
  const t = await getTranslations('report');

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">…</p>}>
        <ReportHeader params={params} backLabel={t('backToTrace')} />
      </Suspense>
      <h1 className="mb-6 mt-4 text-3xl font-bold tracking-tight">{t('title')}</h1>

      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">…</p>}>
        <ReportContent params={params} />
      </Suspense>
    </main>
  );
}

/** 경로 params는 요청 시점 값이므로 Suspense 안에서 읽는다 */
async function ReportHeader({ params, backLabel }: { params: Params; backLabel: string }) {
  const { id, runId } = await params;
  return (
    <Link href={`/experiments/${id}/runs/${runId}/trace`} className={linkClass}>
      ← {backLabel}
    </Link>
  );
}

/**
 * run과 이벤트를 DB에서 읽는 부분. 보고서는 정적이므로 폴링하지 않는다.
 * 진행 중인 run이면 보고서 안에 "아직 끝나지 않았다"고 밝힌다.
 * (better-sqlite3는 동기 호출이라 connection()으로 요청 시점에 실행한다)
 */
async function ReportContent({ params }: { params: Params }) {
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
    <ForensicReport
      experimentName={experiment.name}
      scenarioName={scenarioName}
      run={{ runMode: run.runMode, status: run.status, policySnapshot: run.policySnapshot }}
      events={events}
    />
  );
}
