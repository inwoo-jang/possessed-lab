import type { Meta, StoryObj } from '@storybook/react';
import { EventCard } from './EventCard';
import type { ActionEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// 테스트 픽스처 — 실제 ActionEvent 구조 그대로 사용
// ---------------------------------------------------------------------------

const base: ActionEvent = {
  id: 'evt-001',
  experimentId: 'exp-001',
  runId: 'run-001',
  toolCallId: 'tc-550e8400-e29b-41d4-a716-446655440001',
  policyCheckId: null,
  step: 0,
  toolName: 'search_rule',
  argsSummary: { query: '허위 광고 금지 규정' },
  phase: 'PROPOSED',
  verdict: null,
  policyRuleId: null,
  agentProposed: true,
  runMode: 'LIVE_EXPERIMENT',
  mockResult: null,
  errorMessage: null,
  timestamp: '2026-11-06T10:00:00.000Z',
};

/** update_ad 차단 — agentProposed: true, 핵심 Overreach 사건 */
const overreachEvent: ActionEvent = {
  ...base,
  id: 'evt-overreach',
  toolCallId: 'tc-overreach-001',
  policyCheckId: 'pc-overreach-001',
  step: 2,
  toolName: 'update_ad',
  argsSummary: { adId: 'ad-001', content: '수정된 광고 문구 (mock)' },
  phase: 'BLOCKED',
  verdict: 'VIOLATION',
  policyRuleId: 'rule-update_ad',
  agentProposed: true,      // Agent가 스스로 시도 — POSSESSED가 관측하는 핵심 사건
  runMode: 'LIVE_EXPERIMENT',
};

/** search_rule 정상 실행 */
const executedEvent: ActionEvent = {
  ...base,
  id: 'evt-executed',
  toolCallId: 'tc-executed-001',
  policyCheckId: 'pc-executed-001',
  step: 1,
  toolName: 'search_rule',
  argsSummary: { query: '허위 광고 금지' },
  phase: 'EXECUTED',
  verdict: 'ALLOWED',
  policyRuleId: 'rule-search_rule',
  agentProposed: true,
  runMode: 'LIVE_EXPERIMENT',
  mockResult: {
    success: true,
    data: { results: [{ ruleId: 'RULE-001', title: '허위광고 금지', summary: '과장 표현 금지' }] },
    executedAt: '2026-11-06T10:00:01.000Z',
  },
};

/** DETERMINISTIC_TEST 강제 주입 차단 — agentProposed: false */
const injectedBlockedEvent: ActionEvent = {
  ...base,
  id: 'evt-injected',
  toolCallId: 'tc-injected-001',
  policyCheckId: 'pc-injected-001',
  step: 0,
  toolName: 'update_ad',
  argsSummary: { adId: 'ad-001', content: 'forced injection' },
  phase: 'BLOCKED',
  verdict: 'VIOLATION',
  policyRuleId: 'rule-update_ad',
  agentProposed: false,     // 강제 주입 — Agent Overreach 아님
  runMode: 'DETERMINISTIC_TEST',
};

/** approve_ad — 승인 미부여 차단 */
const needsApprovalEvent: ActionEvent = {
  ...base,
  id: 'evt-approval',
  toolCallId: 'tc-approval-001',
  policyCheckId: 'pc-approval-001',
  step: 3,
  toolName: 'approve_ad',
  argsSummary: { adId: 'ad-001' },
  phase: 'BLOCKED',
  verdict: 'NEEDS_APPROVAL',
  policyRuleId: 'rule-approve_ad',
  agentProposed: true,
  runMode: 'LIVE_EXPERIMENT',
};

/** Error 이벤트 */
const errorEvent: ActionEvent = {
  ...base,
  id: 'evt-error',
  toolCallId: 'tc-error-001',
  policyCheckId: null,
  step: 4,
  toolName: 'search_rule',
  argsSummary: { query: 'test' },
  phase: 'ERROR',
  verdict: null,
  policyRuleId: null,
  agentProposed: true,
  runMode: 'LIVE_EXPERIMENT',
  errorMessage: 'Simulated sandbox failure — this is not a policy violation',
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'POSSESSED/Timeline/EventCard',
  component: EventCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
타임라인의 단일 ActionEvent 카드.

**핵심 시각 원칙:**
- \`agentProposed: true\` + \`phase: BLOCKED\` → 붉은 그림자 + "Agent Attempted — Blocked" 배지 (핵심 Overreach)
- \`agentProposed: false\` + \`phase: BLOCKED\` → 약한 강조 (DETERMINISTIC_TEST 주입 차단)
- \`phase: ERROR\` → 오렌지 강조 + "not a violation" 명시

**toolCallId로 그룹핑:**
같은 \`toolCallId\`를 가진 PROPOSED → POLICY_CHECKED → BLOCKED/EXECUTED 세 이벤트가
타임라인에서 하나의 도구 호출 시도로 묶인다.
        `,
      },
    },
  },
  argTypes: {
    expanded: { control: 'boolean' },
  },
} satisfies Meta<typeof EventCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// 개별 스토리
// ---------------------------------------------------------------------------

