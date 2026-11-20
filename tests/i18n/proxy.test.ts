/**
 * Task 2.4 — 언어 접두사 라우팅(proxy) 검증
 *
 * proxy 함수를 실제 NextRequest로 호출한다.
 * 정적 파일·API가 proxy 대상에서 빠지는지는 matcher를 직접 검사한다.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import proxy, { config } from '@/proxy';

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe('접두사 없는 요청 리다이렉트', () => {
  it('/ 는 기본 언어(영어)로 리다이렉트한다', async () => {
    const res = await proxy(request('/'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en');
  });

  it('Accept-Language가 한국어이면 /ko 로 리다이렉트한다', async () => {
    const res = await proxy(request('/', { 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5' }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/ko');
  });

  it('지원하지 않는 언어(프랑스어)는 기본 언어로 처리한다', async () => {
    const res = await proxy(request('/', { 'accept-language': 'fr-FR,fr;q=0.9' }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en');
  });

  it('쿠키에 저장된 언어 선택이 Accept-Language보다 우선한다', async () => {
    const res = await proxy(
      request('/', { 'accept-language': 'en-US', cookie: 'NEXT_LOCALE=ko' })
    );
    expect(new URL(res.headers.get('location')!).pathname).toBe('/ko');
  });
});

describe('접두사가 있는 요청', () => {
  it.each(['/en', '/ko'])('%s 는 리다이렉트 없이 통과한다', async (path) => {
    const res = await proxy(request(path));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  // 모든 응답에 hreflang 대체 링크(en, ko 둘 다)가 들어가므로 헤더 전체를 문자열 검색하면 안 된다.
  // 실제로 locale을 전달하는 요청 헤더와 쿠키만 정확히 확인한다.
  it.each([
    ['/ko', 'ko'],
    ['/en', 'en'],
  ])('%s 요청은 %s locale을 서버 컴포넌트에 전달하고 선택을 쿠키에 기억한다', async (path, locale) => {
    const res = await proxy(request(path));

    expect(res.headers.get('x-middleware-request-x-next-intl-locale')).toBe(locale);
    expect(res.headers.get('set-cookie')).toContain(`NEXT_LOCALE=${locale}`);
  });

  it('언어 접두사 뒤의 경로를 유지한다 (/en/compare → 그대로)', async () => {
    const res = await proxy(request('/ko/compare'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('언어 접두사가 없는 하위 경로는 접두사를 붙여 리다이렉트한다 (/compare → /en/compare)', async () => {
    const res = await proxy(request('/compare'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en/compare');
  });
});

describe('proxy 적용 범위(matcher)', () => {
  const matcher = new RegExp(`^${config.matcher}$`);

  it.each(['/', '/en', '/ko', '/en/compare', '/ko/experiments/new'])('%s 는 proxy 대상이다', (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([
    '/api/runs',
    '/api/compare',
    '/api/runs/abc/events',
    '/_next/static/chunk.js',
    '/_next/image',
    '/favicon.ico',
    '/robots.txt',
  ])('%s 는 proxy 대상이 아니다 (API·정적 파일은 언어와 무관)', (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});
