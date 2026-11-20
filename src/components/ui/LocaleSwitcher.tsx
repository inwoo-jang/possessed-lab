'use client';

/**
 * LocaleSwitcher — 현재 경로를 유지한 채 언어를 바꾸는 링크 목록
 *
 * 접근성:
 *   - 현재 언어는 링크가 아니라 aria-current 텍스트로 표시한다 (같은 페이지로 가는 링크를 만들지 않음)
 *   - 각 링크에 lang/hrefLang을 달아 스크린리더가 언어 이름을 올바른 발음으로 읽게 한다
 *   - aria-label이 보이는 텍스트(언어 이름)를 포함한다 (WCAG 2.5.3)
 */

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      <ul className="flex items-center gap-3 font-mono text-sm">
        {routing.locales.map((locale) => (
          <li key={locale}>
            {locale === current ? (
              <span aria-current="true" lang={locale} className="font-semibold text-possessed-text underline underline-offset-4">
                {t(locale)}
              </span>
            ) : (
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                aria-label={t('switchTo', { language: t(locale) })}
                className="text-possessed-muted hover:text-possessed-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert"
              >
                {t(locale)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
