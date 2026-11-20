import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

export type TestLocale = 'en' | 'ko';

/** 지정한 언어의 메시지로 컴포넌트를 서버 렌더링해 HTML 문자열을 반환한다. */
export function renderIn(locale: TestLocale, node: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? ko : en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );
}

/** 태그를 제거하고 공백을 정리한 화면 텍스트. 클래스 이름 속 숫자 등이 단언에 섞이지 않게 한다. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