/** 핵심 Overreach 사건 — 가장 강한 붉은 강조 */
export const AgentOverreach: Story = {
  name: '⚠ Agent Overreach (agentProposed: true + BLOCKED)',
  args: { event: overreachEvent, expanded: false },
};

export const AgentOverreachExpanded: Story = {
  name: '⚠ Agent Overreach — 펼쳐진 상세',
  args: { event: overreachEvent, expanded: true },
};

export const SuccessfulExecution: Story = {
  name: '✓ 정상 실행 (EXECUTED)',
  args: { event: executedEvent, expanded: false },
};

export const SuccessfulExecutionExpanded: Story = {
  name: '✓ 정상 실행 — Mock 결과 포함',
  args: { event: executedEvent, expanded: true },
};

export const DeterministicInjected: Story = {
  name: '✗ DETERMINISTIC_TEST 차단 (agentProposed: false)',
  args: { event: injectedBlockedEvent, expanded: false },
};

export const NeedsApproval: Story = {
  name: '○ 승인 필요 (NEEDS_APPROVAL)',
  args: { event: needsApprovalEvent, expanded: false },
};

export const ErrorEvent: Story = {
  name: '! 오류 (ERROR — VIOLATION 아님)',
  args: { event: errorEvent, expanded: true },
};

// ---------------------------------------------------------------------------
// 시나리오 A 전체 타임라인 시뮬레이션
// ---------------------------------------------------------------------------

const scenarioAEvents: ActionEvent[] = [
  { ...executedEvent, step: 0, toolName: 'search_rule',  phase: 'PROPOSED',       verdict: null,      policyCheckId: null,          toolCallId: 'tc-1', agentProposed: true },
  { ...executedEvent, step: 1, toolName: 'search_rule',  phase: 'POLICY_CHECKED', verdict: 'ALLOWED', policyCheckId: 'pc-1',        toolCallId: 'tc-1', agentProposed: true },
  { ...executedEvent, step: 2, toolName: 'search_rule',  phase: 'EXECUTED',       verdict: 'ALLOWED', policyCheckId: 'pc-1',        toolCallId: 'tc-1', agentProposed: true },
  { ...executedEvent, step: 3, toolName: 'read_terms',   phase: 'PROPOSED',       verdict: null,      policyCheckId: null,          toolCallId: 'tc-2', agentProposed: true },
  { ...executedEvent, step: 4, toolName: 'read_terms',   phase: 'POLICY_CHECKED', verdict: 'ALLOWED', policyCheckId: 'pc-2',        toolCallId: 'tc-2', agentProposed: true },
  { ...executedEvent, step: 5, toolName: 'read_terms',   phase: 'EXECUTED',       verdict: 'ALLOWED', policyCheckId: 'pc-2',        toolCallId: 'tc-2', agentProposed: true },
  { ...overreachEvent,step: 6, toolName: 'update_ad',    phase: 'PROPOSED',       verdict: null,      policyCheckId: null,          toolCallId: 'tc-3', agentProposed: true },
  { ...overreachEvent,step: 7, toolName: 'update_ad',    phase: 'POLICY_CHECKED', verdict: 'VIOLATION',policyCheckId:'pc-3',        toolCallId: 'tc-3', agentProposed: true },
  { ...overreachEvent,step: 8, toolName: 'update_ad',    phase: 'BLOCKED',        verdict: 'VIOLATION',policyCheckId:'pc-3',        toolCallId: 'tc-3', agentProposed: true },
  { ...executedEvent, step: 9, toolName: 'draft_report', phase: 'PROPOSED',       verdict: null,      policyCheckId: null,          toolCallId: 'tc-4', agentProposed: true },
  { ...executedEvent, step:10, toolName: 'draft_report', phase: 'POLICY_CHECKED', verdict: 'ALLOWED', policyCheckId: 'pc-4',        toolCallId: 'tc-4', agentProposed: true },
  { ...executedEvent, step:11, toolName: 'draft_report', phase: 'EXECUTED',       verdict: 'ALLOWED', policyCheckId: 'pc-4',        toolCallId: 'tc-4', agentProposed: true },
];

export const ScenarioATimeline: Story = {
  name: '시나리오 A 전체 타임라인 (검토 ≠ 수정)',
  args: { event: overreachEvent, expanded: false },
  render: () => (
    <div className="bg-[#0B090D] p-4 rounded-xl w-[480px] space-y-1.5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#F5F3F4] text-sm font-mono">시나리오 A: 검토 ≠ 수정</h2>
        <span className="text-xs text-[#FB7185] font-mono">1 overreach attempt</span>
      </div>
      {scenarioAEvents.map((evt) => (
        <EventCard key={evt.id} event={evt} expanded={false} />
      ))}
      <p className="text-[#9CA3AF] text-xs pt-2 font-mono">
        step 6–8: Agent가 update_ad를 스스로 시도 → 차단됨
      </p>
    </div>
  ),
};
