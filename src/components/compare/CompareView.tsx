/**
 * CompareView — 두 run의 비교 결과 (표시 전용)
 *
 * 읽는 법을 지키는 규칙:
 *   - 호출은 step 번호가 아니라 (도구 이름, 같은 도구의 n번째 호출)로 맞춘다. 서버가 이미 맞춰 준다.
 *   - 실행 유형이 다르면(강제 주입 vs Agent 제안) 직접 비교할 수 없다고 경고한다.
 *   - 호출 한쪽에만 있으면 "없음"으로 보인다. 강제 주입으로 채우지 않는다.
 *   - 한 run씩의 비교이므로 차이가 정책 때문이라고 단정하지 않는다. 정책 차이는 따로 보여 주고,
 *     LLM의 실행 간 변동일 수 있다고 밝힌다.
 *   - 경고 문구는 서버가 주는 영어 메시지가 아니라 경고 코드로 번역한다.
 *   - 판정·결과 코드는 번역하지 않는다.
 */

import { useTranslations } from 'next-intl';
import { RunModeBadge } from '@/components/ui/RunModeBadge';
import { RunStatusLabel } from '@/components/ui/RunStatusLabel';
import { VerdictBadge, resolveVariant, type VerdictBadgeVariant } from '@/components/ui/VerdictBadge';
import { getObservation } from '@/lib/observation';
import { Link } from '@/i18n/navigation';
import type {
  ActionPhase,
  CallOutcome,
  ComparisonWarning,
  EventDiff,
  Locale,
  PolicyRuleDiff,
  PolicyVerdict,
  RunComparison,
  RunComparisonSide,
  ToolPermission,
} from '@/lib/types';

interface CompareViewProps {
  comparison: RunComparison;
  /** 각 run이 속한 실험 이름 */
  names: { a: string; b: string };
}

type SideKey = 'a' | 'b';

const PERMISSION_KEY = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  REQUIRES_APPROVAL: 'requiresApproval',
} as const satisfies Record<ToolPermission, 'allowed' | 'denied' | 'requiresApproval'>;

const linkClass =
  'underline underline-offset-4 hover:text-possessed-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-possessed-alert';

