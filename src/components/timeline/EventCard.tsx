/**
 * EventCard — 타임라인의 단일 ActionEvent 카드
 *
 * toolCallId로 묶인 PROPOSED → POLICY_CHECKED → EXECUTED/BLOCKED 그룹 중
 * 하나의 이벤트를 표시한다.
 *
 * agentProposed: true인 BLOCKED 이벤트는 "Agent Attempted — Blocked"으로
 * 가장 강하게 강조한다 — 이것이 POSSESSED가 관측하는 핵심 사건이다.
 */

import { useTranslations } from 'next-intl';
import { LLM_CALL_TOOL_NAME } from '@/lib/constants';
import type { ActionEvent } from '@/lib/types';
import { VerdictBadge, resolveVariant } from '@/components/ui/VerdictBadge';

interface EventCardProps {
  event: ActionEvent;
  /** 카드가 펼쳐져 있는지 여부 (argsSummary, mockResult 표시) */
  expanded?: boolean;
  onToggle?: () => void;
}

export function EventCard({ event, expanded = false, onToggle }: EventCardProps) {
  const t = useTranslations('timeline');
  const tTrace = useTranslations('trace');
  const variant = resolveVariant(event.phase, event.verdict, event.agentProposed);

  // LLM 호출 자체의 오류는 도구가 아니다. 내부 식별자([llm_call]) 대신 번역된 이름을 보여준다.
  const displayName = event.toolName === LLM_CALL_TOOL_NAME ? tTrace('llmError') : event.toolName;

  // agentProposed: true + BLOCKED → 가장 강한 강조 (핵심 Overreach 사건)
  const isOverreach = event.agentProposed && event.phase === 'BLOCKED';
  const borderColor = isOverreach
    ? 'border-[#B91C3B]'
    : event.phase === 'EXECUTED'
    ? 'border-[#4ADE80]/30'
    : 'border-[#47303A]';

  return (
    <div
      className={[
        'rounded-lg border bg-[#19131B] transition-colors',
        borderColor,
        isOverreach ? 'shadow-[0_0_12px_rgba(185,28,59,0.2)]' : '',
      ].join(' ')}
    >
      {/* 카드 헤더 */}
      <button
        type="button"
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#47303A]/10 rounded-lg"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={t('eventAria', { tool: displayName, phase: event.phase })}
      >
        {/* Step 번호 */}
        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-[#47303A]/40 text-[#9CA3AF] text-xs font-mono">
          {event.step}
        </span>

        {/* 도구 이름 + 위반 플래그 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-[#F5F3F4] truncate">
              {displayName}
            </span>

            {/* Agent가 스스로 시도했음을 명시 */}
            {event.agentProposed && (
              <span className="text-xs text-[#9CA3AF] italic shrink-0">
                {t('agentInitiated')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <VerdictBadge variant={variant} size="sm" />
            <span className="text-xs text-[#9CA3AF] font-mono">{event.phase}</span>
          </div>
        </div>

        {/* 타임스탬프 */}
        {/* 이전 색(#47303A)은 카드 배경 대비가 약 1.4:1이라 읽을 수 없어 muted 색을 쓴다 */}
        <time dateTime={event.timestamp} className="shrink-0 text-xs text-[#9CA3AF] font-mono">
          {formatTimestamp(event.timestamp)} UTC
        </time>
      </button>

      {/* 펼쳐진 상세 정보 */}
      {expanded && (
        <div className="border-t border-[#47303A] px-3 pb-3 pt-2 space-y-2">
          {/* Policy 판정 정보 */}
          {event.policyRuleId && (
            <DetailRow label={t('rule')} value={event.policyRuleId} />
          )}
          {event.toolCallId && (
            <DetailRow label="toolCallId" value={event.toolCallId} mono />
          )}
          {event.policyCheckId && (
            <DetailRow label="policyCheckId" value={event.policyCheckId} mono />
          )}

          {/* 인수 요약 */}
          {Object.keys(event.argsSummary).length > 0 && (
            <div>
              <span className="text-xs text-[#9CA3AF] uppercase tracking-wider">{t('args')}</span>
              <pre className="mt-1 text-xs font-mono bg-[#0B090D] text-[#F5F3F4] rounded p-2 overflow-x-auto">
                {JSON.stringify(event.argsSummary, null, 2)}
              </pre>
            </div>
          )}

          {/* Mock 실행 결과 */}
          {event.phase === 'EXECUTED' && event.mockResult != null && (
            <div>
              <span className="text-xs text-[#4ADE80] uppercase tracking-wider">{t('mockResult')}</span>
              <pre className="mt-1 text-xs font-mono bg-[#0B090D] text-[#4ADE80]/80 rounded p-2 overflow-x-auto">
                {JSON.stringify(event.mockResult, null, 2)}
              </pre>
            </div>
          )}

          {/* 에러 메시지 */}
          {event.errorMessage && (
            <div>
              <span className="text-xs text-orange-400 uppercase tracking-wider">{t('errorNotViolation')}</span>
              <p className="mt-1 text-xs font-mono text-orange-300 bg-[#0B090D] rounded p-2">
                {event.errorMessage}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="text-xs text-[#9CA3AF] uppercase tracking-wider shrink-0 w-24">{label}</span>
      <span className={['text-xs text-[#F5F3F4] break-all', mono ? 'font-mono' : ''].join(' ')}>
        {value}
      </span>
    </div>
  );
}

/**
 * 시각은 UTC로 고정해서 표시한다.
 * 서버(렌더링)와 브라우저(하이드레이션)의 시간대가 다르면 같은 시각이 다른 문자열이 되어
 * 하이드레이션 불일치가 생기기 때문이다.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });
}
