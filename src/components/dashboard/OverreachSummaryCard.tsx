/**
 * OverreachSummaryCard — Agent 과잉 행동 시도 요약
 *
 * 숫자는 항상 "몇 번의 run에서 나온 값인지"와 함께 보여준다.
 *   - 관측된 run이 없으면 "0건"이라고 쓰지 않는다. 측정된 것이 없는 것이지 과잉 행동이 없었던 것이 아니다.
 *   - Agent가 도구를 한 번도 호출하지 않은 완료된 라이브 run은 집계에서 빼고, 몇 건이 빠졌는지 알린다.
 *     (예: 검토 대상을 몰라 되묻기만 한 경우. 그런 run은 Agent의 행동을 관측하지 못했다.)
 */

import { useTranslations } from 'next-intl';

interface OverreachSummaryCardProps {
  /** 완료되었고 Agent가 도구를 한 번 이상 호출한 라이브 run 수 */
  observedLiveRuns: number;
  /** 완료되었지만 Agent가 도구를 전혀 호출하지 않아 집계에서 제외된 라이브 run 수 */
  inconclusiveLiveRuns: number;
  overreachAttempts: number;
}

export function OverreachSummaryCard({
  observedLiveRuns,
  inconclusiveLiveRuns,
  overreachAttempts,
}: OverreachSummaryCardProps) {
  const t = useTranslations('dashboard');

  const excludedNote =
    inconclusiveLiveRuns > 0 ? (
      <p className="mt-2 text-xs text-possessed-muted">{t('inconclusiveRuns', { count: inconclusiveLiveRuns })}</p>
    ) : null;

  if (observedLiveRuns === 0) {
    return (
      <div className="rounded-lg border border-possessed-border bg-possessed-surface p-4">
        <p className="text-sm text-possessed-muted">
          {inconclusiveLiveRuns > 0 ? t('noObservedRuns') : t('noLiveRuns')}
        </p>
        {excludedNote}
      </div>
    );
  }

  const hasOverreach = overreachAttempts > 0;

  return (
    <div
      className={[
        'rounded-lg border bg-possessed-surface p-4',
        hasOverreach ? 'border-possessed-crimson' : 'border-possessed-border',
      ].join(' ')}
    >
      <p
        className={[
          'flex items-center gap-2 text-lg font-semibold',
          hasOverreach ? 'text-possessed-alert' : 'text-possessed-success',
        ].join(' ')}
      >
        <span aria-hidden="true">{hasOverreach ? '⚠' : '✓'}</span>
        <span>{t('overreachObserved', { attempts: overreachAttempts, runs: observedLiveRuns })}</span>
      </p>
      {excludedNote}
      <p className="mt-2 text-xs text-possessed-muted">{t('summaryNote')}</p>
    </div>
  );
}
