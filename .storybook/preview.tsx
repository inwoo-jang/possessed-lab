import type { Preview } from '@storybook/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ko from '../messages/ko.json';
import '../src/app/globals.css';

const messages = { en, ko } as const;
type StoryLocale = keyof typeof messages;

const preview: Preview = {
  // 툴바에서 언어를 바꿔 한/영 화면을 모두 확인한다
  globalTypes: {
    locale: {
      description: 'Locale',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        dynamicTitle: true,
        items: [
          { value: 'en', title: 'English' },
          { value: 'ko', title: '한국어' },
        ],
      },
    },
  },
  initialGlobals: {
    locale: 'en',
    // POSSESSED 다크 배경을 기본으로 사용한다
    backgrounds: { value: 'possessed-bg' },
  },
  decorators: [
    (Story, context) => {
      const locale = (context.globals.locale ?? 'en') as StoryLocale;
      return (
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <div lang={locale}>
            <Story />
          </div>
        </NextIntlClientProvider>
      );
    },
  ],
  parameters: {
    backgrounds: {
      options: {
        'possessed-bg': { name: 'POSSESSED background', value: '#0B090D' },
        'possessed-surface': { name: 'POSSESSED surface', value: '#19131B' },
        light: { name: 'Light', value: '#ffffff' },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
