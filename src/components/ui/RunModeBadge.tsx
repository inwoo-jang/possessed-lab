/**
 * RunModeBadge — 실행 유형 배지
 *
 * POSSESSED의 핵심 구분:
 *   LIVE_EXPERIMENT   — 실제 LLM 실행 (붉은 강조)
 *   DETERMINISTIC_TEST — 결정적 테스트 (파란 강조)
 *   REPLAY_DEMO       — 사전 기록 결과 (항상 구분 표시, 연한 색)
 *
 * REPLAY_DEMO는 full variant에서 "Pre-recorded result — not a live LLM run" 문구를 표시한다.
 * 문구는 messages의 `runMode.<mode>`(label, fullLabel, aria)에서 가져온다.
 */

import { useTranslations } from 'next-intl';
import type { RunMode } from '@/lib/types';

interface RunModeBadgeProps {
  mode: RunMode;
  /** full: 전체 설명 포함 / compact: 짧은 레이블만 */
  variant?: 'full' | 'compact';
  className?: string;
}

const STYLE: Record<RunMode, { icon: string; colorClass: string }> = {
  LIVE_EXPERIMENT:    { icon: '●', colorClass: 'bg-[#B91C3B]/15 text-[#FB7185] border-[#B91C3B]/40' },
  DETERMINISTIC_TEST: { icon: '◆', colorClass: 'bg-blue-900/20 text-blue-400 border-blue-700/30' },
  REPLAY_DEMO:        { icon: '▶', colorClass: 'bg-[#47303A]/30 text-[#9CA3AF] border-[#47303A]/50' },
};

export function RunModeBadge({ mode, variant = 'compact', className = '' }: RunModeBadgeProps) {
  const t = useTranslations('runMode');
  const style = STYLE[mode];

  return (
    <span
      role="status"
      aria-label={t(`${mode}.aria`)}
      className={[
        'inline-flex items-center gap-1.5 text-xs font-mono font-medium',
        'px-2 py-0.5 rounded border',
        style.colorClass,
        className,
      ].join(' ')}
    >
      <span aria-hidden="true" className={mode === 'LIVE_EXPERIMENT' ? 'animate-pulse motion-reduce:animate-none' : ''}>
        {style.icon}
      </span>
      <span>{variant === 'full' ? t(`${mode}.fullLabel`) : t(`${mode}.label`)}</span>
    </span>
  );
}
