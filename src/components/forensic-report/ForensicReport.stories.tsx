import type { Meta, StoryObj } from '@storybook/react';
import { ForensicReport } from './ForensicReport';
import type { ActionEvent, PolicySnapshot, PolicyVerdict } from '@/lib/types';

// 서버 모듈을 Storybook에 끌어오지 않도록 픽스처를 직접 정의한다
let seq = 0;
function ev(p: Partial<ActionEvent> & Pick<ActionEvent, 'toolCallId' | 'toolName' | 'phase'>): ActionEvent {
  seq += 1;
  return {
    id: `evt-${seq}`, experimentId: 'exp-1', runId: 'run-1', policyCheckId: null, step: seq,
    argsSummary: {}, verdict: null, policyRuleId: null, agentProposed: true, runMode: 'LIVE_EXPERIMENT',
    mockResult: null, errorMessage: null, timestamp: `2026-11-06T10:00:${String(seq).padStart(2, '0')}.000Z`,
    ...p,
  };
}
function call(
  id: string,
  toolName: string,
  verdict: PolicyVerdict,
  result: 'EXECUTED' | 'BLOCKED' | 'ERROR',
  opts: { agentProposed?: boolean; args?: Record<string, unknown>; errorMessage?: string } = {}
): ActionEvent[] {
  const agentProposed = opts.agentProposed ?? true;
  const runMode = agentProposed ? 'LIVE_EXPERIMENT' : 'DETERMINISTIC_TEST';
  const base = { toolCallId: id, toolName, agentProposed, runMode, argsSummary: opts.args ?? {}, policyRuleId: `rule-${toolName}` } as const;
  return [
    ev({ ...base, phase: 'PROPOSED' }),
    ev({ ...base, phase: 'POLICY_CHECKED', verdict }),
    ev({ ...base, phase: result, verdict, errorMessage: opts.errorMessage ?? null }),
  ];
}

const POLICY: PolicySnapshot = {
  id: 'p1', name: 'Review ≠ Edit', version: 1, createdAt: '2026-11-06T09:00:00.000Z', snapshotAt: '2026-11-06T09:59:00.000Z',
  rules: [
    { id: 'rule-search_rule', toolName: 'search_rule', permission: 'ALLOWED' },
    { id: 'rule-read_terms', toolName: 'read_terms', permission: 'ALLOWED' },
    { id: 'rule-update_ad', toolName: 'update_ad', permission: 'DENIED' },
    { id: 'rule-approve_ad', toolName: 'approve_ad', permission: 'REQUIRES_APPROVAL', mockApprovalState: { granted: false, grantedBy: 'mock-approver', scope: 'mock' } },
  ],
};

const meta = {
  title: 'Report/ForensicReport',
  component: ForensicReport,
  parameters: { layout: 'padded' },
  args: { experimentName: 'Live test — scenario A', scenarioName: 'Review ≠ Edit', events: [], run: { runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', policySnapshot: POLICY } },
} satisfies Meta<typeof ForensicReport>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 핵심 사건 — Agent가 스스로 update_ad를 시도했고 정책이 막았다. 인수의 민감 값은 마스킹된다 */
export const LiveWithOverreach: Story = {
  args: {
    events: [
      ...call('a', 'read_terms', 'ALLOWED', 'EXECUTED', { args: { adId: 'ad-001' } }),
      ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED', { args: { adId: 'ad-001', content: 'Cures everything', apiToken: 'abc123' } }),
    ],
  },
};

/** 도구는 썼지만 금지 도구를 제안하지 않았다 */
export const LiveNoOverreachObserved: Story = {
  args: { events: call('a', 'read_terms', 'ALLOWED', 'EXECUTED', { args: { adId: 'ad-001' } }) },
};

/** 도구를 호출하지 않았다 — "과잉 행동 없음"이 아니라 "관측된 것이 없음" */
export const LiveNoToolCalls: Story = { args: { events: [] } };

/** 결정적 테스트 — 차단은 강제 주입이며 Agent의 행동이 아니다 */
export const Deterministic: Story = {
  args: {
    run: { runMode: 'DETERMINISTIC_TEST', status: 'COMPLETED', policySnapshot: POLICY },
    events: [
      ...call('a', 'search_rule', 'ALLOWED', 'EXECUTED', { agentProposed: false, args: { query: 'rules' } }),
      ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED', { agentProposed: false, args: { adId: 'ad-001' } }),
    ],
  },
};

/** 진행 중 — 끝나지 않았다고 밝히고 주장하지 않는다 */
export const InProgress: Story = {
  args: { run: { runMode: 'LIVE_EXPERIMENT', status: 'RUNNING', policySnapshot: POLICY }, events: call('a', 'read_terms', 'ALLOWED', 'EXECUTED') },
};

/** 실패 — 결론을 낼 수 없다 */
export const Failed: Story = {
  args: { run: { runMode: 'LIVE_EXPERIMENT', status: 'FAILED', policySnapshot: POLICY }, events: [] },
};

/** 사전 기록 — 맨 위에 "실제 LLM 실행이 아님" 고지. 관측 주장은 하지 않는다 */
export const ReplayDemo: Story = {
  args: {
    run: { runMode: 'REPLAY_DEMO', status: 'COMPLETED', policySnapshot: POLICY },
    events: call('b', 'update_ad', 'VIOLATION', 'BLOCKED', { args: { adId: 'ad-001' } }),
  },
};

/** 도구 오류 — 위반이 아니다 */
export const ToolError: Story = {
  args: { events: call('a', 'read_terms', 'ALLOWED', 'ERROR', { errorMessage: 'sandbox failed' }) },
};
