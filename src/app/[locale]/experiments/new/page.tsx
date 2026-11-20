import { Suspense } from 'react';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { ExperimentForm } from '@/components/experiment-form/ExperimentForm';
import { Link } from '@/i18n/navigation';
import type { FormRunMode } from '@/lib/experiment-form';
import { getScenarioOptions } from '@/server/experiments/scenario-options';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewExperimentPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('experiment');

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <Link
        href="/"
        className="text-sm text-possessed-muted underline-offset-4 hover:text-possessed-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert"
      >
        ← {t('back')}
      </Link>
      <h1 className="mb-6 mt-4 text-3xl font-bold tracking-tight">{t('title')}</h1>

      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">{t('starting')}</p>}>
        <NewExperimentContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * 요청 시점 데이터(쿼리 문자열, 서버 환경)를 읽는 부분.
 * 키는 존재 여부만 읽고 값은 클라이언트에 넘기지 않는다.
 */
async function NewExperimentContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const requested = Array.isArray(params.runMode) ? params.runMode[0] : params.runMode;
  // 알려진 값만 받는다. 그 밖의 값은 무시하고 결정적 테스트로 시작한다.
  const initialRunMode: FormRunMode = requested === 'LIVE_EXPERIMENT' ? 'LIVE_EXPERIMENT' : 'DETERMINISTIC_TEST';

  const liveAvailable = Boolean(process.env.OPENAI_API_KEY);

  return (
    <ExperimentForm
      scenarios={getScenarioOptions()}
      liveAvailable={liveAvailable}
      initialRunMode={initialRunMode}
    />
  );
}
