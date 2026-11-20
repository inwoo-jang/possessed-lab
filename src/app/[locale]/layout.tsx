import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { locale as getLocale } from 'next/root-params';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { routing } from '@/i18n/routing';
import '../globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/**
 * Cache Components에서는 루트 파라미터(locale)마다 최소 한 개의 값이 있어야 한다.
 * 지원하는 모든 언어를 빌드 시점에 미리 렌더링한다.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

/**
 * 루트 레이아웃. <html>이 [locale] 세그먼트 안에 있어야 next/root-params로
 * 어느 서버 컴포넌트에서든 locale을 읽을 수 있다.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-possessed-bg text-possessed-text">
        <NextIntlClientProvider>
          <header className="flex justify-end p-4">
            {/* usePathname()은 경로가 빌드 시점에 확정되지 않는 페이지(동적 세그먼트)에서 Suspense가 필요하다.
                fallback은 같은 높이의 빈 자리로 두어 레이아웃이 밀리지 않게 한다. */}
            <Suspense fallback={<div className="h-5" aria-hidden="true" />}>
              <LocaleSwitcher />
            </Suspense>
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
