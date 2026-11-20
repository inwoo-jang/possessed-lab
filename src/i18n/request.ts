import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import { routing } from './routing';

/**
 * 요청마다 locale과 메시지를 결정한다.
 *
 * locale은 `app/[locale]` 루트 파라미터에서 읽는다 (next/root-params, Next.js 16.3+).
 * `requestLocale`은 next-intl 4.14에서 deprecated다.
 *
 * `locale`이 인자로 오는 경우는 `getTranslations({ locale })`처럼 호출자가 언어를
 * 명시했을 때이며, 그때는 그 값을 그대로 쓴다.
 */
export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const fromUrl = await rootParams.locale();
    if (!hasLocale(routing.locales, fromUrl)) notFound();
    locale = fromUrl;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
