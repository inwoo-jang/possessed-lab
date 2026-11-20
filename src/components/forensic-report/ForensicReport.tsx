/**
 * ForensicReport — 끝난 run 하나를 사후에 읽는 보고서 (표시 전용)
 *
 * 구성: 요약 → 적용된 정책(스냅샷) → Agent가 스스로 시도한 호출 → 강제 주입으로 차단된 호출 → 그 밖의 호출
 *
 * 주장 규칙은 trace 화면·대시보드 카드와 같다 (lib/observation.ts).
 *   - 완료된 라이브 run만 "시도 N건 / 관측되지 않음 / 도구 호출 없음"을 말한다.
 *   - 결정적 테스트의 차단은 Agent의 행동이 아니므로 별도 구역에 두고 그렇게 밝힌다.
 *   - 오류(ERROR)는 위반이 아니다.
 * REPLAY_DEMO는 맨 위에 "사전 기록 결과 — 실제 LLM 실행이 아님" 고지를 항상 보인다.
 *
 * 호출 인수는 buildReportSections가 표시 직전에 마스킹한다.
 */

import { useTranslations } from 'next-intl';
import { RunModeBadge } from '@/components/ui/RunModeBadge';
import { RunStatusLabel } from '@/components/ui/RunStatusLabel';
import { VerdictBadge, resolveVariant } from '@/components/ui/VerdictBadge';
import { LLM_CALL_TOOL_NAME } from '@/lib/constants';
import { summarizeEvents } from '@/lib/event-stats';
import { getObservation } from '@/lib/observation';
import { buildReportSections, referencedRuleIds } from '@/lib/report';
import { isTerminalStatus } from '@/lib/trace-polling';
import type { TraceCall } from '@/lib/trace';
import type { ActionEvent, PolicyRule, PolicySnapshot, Run, RunMode, ToolPermission } from '@/lib/types';
import { formatTimestamp } from '@/components/timeline/EventCard';

interface ForensicReportProps {
  experimentName: string;
  /** 현재 언어로 이미 번역된 시나리오 이름 */
  scenarioName: string;
  run: { runMode: RunMode; status: Run['status']; policySnapshot: PolicySnapshot };
  events: ActionEvent[];
}

const PERMISSION_KEY = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  REQUIRES_APPROVAL: 'requiresApproval',
} as const satisfies Record<ToolPermission, 'allowed' | 'denied' | 'requiresApproval'>;

