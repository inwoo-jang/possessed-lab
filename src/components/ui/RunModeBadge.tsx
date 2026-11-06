/**
 * RunModeBadge — 실행 유형 배지
 *
 * POSSESSED의 핵심 구분:
 *   LIVE_EXPERIMENT   — 실제 LLM 실행 (붉은 강조)
 *   DETERMINISTIC_TEST — 결정적 테스트 (파란 강조)
 *   REPLAY_DEMO       — 사전 기록 결과 (항상 구분 표시, 연한 색)
 *
 * REPLAY_DEMO는 반드시 "Pre-recorded result — not a live LLM run" 문구를 표시.
 */

import type { RunMode } from '@/lib/types';

interface RunModeBadgeProps {
  mode: RunMode;
  /** full: 전체 설명 포함 / compact: 짧은 레이블만 */
  variant?: 'full' | 'compact';
  className?: string;
}

const CONFIG: Record<
  RunMode,
  { icon: string; label: string; fullLabel: string; colorClass: string; ariaLabel: string }
> = {
  LIVE_EXPERIMENT: {
    icon: '●',
    label: 'Live LLM Run',
    fullLabel: 'Live LLM Run',
    colorClass: 'bg-[#B91C3B]/15 text-[#FB7185] border-[#B91C3B]/40',
    ariaLabel: 'Live LLM experiment — real agent behavior',
  },
  DETERMINISTIC_TEST: {
    icon: '◆',
    label: 'Deterministic Test',
    fullLabel: 'Deterministic Test',
    colorClass: 'bg-blue-900/20 text-blue-400 border-blue-700/30',
    ariaLabel: 'Deterministic test — forced tool calls, no LLM',
  },
  REPLAY_DEMO: {
    icon: '▶',
    label: 'Pre-recorded',
    fullLabel: 'Pre-recorded result — not a live LLM run',
    colorClass: 'bg-[#47303A]/30 text-[#9CA3AF] border-[#47303A]/50',
    ariaLabel: 'Pre-recorded demo result — not a live LLM run',
  },
};

export function RunModeBadge({ mode, variant = 'compact', className = '' }: RunModeBadgeProps) {
  const cfg = CONFIG[mode];
  const label = variant === 'full' ? cfg.fullLabel : cfg.label;

  return (
    <span
      role="status"
      aria-label={cfg.ariaLabel}
      className={[
        'inline-flex items-center gap-1.5 text-xs font-mono font-medium',
        'px-2 py-0.5 rounded border',
        cfg.colorClass,
        className,
      ].join(' ')}
    >
      <span aria-hidden="true" className={mode === 'LIVE_EXPERIMENT' ? 'animate-pulse motion-reduce:animate-none' : ''}>
        {cfg.icon}
      </span>
      <span>{label}</span>
    </span>
  );
}
