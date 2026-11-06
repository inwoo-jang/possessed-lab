import type { Meta, StoryObj } from '@storybook/react';
import { VerdictBadge, type VerdictBadgeVariant } from './VerdictBadge';

const meta = {
  title: 'POSSESSED/UI/VerdictBadge',
  component: VerdictBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
정책 판정 결과를 표시하는 배지 컴포넌트.

**접근성 원칙:** 색상만으로 구분하지 않음 — 아이콘 + 텍스트 레이블을 항상 함께 표시.

**POSSESSED 핵심 구분:**
- \`BLOCKED_AGENT\` — Agent가 스스로 제안한 금지 도구 호출 (Overreach). 가장 강한 붉은 강조.
- \`BLOCKED_INJECTED\` — DETERMINISTIC_TEST에서 강제 주입된 차단. 약한 강조.
- \`EXECUTED\` — Mock 도구 정상 실행.
- \`ERROR\` — 예외 발생. **VIOLATION이 아님.**
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'EXECUTED',
        'BLOCKED_AGENT',
        'BLOCKED_INJECTED',
        'VIOLATION',
        'NEEDS_APPROVAL',
        'ALLOWED',
        'ERROR',
        'PENDING',
      ] as VerdictBadgeVariant[],
    },
    size: { control: 'radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof VerdictBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// 개별 스토리
// ---------------------------------------------------------------------------

export const Executed: Story = {
  args: { variant: 'EXECUTED', size: 'md' },
};

/** 핵심 Overreach 사건 — Agent가 스스로 금지 도구를 시도함 */
export const BlockedByAgent: Story = {
  args: { variant: 'BLOCKED_AGENT', size: 'md' },
};

/** DETERMINISTIC_TEST에서 강제 주입된 차단 */
export const BlockedInjected: Story = {
  args: { variant: 'BLOCKED_INJECTED', size: 'md' },
};

export const Violation: Story = {
  args: { variant: 'VIOLATION', size: 'md' },
};

export const NeedsApproval: Story = {
  args: { variant: 'NEEDS_APPROVAL', size: 'md' },
};

export const Allowed: Story = {
  args: { variant: 'ALLOWED', size: 'md' },
};

/** 오류 — VIOLATION으로 오인하지 않음을 레이블에서 명시 */
export const Error: Story = {
  args: { variant: 'ERROR', size: 'md' },
};

export const Pending: Story = {
  args: { variant: 'PENDING', size: 'md' },
};

// ---------------------------------------------------------------------------
// 모든 배지 한눈에 보기
// ---------------------------------------------------------------------------

export const AllVariants: Story = {
  name: '전체 배지 비교',
  render: () => (
    <div className="bg-[#0B090D] p-6 rounded-xl space-y-3 min-w-96">
      <p className="text-[#9CA3AF] text-xs font-mono mb-4">
        색상 + 아이콘 + 텍스트로 상태 구분 (접근성)
      </p>
      {(
        [
          'EXECUTED',
          'BLOCKED_AGENT',
          'BLOCKED_INJECTED',
          'VIOLATION',
          'NEEDS_APPROVAL',
          'ALLOWED',
          'ERROR',
          'PENDING',
        ] as VerdictBadgeVariant[]
      ).map((v) => (
        <div key={v} className="flex items-center gap-3">
          <VerdictBadge variant={v} size="md" />
          <span className="text-[#47303A] text-xs font-mono">{v}</span>
        </div>
      ))}
    </div>
  ),
};

export const SizeComparison: Story = {
  name: 'sm vs md 크기 비교',
  render: () => (
    <div className="bg-[#0B090D] p-6 rounded-xl space-y-4">
      <div className="space-y-2">
        <p className="text-[#9CA3AF] text-xs">md (카드 헤더용)</p>
        <VerdictBadge variant="BLOCKED_AGENT" size="md" />
      </div>
      <div className="space-y-2">
        <p className="text-[#9CA3AF] text-xs">sm (타임라인 인라인용)</p>
        <VerdictBadge variant="BLOCKED_AGENT" size="sm" />
      </div>
    </div>
  ),
};
