import { Suspense } from 'react';
import { connection } from 'next/server';
import { getFormatter, getTranslations } from 'next-intl/server';
import { CompareView } from '@/components/compare/CompareView';
import { getDb } from '@/db/client';
import { Link } from '@/i18n/navigation';
import { CompareQuerySchema } from '@/lib/schemas';
import { NotFoundError } from '@/server/experiments/errors';
import { compareRuns } from '@/server/experiments/compare';
import { listRecentRunOptions, type RunOption } from '@/server/experiments/run-list';
import { getExperimentById } from '@/server/experiments/service';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const linkClass =
  'text-sm text-possessed-muted underline-offset-4 hover:text-possessed-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert';

const controlClass =
  'w-full rounded-md border border-possessed-border bg-possessed-surface px-3 py-2 text-sm text-possessed-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('compare');

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <Link href="/" className={linkClass}>
        ← {t('back')}
      </Link>
      <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-sm text-possessed-muted">{t('intro')}</p>

      <Suspense fallback={<p role="status" className="text-sm text-possessed-muted">…</p>}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * 선택 목록과 비교 결과. 선택은 URL(`?runA=&runB=`)이 가진다.
 * 그래서 비교 결과는 링크로 공유할 수 있고, 선택 폼은 JavaScript 없이 GET 요청으로 동작한다.
 * (better-sqlite3는 동기 호출이라 connection()으로 요청 시점에 실행한다)
 */
async function CompareContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const t = await getTranslations('compare');
  const format = await getFormatter();
  const db = getDb();

  const options = await listRecentRunOptions(db);
  if (options.length === 0) {
    return <p className="rounded-lg border border-possessed-border bg-possessed-surface p-4 text-sm text-possessed-muted">{t('noRuns')}</p>;
  }

  const rawA = first(params.runA);
  const rawB = first(params.runB);
  const selected = CompareQuerySchema.safeParse({ runA: rawA, runB: rawB });

  let result: React.ReactNode;
  if (!rawA || !rawB) {
    result = <p className="text-sm text-possessed-muted">{t('pickBoth')}</p>;
  } else if (!selected.success) {
    result = <p role="alert" className="text-sm text-possessed-alert">{t('invalidSelection')}</p>;
  } else {
    try {
      const comparison = await compareRuns(db, selected.data.runA, selected.data.runB);
      const [expA, expB] = await Promise.all([
        getExperimentById(db, comparison.runA.experimentId),
        getExperimentById(db, comparison.runB.experimentId),
      ]);
      result = (
        <CompareView
          comparison={comparison}
          names={{ a: expA?.name ?? comparison.runA.experimentId, b: expB?.name ?? comparison.runB.experimentId }}
        />
      );
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      result = <p role="alert" className="text-sm text-possessed-alert">{t('runNotFound')}</p>;
    }
  }

  const label = (o: RunOption) =>
    // 같은 실험의 run이나 언어만 다른 데모처럼 이름과 시각이 같아도 구분되도록 id 끝부분을 붙인다 (데모 id는 앞부분이 같다)
    `${o.experimentName} · ${o.runMode} · ${o.status} · ${format.dateTime(new Date(o.startedAt), {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'UTC',
    })} UTC · #${o.id.slice(-6)}`;

  return (
    <div className="space-y-8">
      {/* 같은 주소로 GET 제출한다. JavaScript가 없어도 동작한다 */}
      <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <RunSelect name="runA" label={t('selectA')} choose={t('choose')} options={options} value={rawA} format={label} />
        <RunSelect name="runB" label={t('selectB')} choose={t('choose')} options={options} value={rawB} format={label} />
        <button
          type="submit"
          className="rounded-md bg-possessed-crimson px-4 py-2 text-sm font-medium text-possessed-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert"
        >
          {t('submit')}
        </button>
      </form>

      {result}
    </div>
  );
}

function RunSelect({
  name,
  label,
  choose,
  options,
  value,
  format,
}: {
  name: string;
  label: string;
  choose: string;
  options: RunOption[];
  value: string | undefined;
  format: (o: RunOption) => string;
}) {
  return (
    <label className="block text-sm text-possessed-muted">
      <span className="mb-1 block">{label}</span>
      <select name={name} defaultValue={value ?? ''} required className={controlClass}>
        <option value="" disabled>
          {choose}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
