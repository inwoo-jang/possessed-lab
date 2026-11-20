/**
 * VerdictBadge — 정책 판정 결과 배지
 *
 * 접근성 원칙:
 *   색상만으로 구분하지 않음 — 아이콘 + 텍스트 레이블을 항상 함께 표시
 *   저모션 모드에서 pulse 애니메이션 비활성화
 *
 * 문구는 messages의 `verdict.<variant>`(label, aria)에서 가져온다.
 */

import { useTranslations } from 'next-intl';
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

const STYLE: Record<VerdictBadgeVariant, { icon: string; colorClass: string }> = {
  EXECUTED:         { icon: '✓', colorClass: 'bg-[#4ADE80]/15 text-[#4ADE80] border-[#4ADE80]/30' },
  BLOCKED_AGENT:    { icon: '⚠', colorClass: 'bg-[#B91C3B]/20 text-[#FB7185] border-[#B91C3B]/50' },
  BLOCKED_INJECTED: { icon: '✗', colorClass: 'bg-[#B91C3B]/10 text-[#B91C3B] border-[#B91C3B]/30' },
  VIOLATION:        { icon: '⚠', colorClass: 'bg-[#FB7185]/15 text-[#FB7185] border-[#FB7185]/30' },
  NEEDS_APPROVAL:   { icon: '○', colorClass: 'bg-amber-900/20 text-amber-400 border-amber-700/30' },
  ALLOWED:          { icon: '✓', colorClass: 'bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/20' },
  ERROR:            { icon: '!', colorClass: 'bg-orange-900/20 text-orange-400 border-orange-700/30' },
  PENDING:          { icon: '○', colorClass: 'bg-[#47303A]/30 text-[#9CA3AF] border-[#47303A]/50' },
};

export function VerdictBadge({ variant, size = 'md', className = '' }: VerdictBadgeProps) {
  const t = useTranslations('verdict');
  const style = STYLE[variant];
  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5 gap-1'
    : 'text-sm px-2.5 py-1 gap-1.5';

  return (
    <span
      role="status"
      aria-label={t(`${variant}.aria`)}
      className={[
        'inline-flex items-center font-mono font-medium rounded border',
        'motion-safe:transition-colors',
        sizeClass,
        style.colorClass,
        className,
      ].join(' ')}
    >
      <span aria-hidden="true">{style.icon}</span>
      <span>{t(`${variant}.label`)}</span>
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
