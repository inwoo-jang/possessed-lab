import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    // 배경색을 POSSESSED 다크 테마로 고정
    backgrounds: {
      default: 'possessed-dark',
      values: [
        { name: 'possessed-dark',    value: '#0B090D' },
        { name: 'possessed-surface', value: '#19131B' },
        { name: 'light',             value: '#ffffff' },
      ],
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
