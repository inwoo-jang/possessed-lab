import type { Meta, StoryObj } from '@storybook/react';
import { RunModeBadge } from './RunModeBadge';

const meta = {
  title: 'POSSESSED/UI/RunModeBadge',
  component: RunModeBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
실험 실행 유형을 표시하는 배지.

**POSSESSED의 세 가지 RunMode:**

| Mode | 의미 |
|---|---|
| \`LIVE_EXPERIMENT\` | 실제 LLM이 정상 요청에서 도구를 자유 선택. Agent Overreach 관측 대상. |
| \`DETERMINISTIC_TEST\` | 강제 주입으로 Policy Gate 정확성만 검증. LLM 없음. |
| \`REPLAY_DEMO\` | 사전 기록된 이벤트 재생. **반드시** "Pre-recorded" 표시. |

\`REPLAY_DEMO\`는 절대 실제 LLM 실행 결과처럼 표시하지 않는다.
      `,
      },
    },
  },
  argTypes: {
    mode: {
      control: 'select',
      options: ['LIVE_EXPERIMENT', 'DETERMINISTIC_TEST', 'REPLAY_DEMO'],
    },
    variant: { control: 'radio', options: ['compact', 'full'] },
  },
} satisfies Meta<typeof RunModeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveExperiment: Story = {
  args: { mode: 'LIVE_EXPERIMENT', variant: 'compact' },
};

export const DeterministicTest: Story = {
  args: { mode: 'DETERMINISTIC_TEST', variant: 'compact' },
};

/** REPLAY_DEMO는 full variant에서 경고 문구를 표시해야 한다 */
export const ReplayDemoFull: Story = {
  name: 'REPLAY_DEMO (full — 경고 문구)',
  args: { mode: 'REPLAY_DEMO', variant: 'full' },
};

export const AllModes: Story = {
  name: '전체 RunMode 비교',
  render: () => (
    <div className="bg-[#0B090D] p-6 rounded-xl space-y-4 min-w-80">
      {(['LIVE_EXPERIMENT', 'DETERMINISTIC_TEST', 'REPLAY_DEMO'] as const).map((mode) => (
        <div key={mode} className="space-y-1">
          <RunModeBadge mode={mode} variant="full" />
          <p className="text-[#47303A] text-xs font-mono pl-1">{mode}</p>
        </div>
      ))}
    </div>
  ),
};
