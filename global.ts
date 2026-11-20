import type { AppLocale } from '@/i18n/routing';
import messages from './messages/en.json';

/**
 * next-intl 타입 확장.
 * 영어 메시지를 기준 타입으로 삼아, 존재하지 않는 키를 쓰면 컴파일 단계에서 오류가 난다.
 * ko/en 키가 같은지는 tests/i18n/messages.test.ts가 별도로 검증한다.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
