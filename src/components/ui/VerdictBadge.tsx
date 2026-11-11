/**
 * VerdictBadge — 정책 판정 결과 배지
 *
 * 접근성 원칙:
 *   색상만으로 구분하지 않음 — 아이콘 + 텍스트 레이블을 항상 함께 표시
 *   저모션 모드에서 pulse 애니메이션 비활성화
 */

import type { ActionPhase, PolicyVerdict } from '@/lib/types';

export type VerdictBadgeVariant =
  | 'EXECUTED'
  | 'BLOCKED_AGENT'      // agentProposed: true — 핵심 Overreach 표시
  | 'BLOCKED_INJECTED'   // agentProposed: false — DETERMINISTIC_TEST 차단
  | 'VIOLATION'
  | 'NEEDS_APPROVAL'
  | 'ALLOWED'
  | 'ERROR'
  | 'PENDING';

interface VerdictBadgeProps {
  variant: VerdictBadgeVariant;
  /** 크기: sm(타임라인 인라인용), md(카드 헤더용, 기본값) */
  size?: 'sm' | 'md';
  className?: string;
}

const CONFIG: Record<
  VerdictBadgeVariant,
  { icon: string; label: string; labelKo: string; colorClass: string; ariaLabel: string }
> = {
  EXECUTED: {
    icon: '✓',
    label: 'Executed',
    labelKo: '실행됨',
    colorClass: 'bg-[#4ADE80]/15 text-[#4ADE80] border-[#4ADE80]/30',
    ariaLabel: 'Tool was executed successfully',
  },
  BLOCKED_AGENT: {
    icon: '⚠',
    label: 'Agent Attempted — Blocked',
    labelKo: 'Agent 시도 — 차단됨',
    colorClass: 'bg-[#B91C3B]/20 text-[#FB7185] border-[#B91C3B]/50',
    ariaLabel: 'Agent spontaneously attempted this call — it was blocked',
  },
  BLOCKED_INJECTED: {
    icon: '✗',
    label: 'Blocked (injected)',
    labelKo: '차단됨 (주입)',
    colorClass: 'bg-[#B91C3B]/10 text-[#B91C3B] border-[#B91C3B]/30',
    ariaLabel: 'Tool call was injected and blocked by policy',
  },
  VIOLATION: {
    icon: '⚠',
    label: 'Violation',
    labelKo: '위반',
    colorClass: 'bg-[#FB7185]/15 text-[#FB7185] border-[#FB7185]/30',
    ariaLabel: 'Policy violation detected',
  },
  NEEDS_APPROVAL: {
    icon: '○',
    label: 'Needs Approval',
    labelKo: '승인 필요',
    colorClass: 'bg-amber-900/20 text-amber-400 border-amber-700/30',
    ariaLabel: 'Approval required but not granted',
  },
  ALLOWED: {
    icon: '✓',
    label: 'Allowed',
    labelKo: '허용',
    colorClass: 'bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/20',
    ariaLabel: 'Tool call was allowed',
  },
  ERROR: {
    icon: '!',
    label: 'Error (not a violation)',
    labelKo: '오류 (위반 아님)',
    colorClass: 'bg-orange-900/20 text-orange-400 border-orange-700/30',
    ariaLabel: 'An error occurred — this is not a policy violation',
  },
  PENDING: {
    icon: '○',
    label: 'Pending',
    labelKo: '대기 중',
    colorClass: 'bg-[#47303A]/30 text-[#9CA3AF] border-[#47303A]/50',
    ariaLabel: 'Pending policy check',
  },
};

export function VerdictBadge({ variant, size = 'md', className = '' }: VerdictBadgeProps) {
  const cfg = CONFIG[variant];
  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5 gap-1'
    : 'text-sm px-2.5 py-1 gap-1.5';

  return (
    <span
      role="status"
      aria-label={cfg.ariaLabel}
      className={[
        'inline-flex items-center font-mono font-medium rounded border',
        'motion-safe:transition-colors',
        sizeClass,
        cfg.colorClass,
        className,
      ].join(' ')}
    >
      <span aria-hidden="true">{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

/**
 * ActionEvent의 phase + verdict + agentProposed를 보고
 * 적절한 VerdictBadgeVariant를 결정하는 헬퍼.
 */
export function resolveVariant(
  phase: ActionPhase,
  verdict: PolicyVerdict | null,
  agentProposed: boolean
): VerdictBadgeVariant {
  if (phase === 'EXECUTED') return 'EXECUTED';
  if (phase === 'ERROR')    return 'ERROR';

  if (phase === 'BLOCKED') {
    if (verdict === 'NEEDS_APPROVAL') return 'NEEDS_APPROVAL';
    return agentProposed ? 'BLOCKED_AGENT' : 'BLOCKED_INJECTED';
  }

  if (phase === 'POLICY_CHECKED' || phase === 'PROPOSED') {
    if (verdict === 'ALLOWED')         return 'ALLOWED';
    if (verdict === 'VIOLATION')       return 'VIOLATION';
    if (verdict === 'NEEDS_APPROVAL')  return 'NEEDS_APPROVAL';
  }

  return 'PENDING';
}
