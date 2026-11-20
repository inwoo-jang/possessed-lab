/**
 * Task 3.1 — Dashboard 컴포넌트 검증
 *
 * 핵심: 카드와 요약은 "근거가 있는 주장"만 한다.
 *   - 완료된 라이브 run만 "과잉 행동 N건 / 관측되지 않음"을 말한다
 *   - 실패·진행 중·결정적 테스트는 그런 주장을 하지 않는다
 *   - 측정된 run이 없으면 "0건"이 아니라 "측정된 것이 없음"이라고 한다
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { ExperimentCard, type ExperimentCardLastRun } from '@/components/dashboard/ExperimentCard';
import { OverreachSummaryCard } from '@/components/dashboard/OverreachSummaryCard';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };

function card(locale: TestLocale, lastRun: ExperimentCardLastRun | null) {
  return textOf(renderIn(locale, <ExperimentCard name="My experiment" scenarioName="Review ≠ Edit" lastRun={lastRun} />));
}

const run = (over: Partial<ExperimentCardLastRun>): ExperimentCardLastRun => ({
  runMode: 'LIVE_EXPERIMENT',
  status: 'COMPLETED',
  executedCount: 3,
  blockedCount: 0,
  overreachAttempts: 0,
  toolCallCount: 3,
  ...over,
});

/** 과잉 행동에 대해 무언가를 주장하는 문구인지 (시도 N건 / 관측되지 않음) */
function claimsAboutOverreach(locale: TestLocale, text: string): boolean {
  const noOverreach = messages[locale].report.noOverreach;
  const attempt = locale === 'en' ? /overreach|attempt/i : /시도|과잉/;
  return text.includes(noOverreach) || attempt.test(text);
}

describe.each(LOCALES)('ExperimentCard (%s)', (locale) => {
  it('실험 이름과 시나리오 이름을 보여준다', () => {
    const text = card(locale, null);
    expect(text).toContain('My experiment');
    expect(text).toContain('Review ≠ Edit');
  });

  it('실행 기록이 없으면 그렇게 말한다', () => {
    expect(card(locale, null)).toContain(messages[locale].dashboard.noRuns);
  });

  it('완료된 라이브 run에서 시도가 있으면 시도 횟수를 보여준다', () => {
    const text = card(locale, run({ overreachAttempts: 2, blockedCount: 2 }));
    expect(text).toContain(locale === 'en' ? '2 attempts' : '2회 시도');
    expect(text).not.toContain(messages[locale].report.noOverreach);
  });

  it('완료된 라이브 run에서 시도가 없으면 "관측되지 않음"이라고 한다', () => {
    const text = card(locale, run({ overreachAttempts: 0 }));
    expect(text).toContain(messages[locale].report.noOverreach);
  });

  it('완료됐지만 Agent가 도구를 한 번도 호출하지 않은 라이브 run은 "과잉 행동 없음"이라고 하지 않는다', () => {
    // 실제 모델에서 나온 사례: 검토 대상을 몰라 되묻기만 하고 끝났다 (이벤트 0개)
    const text = card(locale, run({ executedCount: 0, blockedCount: 0, overreachAttempts: 0, toolCallCount: 0 }));

    expect(text).toContain(messages[locale].report.noToolCalls);
    expect(text).not.toContain(messages[locale].report.noOverreach);
    expect(claimsAboutOverreach(locale, text)).toBe(false);
  });

  it('호출이 0건이면 시도 횟수가 있어도 주장하지 않는다 (방어적 확인)', () => {
    const text = card(locale, run({ overreachAttempts: 2, toolCallCount: 0 }));
    expect(text).not.toContain(locale === 'en' ? '2 attempts' : '2회 시도');
    expect(text).toContain(messages[locale].report.noToolCalls);
  });

  it('호출이 1건이라도 있으면 다시 "관측되지 않음"을 말할 수 있다', () => {
    const text = card(locale, run({ toolCallCount: 1, executedCount: 1 }));
    expect(text).toContain(messages[locale].report.noOverreach);
    expect(text).not.toContain(messages[locale].report.noToolCalls);
  });

  it('실패한 라이브 run은 과잉 행동에 대해 아무 주장도 하지 않는다', () => {
    const text = card(locale, run({ status: 'FAILED' }));
    expect(text).toContain(messages[locale].status.FAILED);
    expect(claimsAboutOverreach(locale, text)).toBe(false);
  });

  it.each(['PENDING', 'RUNNING'] as const)('%s 라이브 run도 과잉 행동에 대해 주장하지 않는다', (status) => {
    const text = card(locale, run({ status }));
    expect(text).toContain(messages[locale].status[status]);
    expect(claimsAboutOverreach(locale, text)).toBe(false);
  });

  it('결정적 테스트는 횟수만 보여주고 과잉 행동을 주장하지 않는다 (집계값이 있어도)', () => {
    // 방어적 확인: 잘못된 값(overreachAttempts: 3)이 넘어와도 카드가 그것을 주장으로 쓰지 않는다
    const text = card(locale, run({ runMode: 'DETERMINISTIC_TEST', executedCount: 3, blockedCount: 1, overreachAttempts: 3 }));
    expect(claimsAboutOverreach(locale, text)).toBe(false);
    expect(text).toContain(locale === 'en' ? '3 executed · 1 blocked' : '3회 실행 · 1회 차단');
  });

  it('완료되지 않은 run에는 실행·차단 횟수를 보여주지 않는다', () => {
    const text = card(locale, run({ status: 'RUNNING', executedCount: 1, blockedCount: 1 }));
    expect(text).not.toMatch(locale === 'en' ? /executed/i : /회 실행/);
  });

  it('실행 유형 배지를 함께 보여준다', () => {
    expect(card(locale, run({ runMode: 'LIVE_EXPERIMENT' }))).toContain(messages[locale].runMode.LIVE_EXPERIMENT.label);
    expect(card(locale, run({ runMode: 'DETERMINISTIC_TEST' }))).toContain(messages[locale].runMode.DETERMINISTIC_TEST.label);
  });

  it('상태는 색만이 아니라 텍스트로도 표시된다', () => {
    for (const status of ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const) {
      expect(card(locale, run({ status }))).toContain(messages[locale].status[status]);
    }
  });
});

