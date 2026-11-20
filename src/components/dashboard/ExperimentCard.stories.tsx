import type { Meta, StoryObj } from '@storybook/react';
import { ExperimentCard } from './ExperimentCard';

const meta = {
  title: 'POSSESSED/Dashboard/ExperimentCard',
  component: ExperimentCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
최근 실험 한 건의 요약 카드. 툴바의 Locale로 한/영을 전환해 확인한다.

**무엇을 주장할 수 있는지가 run 상태와 실행 유형에 따라 다르다.**

| 상태 | 카드가 말하는 것 |
|---|---|
| 완료된 LIVE (도구 호출 ≥ 1) | 과잉 행동 시도 N건, 또는 "관측되지 않음" |
| 완료된 LIVE (도구 호출 0) | "관측된 것이 없음"만. **"과잉 행동 없음"이라고 하지 않는다** (Agent가 아무것도 하지 않았다) |
| 완료된 DETERMINISTIC | 실행·차단 횟수만 (호출을 강제로 주입했으므로 Agent 행동 측정이 아님) |
| FAILED / PENDING / RUNNING | 상태만. **"과잉 행동 없음"이라고 하지 않는다** (관측이 끝나지 않음) |
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'Scenario A baseline',
    scenarioName: 'Review ≠ Edit',
  },
} satisfies Meta<typeof ExperimentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 핵심 사건 — Agent가 스스로 금지 도구를 시도했다 */
export const LiveWithOverreach: Story = {
  args: {
    lastRun: { runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', executedCount: 3, blockedCount: 2, overreachAttempts: 2, toolCallCount: 5 },
  },
};

/** 도구를 사용했지만 금지 도구를 제안하지 않았다 (탐지 성공이 아니라 "관측되지 않음") */
export const LiveNoOverreach: Story = {
  args: {
    lastRun: { runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', executedCount: 3, blockedCount: 0, overreachAttempts: 0, toolCallCount: 3 },
  },
};

/**
 * 실제 모델에서 나온 사례: 검토 대상을 몰라 도구를 쓰지 않고 되묻기만 하고 끝났다.
 * Agent의 행동을 관측하지 못했으므로 "과잉 행동 없음"이 아니다.
 */
export const LiveNoToolCalls: Story = {
  args: {
    lastRun: { runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', executedCount: 0, blockedCount: 0, overreachAttempts: 0, toolCallCount: 0 },
  },
};

/** 실패한 실행은 "과잉 행동 없음"으로 보이면 안 된다 */
export const LiveFailed: Story = {
  args: {
    lastRun: { runMode: 'LIVE_EXPERIMENT', status: 'FAILED', executedCount: 0, blockedCount: 0, overreachAttempts: 0, toolCallCount: 0 },
  },
};

/** 결정적 테스트: Agent 행동을 측정하지 않으므로 과잉 행동 문구가 없다 */
export const DeterministicCompleted: Story = {
  args: {
    lastRun: { runMode: 'DETERMINISTIC_TEST', status: 'COMPLETED', executedCount: 3, blockedCount: 1, overreachAttempts: 0, toolCallCount: 4 },
  },
};

export const Running: Story = {
  args: {
    lastRun: { runMode: 'LIVE_EXPERIMENT', status: 'RUNNING', executedCount: 0, blockedCount: 0, overreachAttempts: 0, toolCallCount: 0 },
  },
};

export const Pending: Story = {
  args: {
    lastRun: { runMode: 'DETERMINISTIC_TEST', status: 'PENDING', executedCount: 0, blockedCount: 0, overreachAttempts: 0, toolCallCount: 0 },
  },
};

export const NoRuns: Story = {
  args: { lastRun: null },
};
