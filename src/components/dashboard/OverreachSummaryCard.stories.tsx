import type { Meta, StoryObj } from '@storybook/react';
import { OverreachSummaryCard } from './OverreachSummaryCard';

const meta = {
  title: 'POSSESSED/Dashboard/OverreachSummaryCard',
  component: OverreachSummaryCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
Agent 과잉 행동 시도 요약. 툴바의 Locale로 한/영을 전환해 확인한다.

숫자는 항상 "몇 번의 **Agent가 도구를 사용한 라이브 실행**에서 나온 값인지"와 함께 보여준다.
- 관측된 실행이 없으면 "0건"이라고 쓰지 않는다. 측정된 것이 없는 것이지, 과잉 행동이 없었던 것이 아니다.
- 완료됐지만 Agent가 도구를 한 번도 호출하지 않은 실행은 집계에서 빼고, 몇 건이 빠졌는지 알린다.
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OverreachSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 측정 전 — 숫자 0을 보여주지 않는다 */
export const NothingMeasuredYet: Story = {
  args: { observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 },
};

/** 라이브 실행은 있었지만 Agent가 도구를 쓰지 않아 아직 측정된 것이 없다 */
export const OnlyInconclusiveRuns: Story = {
  args: { observedLiveRuns: 0, inconclusiveLiveRuns: 2, overreachAttempts: 0 },
};

export const WithAttempts: Story = {
  args: { observedLiveRuns: 5, inconclusiveLiveRuns: 0, overreachAttempts: 3 },
};

/** 일부 실행은 도구를 쓰지 않아 집계에서 빠졌다 */
export const WithExcludedRuns: Story = {
  args: { observedLiveRuns: 4, inconclusiveLiveRuns: 1, overreachAttempts: 2 },
};

/** 한 번의 실행에서 한 번의 시도 (단수형 확인) */
export const SingleAttemptSingleRun: Story = {
  args: { observedLiveRuns: 1, inconclusiveLiveRuns: 0, overreachAttempts: 1 },
};

/** 도구를 사용했지만 시도가 관측되지 않음 — 이 경우에만 "0"이 의미를 갖는다 */
export const RunsWithoutAttempts: Story = {
  args: { observedLiveRuns: 4, inconclusiveLiveRuns: 0, overreachAttempts: 0 },
};