describe('ExperimentCard — 제목 구조', () => {
  it('카드 제목은 h3이고 article로 감싼다 (페이지 h1/h2 아래 계층)', () => {
    const html = renderIn('en', <ExperimentCard name="X" scenarioName="Y" lastRun={null} />);
    expect(html).toMatch(/<article[^>]*>/);
    expect(html).toMatch(/<h3[^>]*>X<\/h3>/);
  });
});

const summary = (observed: number, inconclusive: number, attempts: number) => (
  <OverreachSummaryCard observedLiveRuns={observed} inconclusiveLiveRuns={inconclusive} overreachAttempts={attempts} />
);

describe.each(LOCALES)('OverreachSummaryCard (%s)', (locale) => {
  it('관측된 라이브 run이 없으면 숫자를 보여주지 않고 "측정된 것이 없음"이라고 한다', () => {
    const text = textOf(renderIn(locale, summary(0, 0, 0)));

    expect(text).toContain(messages[locale].dashboard.noLiveRuns);
    expect(text).not.toMatch(/\d/); // "0건"이라고 쓰지 않는다
  });

  it('시도 횟수는 항상 몇 번의 run에서 나온 값인지와 함께 보인다', () => {
    const text = textOf(renderIn(locale, summary(5, 0, 3)));
    expect(text).toContain(
      locale === 'en'
        ? '3 overreach attempts in 5 live runs where the agent used tools'
        : 'Agent가 도구를 사용한 라이브 실행 5회에서 과잉 행동 시도 3회'
    );
  });

  it('도구를 사용한 실행이 있고 시도가 없으면 0이 의미를 가진다 (실행 횟수와 함께)', () => {
    const text = textOf(renderIn(locale, summary(4, 0, 0)));
    expect(text).toContain(
      locale === 'en'
        ? '0 overreach attempts in 4 live runs where the agent used tools'
        : 'Agent가 도구를 사용한 라이브 실행 4회에서 과잉 행동 시도 0회'
    );
  });

  it('집계 기준을 안내한다', () => {
    const text = textOf(renderIn(locale, summary(1, 0, 1)));
    expect(text).toContain(messages[locale].dashboard.summaryNote);
  });

  it('제외된 실행이 없으면 제외 안내를 보여주지 않는다', () => {
    const text = textOf(renderIn(locale, summary(3, 0, 1)));
    expect(text).not.toContain(locale === 'en' ? 'not counted' : '제외됩니다');
  });

  it('도구를 호출하지 않아 제외된 실행이 있으면 몇 건인지 알린다', () => {
    const text = textOf(renderIn(locale, summary(4, 2, 2)));
    expect(text).toContain(
      locale === 'en'
        ? '2 completed live runs made no tool calls and are not counted.'
        : '도구를 호출하지 않은 완료된 라이브 실행 2회는 집계에서 제외됩니다.'
    );
  });

  it('호출한 run이 하나도 없으면 "0건"이 아니라 측정된 것이 없다고 하고, 제외 건수도 알린다', () => {
    const text = textOf(renderIn(locale, summary(0, 3, 0)));

    expect(text).toContain(messages[locale].dashboard.noObservedRuns);
    expect(text).toContain(locale === 'en' ? '3 completed live runs made no tool calls' : '도구를 호출하지 않은 완료된 라이브 실행 3회');
    // 시도 횟수 문장(과잉 행동 시도 N건)을 만들지 않는다
    expect(text).not.toMatch(locale === 'en' ? /overreach attempts? in/ : /과잉 행동 시도 \d/);
  });
});

describe('OverreachSummaryCard — 영어 단수형', () => {
  it('1건·1회는 단수로 표시한다', () => {
    const text = textOf(renderIn('en', summary(1, 0, 1)));
    expect(text).toMatch(/1 overreach attempt in 1 live run where/);
    expect(text).not.toContain('1 overreach attempts');
    expect(text).not.toContain('1 live runs');
  });

  it('제외된 실행 1건은 단수로 표시한다', () => {
    const text = textOf(renderIn('en', summary(2, 1, 0)));
    expect(text).toContain('1 completed live run made no tool calls and is not counted.');
  });
});
