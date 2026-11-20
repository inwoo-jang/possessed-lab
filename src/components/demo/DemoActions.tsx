'use client';

/**
 * DemoActions — 데모 run을 저장된 run으로 열어 trace·보고서를 볼 수 있게 한다.
 * LLM을 호출하지 않는다. 요청만 보내고 결과 주소로 이동한다.
 */

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { DemoRequestError, demoRunPath, startDemo } from '@/lib/demo';
import type { Locale } from '@/lib/types';

const buttonClass =
  'inline-flex items-center justify-center rounded-md border border-possessed-border px-4 py-2 text-sm font-medium text-possessed-text hover:bg-possessed-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert disabled:cursor-not-allowed disabled:opacity-60';

export function DemoActions() {
  const t = useTranslations('demo');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, setPending] = useState<'trace' | 'report' | null>(null);
  const [error, setError] = useState<'network' | 'server' | null>(null);

  async function open(view: 'trace' | 'report') {
    setPending(view);
    setError(null);
    try {
      const ref = await startDemo(locale);
      router.push(demoRunPath(ref, view));
    } catch (err) {
      setError(err instanceof DemoRequestError ? err.kind : 'server');
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={pending !== null} onClick={() => open('trace')}>
          {pending === 'trace' ? t('opening') : t('openTrace')}
        </button>
        <button type="button" className={buttonClass} disabled={pending !== null} onClick={() => open('report')}>
          {pending === 'report' ? t('opening') : t('openReport')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-possessed-alert">
          {t(error === 'network' ? 'errorNetwork' : 'errorServer')}
        </p>
      )}
    </div>
  );
}
