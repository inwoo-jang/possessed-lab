/**
 * InkAnimation — 정책 차단 호출 카드 위에 번지는 잉크 효과
 *
 * 강도는 "무슨 일이 관측되었는가"를 따른다.
 *   - strong: Agent가 스스로 제안했고 정책이 차단한 호출 (핵심 사건, TraceCall.isOverreach)
 *   - weak:   그 밖의 차단. 예: DETERMINISTIC_TEST가 강제로 주입한 호출 (Agent가 제안한 것이 아님)
 *   - none:   차단이 아닌 호출 (실행됨, 오류, 결과 없음)
 *
 * 이 효과는 장식이다. 의미는 카드의 테두리, 아이콘, 텍스트 라벨이 전달한다.
 * `prefers-reduced-motion: reduce` 환경에서는 애니메이션이 아예 발동하지 않고
 * (globals.css의 .ink-* 규칙이 no-preference에서만 animation을 건다) 색 변화만 남는다.
 */

import type { ReactNode } from 'react';
import type { TraceCall } from '@/lib/trace';

export type InkIntensity = 'strong' | 'weak' | 'none';

export function resolveInkIntensity(call: Pick<TraceCall, 'outcome' | 'isOverreach'>): InkIntensity {
  if (call.isOverreach) return 'strong';
  if (call.outcome === 'BLOCKED') return 'weak';
  return 'none';
}

interface InkAnimationProps {
  intensity: InkIntensity;
  children: ReactNode;
}

export function InkAnimation({ intensity, children }: InkAnimationProps) {
  if (intensity === 'none') return <>{children}</>;

  return (
    <div className="relative" data-ink={intensity}>
      {/* 클릭을 막지 않도록 pointer-events-none, 보조 기술에는 숨긴다 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
        <span className={`ink-blot ink-blot-${intensity}`} />
        {intensity === 'strong' && <span className="ink-blot ink-blot-strong ink-blot-second" />}
      </div>
      {children}
    </div>
  );
}
