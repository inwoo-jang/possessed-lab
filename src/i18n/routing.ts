import { defineRouting } from 'next-intl/routing';

/**
 * 지원 언어와 URL 규칙.
 *
 * - 모든 경로에 언어 접두사가 붙는다: /en/..., /ko/... (localePrefix 기본값 'always')
 * - 접두사 없는 요청(/)은 쿠키 → Accept-Language → defaultLocale 순으로 판단해 리다이렉트한다
 * - 기본 언어는 영어다 (영어 기본 데모 제공 요구)
 *
 * 판정 코드(ATTEMPTED, BLOCKED, EXECUTED 등)와 도구 이름은 번역 대상이 아니므로
 * 언어별 경로(pathnames)도 두지 않는다.
 */
export const routing = defineRouting({
  locales: ['en', 'ko'],
  defaultLocale: 'en',
});

export type AppLocale = (typeof routing.locales)[number];
