/**
 * ExperimentCard — 최근 실험 한 건의 요약 카드
 *
 * 무엇을 주장할 수 있는지는 lib/observation.ts의 규칙을 따른다 (trace 화면과 같은 규칙):
 *   - 완료된 LIVE (도구 호출 ≥ 1): 과잉 행동 시도 N건 / "관측되지 않음"
 *   - 완료된 LIVE (도구 호출 0)   : "관측된 것이 없음" (Agent가 아무것도 하지 않았다)
 *   - 완료된 DETERMINISTIC        : 실행·차단 횟수만 (호출을 강제로 주입했으므로 Agent 행동 측정이 아님)
 *   - FAILED / PENDING / RUNNING  : 상태만 (관측이 끝나지 않음)
 *
 * 상태는 색만으로 구분하지 않고 아이콘 + 텍스트를 함께 쓴다.
 * href가 있으면 이름이 링크가 되고, 링크의 클릭 영역이 카드 전체로 확장된다(stretched link).
 */

import { useTranslations } from 'next-intl';
import { RunModeBadge } from '@/components/ui/RunModeBadge';
import { RunStatusLabel } from '@/components/ui/RunStatusLabel';
import { Link } from '@/i18n/navigation';
import { getObservation } from '@/lib/observation';
import type { Run, RunMode } from '@/lib/types';

export interface ExperimentCardLastRun {
  runMode: RunMode;
  status: Run['status'];
  executedCount: number;
  blockedCount: number;
  overreachAttempts: number;
  /** Agent가 시도한 도구 호출 수. 0이면 관측된 것이 없다. */
  toolCallCount: number;
}

interface ExperimentCardProps {
  name: string;
  /** 현재 언어로 이미 번역된 시나리오 이름 */
  scenarioName: string;
  lastRun: ExperimentCardLastRun | null;
  /** 언어 접두사를 뺀 경로. 있으면 카드 전체가 이 경로로 가는 링크가 된다. */
  href?: string;
}

export function ExperimentCard({ name, scenarioName, lastRun, href }: ExperimentCardProps) {
  const t = useTranslations('dashboard');
  const tReport = useTranslations('report');

  const observation = lastRun ? getObservation(lastRun) : 'NOT_APPLICABLE';
  const completed = lastRun?.status === 'COMPLETED';

  const titleClass = 'text-base font-semibold text-possessed-text';

  return (
    <article className="relative rounded-lg border border-possessed-border bg-possessed-surface p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-possessed-alert hover:border-possessed-muted">
      <h3 className={titleClass}>
        {href ? (
          <Link href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
            {name}
          </Link>
        ) : (
          name
        )}
      </h3>
      <p className="mt-1 text-sm text-possessed-muted">
        {t('scenario')}: {scenarioName}
      </p>

      <div className="mt-3 border-t border-possessed-border pt-3">
        {lastRun === null ? (
          <p className="text-sm text-possessed-muted">{t('noRuns')}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <RunModeBadge mode={lastRun.runMode} />
              <RunStatusLabel status={lastRun.status} />
            </div>

            {completed && (
              <p className="font-mono text-xs text-possessed-muted">
                {t('counts', { executed: lastRun.executedCount, blocked: lastRun.blockedCount })}
              </p>
            )}

            {observation === 'NO_TOOL_CALLS' && (
              <p className="flex items-center gap-1.5 text-sm text-possessed-muted">
                <span aria-hidden="true">–</span>
                <span>{tReport('noToolCalls')}</span>
              </p>
            )}

            {(observation === 'OVERREACH' || observation === 'NONE_OBSERVED') && (
              <p
                className={
                  observation === 'OVERREACH'
                    ? 'flex items-center gap-1.5 text-sm font-medium text-possessed-alert'
                    : 'flex items-center gap-1.5 text-sm text-possessed-success'
                }
              >
                <span aria-hidden="true">{observation === 'OVERREACH' ? '⚠' : '✓'}</span>
                <span>
                  {observation === 'OVERREACH'
                    ? tReport('attemptCount', { count: lastRun.overreachAttempts })
                    : tReport('noOverreach')}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