export function CompareView({ comparison, names }: CompareViewProps) {
  const t = useTranslations('compare');
  const { runA, runB, warnings, diff, changedCount, policyDiff } = comparison;

  return (
    <div className="space-y-8">
      {warnings.length > 0 && (
        <ul aria-label={t('warnings')} className="space-y-2">
          {warnings.map((w) => (
            <WarningItem key={w.code} warning={w} runA={runA} runB={runB} />
          ))}
        </ul>
      )}

      <section aria-labelledby="compare-runs" className="space-y-3">
        <h2 id="compare-runs" className="text-lg font-semibold">
          {t('runs')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SideCard side="a" run={runA} name={names.a} />
          <SideCard side="b" run={runB} name={names.b} />
        </div>
        <RunDetails runA={runA} runB={runB} />
      </section>

      <section aria-labelledby="compare-policy" className="space-y-3">
        <h2 id="compare-policy" className="text-lg font-semibold">
          {t('policyDiff')}
        </h2>
        {policyDiff.length === 0 ? (
          <p className="text-sm text-possessed-muted">{t('policySame')}</p>
        ) : (
          <PolicyDiffTable rows={policyDiff} />
        )}
      </section>

      <section aria-labelledby="compare-calls" className="space-y-3">
        <h2 id="compare-calls" className="text-lg font-semibold">
          {t('callDiff')}
        </h2>
        {diff.length === 0 ? (
          <p className="text-sm text-possessed-muted">{t('noCalls')}</p>
        ) : (
          <>
            <p className="text-sm text-possessed-text">
              {changedCount === 0 ? t('noChanges') : t('changedCount', { changed: changedCount, total: diff.length })}
            </p>
            <CallDiffTable rows={diff} />
            {changedCount > 0 && <p className="text-xs text-possessed-muted">{t('causeNote')}</p>}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 경고
// ---------------------------------------------------------------------------

function WarningItem({
  warning,
  runA,
  runB,
}: {
  warning: ComparisonWarning;
  runA: RunComparisonSide;
  runB: RunComparisonSide;
}) {
  const t = useTranslations('compare');

  const text =
    warning.code === 'RUN_MODE_MISMATCH'
      ? t('warnModeMismatch', { a: runA.runMode, b: runB.runMode })
      : warning.code === 'SCENARIO_MISMATCH'
        ? t('warnScenarioMismatch', { a: runA.scenarioId ?? '–', b: runB.scenarioId ?? '–' })
        : t('warnNotCompleted');

  return (
    <li role="note" className="flex items-start gap-2 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-300">
      <span aria-hidden="true">⚠</span>
      <span>
        <span className="font-semibold">{t('warningLabel')}: </span>
        {text}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// run 카드
// ---------------------------------------------------------------------------

function SideCard({ side, run, name }: { side: SideKey; run: RunComparisonSide; name: string }) {
  const t = useTranslations('compare');
  const tReport = useTranslations('report');
  const tTrace = useTranslations('trace');

  const observation = getObservation({
    runMode: run.runMode,
    status: run.status,
    toolCallCount: run.stats.toolCallCount,
    overreachAttempts: run.stats.overreachAttempts,
  });
  const label = side === 'a' ? t('runA') : t('runB');
  const base = `/experiments/${run.experimentId}/runs/${run.id}`;

  return (
    <article aria-label={`${label}: ${name}`} className="space-y-2 rounded-lg border border-possessed-border bg-possessed-surface p-4">
      <h3 className="text-sm font-semibold text-possessed-text">
        <span className="font-mono text-possessed-muted">{label} · </span>
        {name}
      </h3>

      {run.runMode === 'REPLAY_DEMO' ? (
        <RunModeBadge mode="REPLAY_DEMO" variant="full" />
      ) : (
        <RunModeBadge mode={run.runMode} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <RunStatusLabel status={run.status} />
        <span className="font-mono text-xs text-possessed-muted">
          {tTrace('toolCalls', { count: run.stats.toolCallCount })}
        </span>
      </div>

      {observation === 'OVERREACH' && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-possessed-alert">
          <span aria-hidden="true">⚠</span>
          <span>{tReport('attemptCount', { count: run.stats.overreachAttempts })}</span>
        </p>
      )}
      {observation === 'NONE_OBSERVED' && (
        <p className="flex items-center gap-1.5 text-sm text-possessed-success">
          <span aria-hidden="true">✓</span>
          <span>{tReport('noOverreach')}</span>
        </p>
      )}
      {observation === 'NO_TOOL_CALLS' && (
        <p className="flex items-center gap-1.5 text-sm text-possessed-muted">
          <span aria-hidden="true">–</span>
          <span>{tReport('noToolCalls')}</span>
        </p>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-possessed-muted">
        <Link href={`${base}/trace`} className={linkClass}>
          {t('openTrace')}
        </Link>
        <Link href={`${base}/report`} className={linkClass}>
          {t('openReport')}
        </Link>
      </p>
    </article>
  );
}

/** 두 run의 실행 조건. 다른 값은 표시한다 (비교 결과를 해석할 때 필요하다) */
function RunDetails({ runA, runB }: { runA: RunComparisonSide; runB: RunComparisonSide }) {
  const t = useTranslations('compare');
  const tTrace = useTranslations('trace');
  const tLocale = useTranslations('locale');

  const live = runA.runMode === 'LIVE_EXPERIMENT' || runB.runMode === 'LIVE_EXPERIMENT';
  const dash = '–';
  const rows: { label: string; a: string; b: string; mono?: boolean }[] = [
    ...(live
      ? [
          { label: tTrace('model'), a: runA.metadata.model ?? dash, b: runB.metadata.model ?? dash, mono: true },
          {
            label: tTrace('temperature'),
            a: runA.metadata.temperature === null ? dash : String(runA.metadata.temperature),
            b: runB.metadata.temperature === null ? dash : String(runB.metadata.temperature),
            mono: true,
          },
        ]
      : []),
    { label: tTrace('promptVersion'), a: runA.metadata.promptVersion, b: runB.metadata.promptVersion, mono: true },
    {
      label: tTrace('language'),
      a: tLocale(runA.metadata.locale as Locale),
      b: tLocale(runB.metadata.locale as Locale),
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('details')}</caption>
        <thead className="text-xs text-possessed-muted">
          <tr>
            <th scope="col" className="py-1 pr-4 font-normal">{t('details')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runA')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runB')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const differs = row.a !== row.b;
            return (
              <tr key={row.label} className="border-t border-possessed-border align-top">
                <th scope="row" className="py-1.5 pr-4 font-normal text-possessed-muted">
                  {row.label}
                  {differs && (
                    <span className="ml-2 text-xs text-amber-300">
                      <span aria-hidden="true">△ </span>
                      {t('differs')}
                    </span>
                  )}
                </th>
                <td className={`py-1.5 pr-4 text-possessed-text ${row.mono ? 'font-mono' : ''}`}>{row.a}</td>
                <td className={`py-1.5 pr-4 text-possessed-text ${row.mono ? 'font-mono' : ''}`}>{row.b}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 정책 diff
// ---------------------------------------------------------------------------

function PolicyDiffTable({ rows }: { rows: PolicyRuleDiff[] }) {
  const t = useTranslations('compare');
  const tPolicy = useTranslations('policy');

  const cell = (state: PolicyRuleDiff['a']) => {
    if (!state) return <span className="text-possessed-muted">{t('notInPolicy')}</span>;
    return (
      <>
        {tPolicy(PERMISSION_KEY[state.permission])}
        {state.permission === 'REQUIRES_APPROVAL' && state.approvalGranted !== null && (
          <span className="block text-xs text-possessed-muted">
            {state.approvalGranted ? tPolicy('mockApprovalGranted') : t('mockApprovalNotGranted')}
          </span>
        )}
      </>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('policyDiff')}</caption>
        <thead className="text-xs text-possessed-muted">
          <tr>
            <th scope="col" className="py-1 pr-4 font-normal">{tPolicy('toolName')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runA')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runB')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.toolName} className="border-t border-possessed-border align-top">
              <th scope="row" className="py-1.5 pr-4 font-mono font-normal text-possessed-text">{row.toolName}</th>
              <td className="py-1.5 pr-4 text-possessed-text">{cell(row.a)}</td>
              <td className="py-1.5 pr-4 text-possessed-text">{cell(row.b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 호출 diff
// ---------------------------------------------------------------------------

function outcomeVariant(
  outcome: CallOutcome,
  verdict: PolicyVerdict | null,
  agentProposed: boolean
): VerdictBadgeVariant {
  if (outcome === 'INCOMPLETE') return 'PENDING';
  return resolveVariant(outcome as ActionPhase, verdict, agentProposed);
}

function CallDiffTable({ rows }: { rows: EventDiff[] }) {
  const t = useTranslations('compare');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('callDiff')}</caption>
        <thead className="text-xs text-possessed-muted">
          <tr>
            <th scope="col" className="py-1 pr-4 font-normal">{t('tool')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runA')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('runB')}</th>
            <th scope="col" className="py-1 pr-4 font-normal">{t('change')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.toolName}#${row.occurrenceIndex}`}
              className={`border-t border-possessed-border align-top ${row.changed ? 'bg-possessed-surface' : ''}`}
            >
              <th scope="row" className="py-2 pr-4 font-mono font-normal text-possessed-text">
                {row.toolName}
                {row.occurrenceIndex > 0 && (
                  <span className="ml-1 font-sans text-xs text-possessed-muted">
                    {t('occurrence', { number: row.occurrenceIndex + 1 })}
                  </span>
                )}
              </th>
              <td className="py-2 pr-4">
                <CallCell outcome={row.outcomeA} verdict={row.verdictA} agentProposed={row.agentProposedA} />
              </td>
              <td className="py-2 pr-4">
                <CallCell outcome={row.outcomeB} verdict={row.verdictB} agentProposed={row.agentProposedB} />
              </td>
              <td className="py-2 pr-4">
                <ChangeLabel row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallCell({
  outcome,
  verdict,
  agentProposed,
}: {
  outcome: CallOutcome | null;
  verdict: PolicyVerdict | null;
  agentProposed: boolean | null;
}) {
  const t = useTranslations('compare');

  // 이 run에는 해당 호출이 없다. 강제 주입이나 허용으로 채우지 않는다.
  if (outcome === null) return <span className="text-possessed-muted">{t('notCalled')}</span>;

  return (
    <div className="space-y-1">
      <VerdictBadge variant={outcomeVariant(outcome, verdict, agentProposed ?? false)} size="sm" />
      <p className="font-mono text-xs text-possessed-muted">
        {verdict ?? '–'} · {outcome}
      </p>
      <p className="text-xs text-possessed-muted">{agentProposed ? t('byAgent') : t('byTest')}</p>
    </div>
  );
}

function ChangeLabel({ row }: { row: EventDiff }) {
  const t = useTranslations('compare');

  if (row.outcomeA === null) {
    return <span className="text-amber-300"><span aria-hidden="true">△ </span>{t('onlyB')}</span>;
  }
  if (row.outcomeB === null) {
    return <span className="text-amber-300"><span aria-hidden="true">△ </span>{t('onlyA')}</span>;
  }
  if (row.changed) {
    return <span className="text-amber-300"><span aria-hidden="true">△ </span>{t('changed')}</span>;
  }
  return <span className="text-possessed-muted"><span aria-hidden="true">= </span>{t('same')}</span>;
}
