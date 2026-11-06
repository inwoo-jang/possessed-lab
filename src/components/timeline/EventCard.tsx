/**
 * EventCard — 타임라인의 단일 ActionEvent 카드
 *
 * toolCallId로 묶인 PROPOSED → POLICY_CHECKED → EXECUTED/BLOCKED 그룹 중
 * 하나의 이벤트를 표시한다.
 *
 * agentProposed: true인 BLOCKED 이벤트는 "Agent Attempted — Blocked"으로
 * 가장 강하게 강조한다 — 이것이 POSSESSED가 관측하는 핵심 사건이다.
 */

import type { ActionEvent } from '@/lib/types';
import { VerdictBadge, resolveVariant } from '@/components/ui/VerdictBadge';

interface EventCardProps {
  event: ActionEvent;
  /** 카드가 펼쳐져 있는지 여부 (argsSummary, mockResult 표시) */
  expanded?: boolean;
  onToggle?: () => void;
}

export function EventCard({ event, expanded = false, onToggle }: EventCardProps) {
  const variant = resolveVariant(event.phase, event.verdict, event.agentProposed);

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
        aria-label={`Event: ${event.toolName}, phase: ${event.phase}`}
      >
        {/* Step 번호 */}
        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-[#47303A]/40 text-[#9CA3AF] text-xs font-mono">
          {event.step}
        </span>

        {/* 도구 이름 + 위반 플래그 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-[#F5F3F4] truncate">
              {event.toolName}
            </span>

            {/* Agent가 스스로 시도했음을 명시 */}
            {event.agentProposed && (
              <span className="text-xs text-[#9CA3AF] italic shrink-0">
                Agent initiated
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <VerdictBadge variant={variant} size="sm" />
            <span className="text-xs text-[#9CA3AF] font-mono">{event.phase}</span>
          </div>
        </div>

        {/* 타임스탬프 */}
        <span className="shrink-0 text-xs text-[#47303A] font-mono">
          {formatTimestamp(event.timestamp)}
        </span>
      </button>

      {/* 펼쳐진 상세 정보 */}
      {expanded && (
        <div className="border-t border-[#47303A] px-3 pb-3 pt-2 space-y-2">
          {/* Policy 판정 정보 */}
          {event.policyRuleId && (
            <DetailRow label="Rule" value={event.policyRuleId} />
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
              <span className="text-xs text-[#9CA3AF] uppercase tracking-wider">Args</span>
              <pre className="mt-1 text-xs font-mono bg-[#0B090D] text-[#F5F3F4] rounded p-2 overflow-x-auto">
                {JSON.stringify(event.argsSummary, null, 2)}
              </pre>
            </div>
          )}

          {/* Mock 실행 결과 */}
          {event.phase === 'EXECUTED' && event.mockResult && (
            <div>
              <span className="text-xs text-[#4ADE80] uppercase tracking-wider">Mock Result</span>
              <pre className="mt-1 text-xs font-mono bg-[#0B090D] text-[#4ADE80]/80 rounded p-2 overflow-x-auto">
                {JSON.stringify(event.mockResult, null, 2)}
              </pre>
            </div>
          )}

          {/* 에러 메시지 */}
          {event.errorMessage && (
            <div>
              <span className="text-xs text-orange-400 uppercase tracking-wider">Error (not a violation)</span>
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

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return iso;
  }
}
