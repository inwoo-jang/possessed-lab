'use client';

/**
 * TimelineView — run의 이벤트를 "도구 호출" 단위로 묶어 보여준다
 *
 * 한 호출은 PROPOSED → POLICY_CHECKED → EXECUTED/BLOCKED/ERROR 이벤트로 기록되며
 * toolCallId로 묶인다 (묶기 규칙은 lib/trace.ts, run 비교 API와 공유).
 *
 * 표시 원칙:
 *   - Agent가 스스로 제안했는데 정책이 막은 호출(isOverreach)이 가장 눈에 띈다.
 *     색뿐 아니라 아이콘(⚠)과 문장으로도 전달한다.
 *   - 강제 주입된 호출은 Agent가 제안한 것이 아님을 밝힌다.
 *   - 결과가 아직 없는 호출은 "기록된 결과 없음"으로 표시한다 (진행 중이거나 중단됨).
 *   - 오류(ERROR)는 위반이 아니다. 배지에서 그렇게 밝힌다.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { VerdictBadge, resolveVariant } from '@/components/ui/VerdictBadge';
import { groupEventsIntoCalls, type TraceCall } from '@/lib/trace';
import type { ActionEvent } from '@/lib/types';
import { EventCard } from './EventCard';
import { InkAnimation, resolveInkIntensity } from './InkAnimation';

interface TimelineViewProps {
  events: ActionEvent[];
  /** 이벤트가 없을 때 보여줄 문구. null이면 아무것도 보여주지 않는다. */
  emptyMessage: string | null;
}

/** 처음부터 펼쳐 둘 이벤트: 핵심 사건(차단)과 오류. 나머지는 접어 둔다. */
function isOpenByDefault(call: TraceCall, event: ActionEvent): boolean {
  if (event.phase === 'ERROR') return true;
  return call.isOverreach && event.phase === 'BLOCKED';
}

export function TimelineView({ events, emptyMessage }: TimelineViewProps) {
  const t = useTranslations('trace');
  // 기본 상태에서 뒤집힌 이벤트의 id. 새 이벤트가 도착해도 사용자가 연 것은 유지된다.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());

  const calls = groupEventsIntoCalls(events);

  if (calls.length === 0) {
    return emptyMessage ? <p className="text-sm text-possessed-muted">{emptyMessage}</p> : null;
  }

  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ol aria-label={t('timeline')} className="space-y-4">
      {calls.map((call, index) => (
        <CallGroup
          key={call.toolCallId}
          call={call}
          number={index + 1}
          isExpanded={(event) => isOpenByDefault(call, event) !== flipped.has(event.id)}
          onToggle={toggle}
        />
      ))}
    </ol>
  );
}

function CallGroup({
  call,
  number,
  isExpanded,
  onToggle,
}: {
  call: TraceCall;
  number: number;
  isExpanded: (event: ActionEvent) => boolean;
  onToggle: (eventId: string) => void;
}) {
  const t = useTranslations('trace');

  const lastEvent = call.events[call.events.length - 1];
  const variant = call.isLlmError ? 'ERROR' : resolveVariant(lastEvent.phase, call.verdict, call.agentProposed);

  return (
    <li>
      <InkAnimation intensity={resolveInkIntensity(call)}>
        <div
          className={[
            'rounded-lg border p-3',
            call.isOverreach
              ? 'border-possessed-crimson bg-possessed-surface shadow-[0_0_14px_rgba(185,28,59,0.25)]'
              : 'border-possessed-border bg-possessed-bg',
          ].join(' ')}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-possessed-text">
              <span className="text-possessed-muted">{t('callLabel', { number })} · </span>
              {call.isLlmError ? t('llmError') : call.toolName}
            </h3>
            <VerdictBadge variant={variant} size="sm" />
            {call.outcome === 'INCOMPLETE' && <span className="text-xs text-possessed-muted">{t('noResult')}</span>}
          </div>

          {call.isOverreach && (
            <p className="mb-2 flex items-start gap-1.5 text-sm font-medium text-possessed-alert">
              <span aria-hidden="true">⚠</span>
              <span>{t('overreachNote')}</span>
            </p>
          )}
          {!call.agentProposed && !call.isLlmError && (
            <p className="mb-2 text-xs text-possessed-muted">{t('injectedNote')}</p>
          )}

          <ol className="space-y-1.5">
            {call.events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} expanded={isExpanded(event)} onToggle={() => onToggle(event.id)} />
              </li>
            ))}
          </ol>
        </div>
      </InkAnimation>
    </li>
  );
}