export function ForensicReport({ experimentName, scenarioName, run, events }: ForensicReportProps) {
  const t = useTranslations('report');
  const tTrace = useTranslations('trace');
  const tStatus = useTranslations('status');

  const sections = buildReportSections(events);
  const cited = referencedRuleIds(sections);
  const stats = summarizeEvents(events);
  const observation = getObservation({
    runMode: run.runMode,
    status: run.status,
    toolCallCount: stats.toolCallCount,
    overreachAttempts: stats.overreachAttempts,
  });
  const finished = isTerminalStatus(run.status);

  return (
    <div className="space-y-8">
      {run.runMode === 'REPLAY_DEMO' && (
        <div role="note" className="rounded-lg border border-possessed-border bg-possessed-surface p-3">
          <RunModeBadge mode="REPLAY_DEMO" variant="full" />
        </div>
      )}

      <section aria-labelledby="report-summary" className="space-y-3">
        <h2 id="report-summary" className="text-lg font-semibold">
          {t('summary')}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          {run.runMode !== 'REPLAY_DEMO' && <RunModeBadge mode={run.runMode} />}
          <span role="status" aria-label={tTrace('liveRegion', { status: tStatus(run.status) })}>
            <RunStatusLabel status={run.status} />
          </span>
          <span className="font-mono text-xs text-possessed-muted">
            {tTrace('toolCalls', { count: stats.toolCallCount })}
          </span>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-possessed-muted">{tTrace('experiment')}</dt>
          <dd className="text-possessed-text">{experimentName}</dd>
          <dt className="text-possessed-muted">{tTrace('scenario')}</dt>
          <dd className="text-possessed-text">{scenarioName}</dd>
        </dl>

        {!finished && (
          <p role="note" className="text-sm text-possessed-muted">
            {t('inProgress')}
          </p>
        )}
        {run.status === 'FAILED' && (
          <p role="note" className="flex items-start gap-1.5 text-sm text-possessed-alert">
            <span aria-hidden="true">✗</span>
            <span>{tTrace('failedNotice')}</span>
          </p>
        )}
        {observation === 'OVERREACH' && (
          <p className="flex items-center gap-1.5 text-base font-semibold text-possessed-alert">
            <span aria-hidden="true">⚠</span>
            <span>{t('attemptCount', { count: stats.overreachAttempts })}</span>
          </p>
        )}
        {observation === 'NONE_OBSERVED' && (
          <p className="flex items-center gap-1.5 text-base text-possessed-success">
            <span aria-hidden="true">✓</span>
            <span>{t('noOverreach')}</span>
          </p>
        )}
        {observation === 'NO_TOOL_CALLS' && (
          <p className="flex items-center gap-1.5 text-base text-possessed-muted">
            <span aria-hidden="true">–</span>
            <span>{t('noToolCalls')}</span>
          </p>
        )}
      </section>

      <PolicySummary policy={run.policySnapshot} cited={cited} />

      <CallSection
        id="report-agent"
        heading={t('agentAttemptsHeading')}
        calls={sections.agentAttempts}
        emphasis
      />
      <CallSection
        id="report-injected"
        heading={t('injectedHeading')}
        note={sections.injectedBlocks.length > 0 ? t('injectedNote') : undefined}
        calls={sections.injectedBlocks}
      />
      <CallSection id="report-normal" heading={t('normalHeading')} calls={sections.normalCalls} />
    </div>
  );
}

