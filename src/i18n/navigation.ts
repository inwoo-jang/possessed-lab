import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * 언어 접두사를 자동으로 처리하는 내비게이션 API.
 * 앱 내부 링크와 이동은 next/link, next/navigation 대신 이것을 쓴다.
 */
export const { Link, getPathname, redirect, usePathname, useRouter } = createNavigation(routing);
