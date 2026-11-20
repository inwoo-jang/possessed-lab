import type { Meta, StoryObj } from '@storybook/react';
import { CompareView } from './CompareView';
import type { EventDiff, RunComparison, RunComparisonSide } from '@/lib/types';

function side(over: Partial<RunComparisonSide> = {}): RunComparisonSide {
  return {
    id: 'run-a',
    experimentId: 'exp-a',
    scenarioId: 'scenario-a',
    runMode: 'LIVE_EXPERIMENT',
    status: 'COMPLETED',
    metadata: {
      model: 'gpt-4o', temperature: 0, promptVersion: 'ad-review-neutral-v2', policyVersion: 1,
      locale: 'en', variantId: null, userRequest: 'Review the ad copy.', policyReviewConfirmed: false, finalAnswer: null,
    },
    policySnapshotAt: '2026-11-06T10:00:00.000Z',
    stats: { overreachAttempts: 0, executedCount: 2, blockedCount: 0, errorCount: 0, toolCallCount: 2 },
    ...over,
  };
}

const call = (over: Partial<EventDiff>): EventDiff => ({
  toolName: 'read_terms', occurrenceIndex: 0, verdictA: 'ALLOWED', verdictB: 'ALLOWED',
  outcomeA: 'EXECUTED', outcomeB: 'EXECUTED', agentProposedA: true, agentProposedB: true, changed: false,
  ...over,
});

const base: RunComparison = {
  runA: side(),
  runB: side({ id: 'run-b', experimentId: 'exp-b' }),
  warnings: [],
  diff: [call({}), call({ toolName: 'search_rule' })],
  changedCount: 0,
  policyDiff: [],
};

const meta = {
  title: 'Compare/CompareView',
  component: CompareView,
  parameters: { layout: 'padded' },
  args: { comparison: base, names: { a: 'Baseline wording', b: 'Explicit scope' } },
} satisfies Meta<typeof CompareView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 차이가 없다 */
export const NoDifferences: Story = {};

/** 같은 정책에서 판정이 다르다. 정책 때문이 아니라 모델의 변동일 수 있다고 밝힌다 */
export const ChangedWithoutPolicyDiff: Story = {
  args: {
    comparison: {
      ...base,
      runA: side({ stats: { overreachAttempts: 1, executedCount: 1, blockedCount: 1, errorCount: 0, toolCallCount: 2 } }),
      diff: [
        call({}),
        call({ toolName: 'update_ad', verdictA: 'VIOLATION', outcomeA: 'BLOCKED', verdictB: null, outcomeB: null, agentProposedB: null, changed: true }),
      ],
      changedCount: 1,
    },
  },
};

/** 정책을 바꾼 뒤 비교: update_ad가 허용되어 같은 호출이 실행됐다 */
export const PolicyChanged: Story = {
  args: {
    comparison: {
      ...base,
      diff: [
        call({ toolName: 'update_ad', verdictA: 'VIOLATION', outcomeA: 'BLOCKED', verdictB: 'ALLOWED', outcomeB: 'EXECUTED', changed: true }),
      ],
      changedCount: 1,
      policyDiff: [
        { toolName: 'update_ad', a: { permission: 'DENIED', approvalGranted: null }, b: { permission: 'ALLOWED', approvalGranted: null } },
      ],
    },
  },
};

/** 실행 유형이 다르다 (강제 주입 vs Agent 제안): 직접 비교할 수 없다는 경고 */
export const ModeMismatch: Story = {
  args: {
    comparison: {
      ...base,
      runB: side({ id: 'run-b', runMode: 'DETERMINISTIC_TEST', metadata: { ...side().metadata, model: null, temperature: null } }),
      warnings: [{ code: 'RUN_MODE_MISMATCH', message: '' }],
      diff: [call({ agentProposedB: false })],
    },
  },
};

/** 미완료 run과 다른 시나리오 */
export const ScenarioMismatchAndRunning: Story = {
  args: {
    comparison: {
      ...base,
      runB: side({ id: 'run-b', scenarioId: 'scenario-b', status: 'RUNNING' }),
      warnings: [
        { code: 'SCENARIO_MISMATCH', message: '' },
        { code: 'RUN_NOT_COMPLETED', message: '' },
      ],
    },
  },
};

/** 사전 기록 run은 고지를 보이고 관측 주장을 하지 않는다 */
export const WithReplayDemo: Story = {
  args: {
    comparison: {
      ...base,
      runA: side({ runMode: 'REPLAY_DEMO', stats: { overreachAttempts: 1, executedCount: 3, blockedCount: 1, errorCount: 0, toolCallCount: 4 } }),
      warnings: [{ code: 'RUN_MODE_MISMATCH', message: '' }],
    },
  },
};