function PolicySummary({ policy, cited }: { policy: PolicySnapshot; cited: ReadonlySet<string> }) {
  const t = useTranslations('report');
  const tPolicy = useTranslations('policy');

  return (
    <section aria-labelledby="report-policy" className="space-y-3">
      <h2 id="report-policy" className="text-lg font-semibold">
        {t('policySnapshot')}
      </h2>
      <p className="text-sm text-possessed-muted">{t('policySnapshotIntro')}</p>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-possessed-muted">{tPolicy('title')}</dt>
        <dd className="text-possessed-text">{t('policyName', { name: policy.name, version: policy.version })}</dd>
        <dt className="text-possessed-muted">{t('snapshotAt')}</dt>
        <dd className="font-mono text-possessed-text">
          <time dateTime={policy.snapshotAt}>{formatTimestamp(policy.snapshotAt)} UTC</time>
        </dd>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-possessed-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-normal">{tPolicy('toolName')}</th>
              <th scope="col" className="py-1 pr-4 font-normal">{tPolicy('permission')}</th>
              <th scope="col" className="py-1 pr-4 font-normal">{t('ruleId')}</th>
            </tr>
          </thead>
          <tbody>
            {policy.rules.map((rule) => (
              <PolicyRow key={rule.id} rule={rule} isCited={cited.has(rule.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {policy.rules.some((r) => r.permission === 'REQUIRES_APPROVAL') && (
        <p className="text-xs text-possessed-muted">{tPolicy('mockApprovalNotice')}</p>
      )}
    </section>
  );
}

function PolicyRow({ rule, isCited }: { rule: PolicyRule; isCited: boolean }) {
  const t = useTranslations('report');
  const tPolicy = useTranslations('policy');

  return (
    <tr className="border-t border-possessed-border align-top">
      <td className="py-1.5 pr-4 font-mono text-possessed-text">{rule.toolName}</td>
      <td className="py-1.5 pr-4 text-possessed-text">
        {tPolicy(PERMISSION_KEY[rule.permission])}
        {rule.permission === 'REQUIRES_APPROVAL' && rule.mockApprovalState?.granted && (
          <span className="block text-xs text-possessed-muted">{tPolicy('mockApprovalGranted')}</span>
        )}
      </td>
      <td className="py-1.5 pr-4 font-mono text-xs text-possessed-muted">
        {rule.id}
        {isCited && (
          <span className="mt-0.5 flex items-center gap-1 font-sans text-possessed-alert">
            <span aria-hidden="true">←</span>
            <span>{t('referencedByCall')}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

function CallSection({
  id,
  heading,
  note,
  calls,
  emphasis = false,
}: {
  id: string;
  heading: string;
  note?: string;
  calls: TraceCall[];
  emphasis?: boolean;
}) {
  const t = useTranslations('report');

  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      {note && <p className="text-sm text-possessed-muted">{note}</p>}
      {calls.length === 0 ? (
        <p className="text-sm text-possessed-muted">{t('none')}</p>
      ) : (
        <ol className="space-y-3">
          {calls.map((call) => (
            <ReportCall key={call.toolCallId} call={call} emphasis={emphasis} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ReportCall({ call, emphasis }: { call: TraceCall; emphasis: boolean }) {
  const t = useTranslations('report');
  const tTrace = useTranslations('trace');
  const tTimeline = useTranslations('timeline');

  const lastEvent = call.events[call.events.length - 1];
  const variant = call.isLlmError ? 'ERROR' : resolveVariant(lastEvent.phase, call.verdict, call.agentProposed);
  const name = call.toolName === LLM_CALL_TOOL_NAME ? tTrace('llmError') : call.toolName;
  const hasArgs = Object.keys(call.argsSummary).length > 0;

  return (
    <li
      className={[
        'rounded-lg border p-3',
        emphasis
          ? 'border-possessed-crimson bg-possessed-surface shadow-[0_0_14px_rgba(185,28,59,0.25)]'
          : 'border-possessed-border bg-possessed-bg',
      ].join(' ')}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm font-semibold text-possessed-text">{name}</h3>
        <VerdictBadge variant={variant} size="sm" />
      </div>

      {call.agentProposed && !call.isLlmError && call.isOverreach && (
        <p className="mb-2 flex items-start gap-1.5 text-sm font-medium text-possessed-alert">
          <span aria-hidden="true">⚠</span>
          <span>{t('agentAttempted')}</span>
        </p>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
        <dt className="text-possessed-muted">{t('callId')}</dt>
        <dd className="break-all font-mono text-possessed-text">{call.toolCallId}</dd>

        <dt className="text-possessed-muted">{t('proposedBy')}</dt>
        <dd className="text-possessed-text">{call.agentProposed ? t('proposedByAgent') : t('proposedByTest')}</dd>

        <dt className="text-possessed-muted">{t('verdictCode')}</dt>
        <dd className="font-mono text-possessed-text">{call.verdict ?? '–'}</dd>

        <dt className="text-possessed-muted">{t('outcome')}</dt>
        <dd className="font-mono text-possessed-text">{call.outcome}</dd>

        <dt className="text-possessed-muted">{tTimeline('rule')}</dt>
        <dd className="break-all font-mono text-possessed-text">{call.policyRuleId ?? t('noRule')}</dd>

        {hasArgs && (
          <>
            <dt className="text-possessed-muted">{tTimeline('args')}</dt>
            <dd>
              <pre className="overflow-x-auto rounded bg-possessed-bg p-2 font-mono text-possessed-text">
                {JSON.stringify(call.argsSummary, null, 2)}
              </pre>
            </dd>
          </>
        )}

        {call.errorMessage && (
          <>
            <dt className="text-orange-400">{tTimeline('errorNotViolation')}</dt>
            <dd className="font-mono text-orange-300">{call.errorMessage}</dd>
          </>
        )}
      </dl>
    </li>
  );
}
