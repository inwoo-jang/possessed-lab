import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * 언어 접두사 라우팅.
 * Next.js 16부터 middleware.ts는 deprecated이며 proxy.ts가 그 역할을 한다.
 */
export default createMiddleware(routing);

export const config = {
  // 다음을 제외한 모든 경로에 적용한다:
  //  - /api (Route Handler는 언어와 무관하다)
  //  - /_next, /_vercel (프레임워크 내부 경로)
  //  - 점이 들어간 경로 (favicon.ico 같은 정적 파일)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
