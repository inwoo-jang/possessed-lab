/**
 * Task 3.6 — Compare 화면 렌더링 검증
 *
 * 핵심:
 *   - 경고는 서버의 영어 메시지가 아니라 코드로 번역해서 보인다
 *   - 한쪽에만 있는 호출은 "호출되지 않음"으로 보이고 강제 주입 등으로 채워지지 않는다
 *   - 차이의 원인을 단정하지 않는다
 *   - REPLAY_DEMO는 사전 기록임을 항상 밝힌다
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { CompareView } from '@/components/compare/CompareView';
import type { RunComparison, RunComparisonSide } from '@/lib/types';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };

function side(over: Partial<RunComparisonSide> = {}): RunComparisonSide {
  return {
    id: 'run-a',
    experimentId: 'exp-a',
    scenarioId: 'scenario-a',
    runMode: 'LIVE_EXPERIMENT',
    status: 'COMPLETED',
    metadata: {
      model: 'gpt-4o', temperature: 0, promptVersion: 'ad-review-neutral-v2', policyVersion: 1,
      locale: 'en', variantId: null, userRequest: 'x', policyReviewConfirmed: false, finalAnswer: null,
    },
    policySnapshotAt: '2026-11-06T10:00:00.000Z',
    stats: { overreachAttempts: 0, executedCount: 1, blockedCount: 0, errorCount: 0, toolCallCount: 1 },
    ...over,
  };
}

const SAME_CALL = {
  toolName: 'read_terms', occurrenceIndex: 0, verdictA: 'ALLOWED', verdictB: 'ALLOWED',
  outcomeA: 'EXECUTED', outcomeB: 'EXECUTED', agentProposedA: true, agentProposedB: true, changed: false,
} as const;

const CHANGED_CALL = {
  toolName: 'update_ad', occurrenceIndex: 0, verdictA: 'VIOLATION', verdictB: 'ALLOWED',
  outcomeA: 'BLOCKED', outcomeB: 'EXECUTED', agentProposedA: true, agentProposedB: true, changed: true,
} as const;

function comparison(over: Partial<RunComparison> = {}): RunComparison {
  return {
    runA: side(),
    runB: side({ id: 'run-b', experimentId: 'exp-b' }),
    warnings: [],
    diff: [SAME_CALL],
    changedCount: 0,
    policyDiff: [],
    ...over,
  };
}

function view(locale: TestLocale, c: RunComparison) {
  return renderIn(locale, <CompareView comparison={c} names={{ a: 'First', b: 'Second' }} />);
}

describe.each(LOCALES)('CompareView (%s)', (locale) => {
  const m = messages[locale].compare;

  it('차이가 없으면 없다고 말하고 정책 차이도 없다고 한다', () => {
    const text = textOf(view(locale, comparison()));
    expect(text).toContain(m.noChanges);
    expect(text).toContain(m.policySame);
    expect(text).toContain(m.same);
  });

  it('바뀐 호출 수와 변화 표시를 보여준다 (색이 아니라 기호와 문구로)', () => {
    const html = view(locale, comparison({ diff: [SAME_CALL, CHANGED_CALL], changedCount: 1 }));
    const text = textOf(html);
    expect(text).toContain(m.changedCount.replace('{changed}', '1').replace('{total}', '2'));
    expect(text).toContain(m.changed);
    expect(html).toContain('△');
  });

  it('판정·결과 코드는 번역하지 않는다', () => {
    const text = textOf(view(locale, comparison({ diff: [CHANGED_CALL], changedCount: 1 })));
    expect(text).toContain('VIOLATION · BLOCKED');
    expect(text).toContain('ALLOWED · EXECUTED');
  });

  it('차이의 원인을 단정하지 않고 한 번씩만 실행한 결과임을 밝힌다', () => {
    const text = textOf(view(locale, comparison({ diff: [CHANGED_CALL], changedCount: 1 })));
    expect(text).toContain(m.causeNote);
  });

  it('한쪽에만 있는 호출은 "호출되지 않음"이고 제안 주체를 채우지 않는다', () => {
    const onlyA = {
      toolName: 'approve_ad', occurrenceIndex: 0, verdictA: 'NEEDS_APPROVAL', verdictB: null,
      outcomeA: 'BLOCKED', outcomeB: null, agentProposedA: true, agentProposedB: null, changed: true,
    } as const;
    const text = textOf(view(locale, comparison({ diff: [onlyA], changedCount: 1 })));
    expect(text).toContain(m.notCalled);
    expect(text).toContain(m.onlyA);
    // B 칸에는 제안 주체 문구가 없고, A 칸에만 있다
    expect(text.split(m.byAgent).length - 1).toBe(1);
    expect(text).not.toContain(m.byTest);
  });

  it('같은 도구의 두 번째 호출은 번호를 붙인다', () => {
    const second = { ...SAME_CALL, occurrenceIndex: 1 };
    const text = textOf(view(locale, comparison({ diff: [second] })));
    expect(text).toContain(m.occurrence.replace('{number}', '2'));
  });

  it('경고를 코드별로 번역한다 (서버의 영어 메시지를 쓰지 않는다)', () => {
    const c = comparison({
      runA: side({ runMode: 'LIVE_EXPERIMENT', scenarioId: 'scenario-a', status: 'COMPLETED' }),
      runB: side({ id: 'run-b', runMode: 'DETERMINISTIC_TEST', scenarioId: 'scenario-b', status: 'RUNNING' }),
      warnings: [
        { code: 'RUN_MODE_MISMATCH', message: 'SERVER ENGLISH MODE' },
        { code: 'SCENARIO_MISMATCH', message: 'SERVER ENGLISH SCENARIO' },
        { code: 'RUN_NOT_COMPLETED', message: 'SERVER ENGLISH UNFINISHED' },
      ],
    });
    const text = textOf(view(locale, c));
    expect(text).toContain(m.warnModeMismatch.replace('{a}', 'LIVE_EXPERIMENT').replace('{b}', 'DETERMINISTIC_TEST'));
    expect(text).toContain(m.warnScenarioMismatch.replace('{a}', 'scenario-a').replace('{b}', 'scenario-b'));
    expect(text).toContain(m.warnNotCompleted);
    expect(text).not.toContain('SERVER ENGLISH');
    expect(text).toContain(m.warningLabel);
  });

  it('정책 차이를 도구별로 보여준다', () => {
    const c = comparison({
      policyDiff: [
        { toolName: 'update_ad', a: { permission: 'DENIED', approvalGranted: null }, b: { permission: 'ALLOWED', approvalGranted: null } },
        { toolName: 'approve_ad', a: { permission: 'REQUIRES_APPROVAL', approvalGranted: false }, b: null },
      ],
    });
    const text = textOf(view(locale, c));
    expect(text).toContain(messages[locale].policy.denied);
    expect(text).toContain(messages[locale].policy.allowed);
    expect(text).toContain(m.mockApprovalNotGranted);
    expect(text).toContain(m.notInPolicy);
    expect(text).not.toContain(m.policySame);
  });

  it('실행 조건이 다르면 표시한다', () => {
    const c = comparison({
      runB: side({ id: 'run-b', metadata: { ...side().metadata, promptVersion: 'ad-review-neutral-v1' } }),
    });
    const html = view(locale, c);
    expect(textOf(html)).toContain(m.differs);
    expect(textOf(html)).toContain('ad-review-neutral-v1');
  });

  it('각 run의 trace·보고서 링크를 보여준다', () => {
    const html = view(locale, comparison());
    expect(html).toContain('/experiments/exp-a/runs/run-a/trace');
    expect(html).toContain('/experiments/exp-b/runs/run-b/report');
  });

  it('호출이 없으면 없다고 말한다', () => {
    const text = textOf(view(locale, comparison({ diff: [], changedCount: 0 })));
    expect(text).toContain(m.noCalls);
  });

  it('각 run이 하는 주장은 trace 화면과 같은 규칙을 따른다', () => {
    const text = textOf(
      view(locale, comparison({
        runA: side({ stats: { overreachAttempts: 2, executedCount: 1, blockedCount: 2, errorCount: 0, toolCallCount: 3 } }),
        runB: side({ id: 'run-b', runMode: 'DETERMINISTIC_TEST', stats: { overreachAttempts: 0, executedCount: 1, blockedCount: 1, errorCount: 0, toolCallCount: 2 } }),
      }))
    );
    expect(text).toContain(locale === 'en' ? '2 attempts' : '2회 시도');
    // 결정적 테스트는 과잉 행동을 측정하지 않으므로 "관측되지 않음"을 말하지 않는다
    expect(text.split(messages[locale].report.noOverreach).length - 1).toBe(0);
  });

  it('REPLAY_DEMO run은 사전 기록 고지를 보이고 관측 주장을 하지 않는다', () => {
    const text = textOf(
      view(locale, comparison({
        runA: side({ runMode: 'REPLAY_DEMO', stats: { overreachAttempts: 1, executedCount: 3, blockedCount: 1, errorCount: 0, toolCallCount: 4 } }),
      }))
    );
    expect(text).toContain(messages[locale].runMode.REPLAY_DEMO.fullLabel);
    expect(text).not.toContain(locale === 'en' ? '1 attempt' : '1회 시도');
  });
});
