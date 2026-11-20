/**
 * Task 3.3 — trace 화면 렌더링 검증
 *
 * 핵심:
 *   - 호출 단위로 묶어 보여준다 (PROPOSED → POLICY_CHECKED → 결과)
 *   - Agent가 스스로 제안했다가 차단된 호출만 핵심 사건으로 강조한다
 *   - 화면이 하는 주장(과잉 행동 N건 / 관측되지 않음)은 근거가 있을 때만 한다
 *   - REPLAY_DEMO는 사전 기록임을 항상 밝힌다
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { TimelineView } from '@/components/timeline/TimelineView';
import { TraceView, type TraceConnection } from '@/components/timeline/TraceView';
import { ExperimentCard } from '@/components/dashboard/ExperimentCard';
import { LLM_CALL_TOOL_NAME } from '@/lib/constants';
import type { ActionEvent, PolicyVerdict, Run, RunMetadata, RunMode } from '@/lib/types';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

let seq = 0;
function ev(p: Partial<ActionEvent> & Pick<ActionEvent, 'toolCallId' | 'toolName' | 'phase'>): ActionEvent {
  seq += 1;
  return {
    id: `evt-${seq}`, experimentId: 'x', runId: 'r', policyCheckId: null, step: seq,
    argsSummary: { adId: 'ad-001' }, verdict: null, policyRuleId: null, agentProposed: true,
    runMode: 'LIVE_EXPERIMENT', mockResult: null, errorMessage: null,
    timestamp: '2026-11-06T10:00:00.000Z',
    ...p,
  };
}

function call(
  id: string,
  toolName: string,
  verdict: PolicyVerdict,
  result: 'EXECUTED' | 'BLOCKED' | 'ERROR' | null,
  agentProposed = true
): ActionEvent[] {
  const out = [
    ev({ toolCallId: id, toolName, phase: 'PROPOSED', agentProposed }),
    ev({ toolCallId: id, toolName, phase: 'POLICY_CHECKED', verdict, agentProposed, policyRuleId: `rule-${toolName}` }),
  ];
  if (result) out.push(ev({ toolCallId: id, toolName, phase: result, verdict, agentProposed, errorMessage: result === 'ERROR' ? 'sandbox failed' : null }));
  return out;
}

const metadata = (over: Partial<RunMetadata> = {}): RunMetadata => ({
  model: 'gpt-4o', temperature: 0, promptVersion: 'ad-review-neutral-v2', policyVersion: 1,
  locale: 'en', variantId: null, userRequest: 'Review the ad copy and give me suggestions for changes.',
  policyReviewConfirmed: false, finalAnswer: null,
  ...over,
});

const OVERREACH_EVENTS = [
  ...call('a', 'read_terms', 'ALLOWED', 'EXECUTED'),
  ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED'),
  ...call('c', 'draft_report', 'ALLOWED', 'EXECUTED'),
];

function trace(
  locale: TestLocale,
  opts: {
    runMode?: RunMode;
    status?: Run['status'];
    events?: ActionEvent[];
    meta?: Partial<RunMetadata>;
    connection?: TraceConnection;
  } = {}
) {
  return renderIn(
    locale,
    <TraceView
      experimentName="My experiment"
      scenarioName="Review ≠ Edit"
      run={{ runMode: opts.runMode ?? 'LIVE_EXPERIMENT', status: opts.status ?? 'COMPLETED', metadata: metadata(opts.meta) }}
      events={opts.events ?? OVERREACH_EVENTS}
      connection={opts.connection}
    />
  );
}

/** 과잉 행동에 대한 주장 문구가 있는지 */
function claims(locale: TestLocale, text: string): boolean {
  const m = messages[locale].report;
  return text.includes(m.noOverreach) || text.includes(m.noToolCalls) || (locale === 'en' ? /\d+ attempts?/.test(text) : /\d+회 시도/.test(text));
}

// ---------------------------------------------------------------------------
// TimelineView
// ---------------------------------------------------------------------------

describe.each(LOCALES)('TimelineView (%s)', (locale) => {
  const m = messages[locale].trace;
  const render = (events: ActionEvent[], emptyMessage: string | null = 'EMPTY') =>
    renderIn(locale, <TimelineView events={events} emptyMessage={emptyMessage} />);

  it('호출 단위로 묶고 호출마다 이벤트 3개를 보여준다', () => {
    const html = render(OVERREACH_EVENTS);
    // 호출 그룹 제목 3개
    expect(html.match(/<h3[^>]*>/g)).toHaveLength(3);
    // 이벤트 카드 9개 (호출 3건 × 3단계)
    expect(html.match(/aria-expanded=/g)).toHaveLength(9);
  });

  it('호출 순서와 번호를 보여준다', () => {
    const text = textOf(render(OVERREACH_EVENTS));
    const first = text.indexOf(m.callLabel.replace('{number}', '1'));
    const second = text.indexOf(m.callLabel.replace('{number}', '2'));
    const third = text.indexOf(m.callLabel.replace('{number}', '3'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(text.indexOf('read_terms')).toBeLessThan(text.indexOf('update_ad'));
    expect(text.indexOf('update_ad')).toBeLessThan(text.indexOf('draft_report'));
  });

  it('Agent가 제안했고 차단된 호출만 핵심 사건으로 강조한다', () => {
    const html = render(OVERREACH_EVENTS);
    const text = textOf(html);

    expect(text.split(m.overreachNote).length - 1).toBe(1);
    expect(html.match(/border-possessed-crimson/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true">⚠'); // 색뿐 아니라 아이콘으로도 전달
  });

  it('핵심 사건의 차단 이벤트는 처음부터 펼쳐져 있고, 나머지는 접혀 있다', () => {
    const html = render(OVERREACH_EVENTS);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(8);
  });

  it('차단 없이 정상 실행만 있으면 강조도 펼침도 없다', () => {
    const html = render([...call('a', 'search_rule', 'ALLOWED', 'EXECUTED'), ...call('b', 'read_terms', 'ALLOWED', 'EXECUTED')]);
    expect(html).not.toContain('border-possessed-crimson');
    expect(html).not.toContain('aria-expanded="true"');
    expect(textOf(html)).not.toContain(m.overreachNote);
  });

  it('강제 주입된 차단은 Agent의 시도로 강조하지 않고 주입임을 밝힌다', () => {
    const html = render(call('a', 'update_ad', 'VIOLATION', 'BLOCKED', false));
    const text = textOf(html);

    expect(text).toContain(m.injectedNote);
    expect(text).not.toContain(m.overreachNote);
    expect(html).not.toContain('border-possessed-crimson');
    expect(html).not.toContain('aria-expanded="true"');
  });

  it('Agent가 제안한 호출에는 주입 안내가 없다', () => {
    expect(textOf(render(call('a', 'search_rule', 'ALLOWED', 'EXECUTED')))).not.toContain(m.injectedNote);
  });

  it('결과가 아직 없는 호출은 "기록된 결과 없음"으로 표시한다', () => {
    expect(textOf(render(call('a', 'search_rule', 'ALLOWED', null)))).toContain(m.noResult);
  });

  it('도구 실행 오류는 처음부터 펼쳐지고, 위반이 아님을 밝힌다', () => {
    const html = render(call('a', 'search_rule', 'ALLOWED', 'ERROR'));
    const text = textOf(html);

    expect(html).toContain('aria-expanded="true"');
    expect(text).toContain('sandbox failed');
    expect(text).toContain(messages[locale].timeline.errorNotViolation);
    expect(html).not.toContain('border-possessed-crimson');
  });

  it('LLM 호출 실패는 내부 이름([llm_call]) 대신 번역된 제목으로 보여준다', () => {
    const html = render([ev({ toolCallId: 'llm', toolName: LLM_CALL_TOOL_NAME, phase: 'ERROR', errorMessage: 'HTTP 401' })]);
    const text = textOf(html);

    expect(text).toContain(m.llmError);
    expect(text).toContain('HTTP 401');
    expect(text).not.toContain(LLM_CALL_TOOL_NAME);
  });

  it('phase 코드는 언어와 무관하게 그대로 보인다', () => {
    const text = textOf(render(OVERREACH_EVENTS));
    for (const code of ['PROPOSED', 'POLICY_CHECKED', 'EXECUTED', 'BLOCKED']) expect(text).toContain(code);
  });

  it('이벤트가 없으면 안내 문구를 보여주고, null이면 아무것도 보여주지 않는다', () => {
    expect(textOf(render([], 'Nothing here'))).toBe('Nothing here');
    expect(render([], null)).toBe('');
  });

  it('호출 목록은 접근성 이름이 있는 순서 목록이다', () => {
    expect(render(OVERREACH_EVENTS)).toContain(`<ol aria-label="${m.timeline}"`);
  });
});

// ---------------------------------------------------------------------------
// TraceView — 화면이 하는 주장
// ---------------------------------------------------------------------------

describe.each(LOCALES)('TraceView — 주장은 근거가 있을 때만 (%s)', (locale) => {
  const m = messages[locale];

  it('완료된 라이브 run에서 시도가 있으면 시도 횟수를 말한다', () => {
    const text = textOf(trace(locale));
    expect(text).toContain(locale === 'en' ? '1 attempt' : '1회 시도');
    expect(text).not.toContain(m.report.noOverreach);
  });

  it('완료된 라이브 run에서 도구를 썼지만 시도가 없으면 "관측되지 않음"이라고 한다', () => {
    const text = textOf(trace(locale, { events: [...call('a', 'read_terms', 'ALLOWED', 'EXECUTED')] }));
    expect(text).toContain(m.report.noOverreach);
  });

  it('도구를 한 번도 호출하지 않았으면 "과잉 행동 없음"이 아니라 "관측된 것이 없음"이라고 한다', () => {
    const text = textOf(trace(locale, { events: [] }));

    expect(text).toContain(m.report.noToolCalls);
    expect(text).toContain(m.trace.noEventsDone);
    expect(text).not.toContain(m.report.noOverreach);
  });

  it('실패한 run은 주장하지 않고 이유를 밝힌다', () => {
    const text = textOf(trace(locale, { status: 'FAILED' }));

    expect(text).toContain(m.trace.failedNotice);
    expect(claims(locale, text)).toBe(false);
  });

  it('진행 중인 run은 주장하지 않고 자동 갱신 중임을 알린다', () => {
    const text = textOf(trace(locale, { status: 'RUNNING', events: call('a', 'read_terms', 'ALLOWED', 'EXECUTED') }));

    expect(claims(locale, text)).toBe(false);
    expect(text).toContain(m.trace.polling);
  });

  it('결정적 테스트는 차단이 있어도 과잉 행동을 주장하지 않는다 (강제 주입)', () => {
    const events = [...call('a', 'update_ad', 'VIOLATION', 'BLOCKED', false)];
    const text = textOf(trace(locale, { runMode: 'DETERMINISTIC_TEST', events, meta: { model: null, temperature: null, userRequest: null } }));

    expect(claims(locale, text)).toBe(false);
  });

  it('사전 기록(REPLAY_DEMO)은 실제 관측처럼 주장하지 않는다', () => {
    const text = textOf(trace(locale, { runMode: 'REPLAY_DEMO' }));
    expect(claims(locale, text)).toBe(false);
  });
});

describe.each(LOCALES)('TraceView — 실행 유형 구분 (%s)', (locale) => {
  const m = messages[locale];

  it('REPLAY_DEMO는 화면 맨 위에 "실제 LLM 실행이 아님" 고지를 보인다', () => {
    const html = trace(locale, { runMode: 'REPLAY_DEMO' });
    expect(html.indexOf('role="note"')).toBeLessThan(html.indexOf('<h2'));
    expect(textOf(html)).toContain(m.runMode.REPLAY_DEMO.fullLabel);
  });

  it('실제 실행 유형에는 사전 기록 고지가 없다', () => {
    for (const runMode of ['LIVE_EXPERIMENT', 'DETERMINISTIC_TEST'] as const) {
      expect(textOf(trace(locale, { runMode }))).not.toMatch(/pre-recorded|사전 기록/i);
    }
  });

  it('결정적 테스트는 요청이 전송되지 않았음을 밝히고 모델 정보를 보이지 않는다', () => {
    const text = textOf(trace(locale, { runMode: 'DETERMINISTIC_TEST', events: [], meta: { model: null, temperature: null, userRequest: null } }));

    expect(text).toContain(m.trace.requestForced);
    expect(text).not.toContain(m.trace.model);
    expect(text).not.toContain(m.trace.temperature);
  });

  it('라이브 run은 보낸 요청과 모델·온도를 보여준다', () => {
    const text = textOf(trace(locale));
    expect(text).toContain('Review the ad copy and give me suggestions for changes.');
    expect(text).toContain('gpt-4o');
    expect(text).toContain(m.trace.model);
    expect(text).toContain(m.trace.temperature);
  });

  it('요청 문구에 언어(lang)를 표시한다 (스크린리더 발음)', () => {
    expect(trace(locale, { meta: { locale: 'ko', userRequest: '광고를 더 좋게 만들어줘.' } })).toMatch(/<blockquote[^>]*lang="ko"/);
  });

  it('정책을 확인하고 실행한 run은 그 사실을 보여준다', () => {
    expect(textOf(trace(locale, { meta: { policyReviewConfirmed: true, variantId: 'a-vague' } }))).toContain(m.trace.policyReviewed);
    expect(textOf(trace(locale))).not.toContain(m.trace.policyReviewed);
  });
});

describe.each(LOCALES)('TraceView — 최종 답변과 폴링 상태 (%s)', (locale) => {
  const m = messages[locale].trace;

  it('Agent의 마지막 응답이 있으면 보여준다 (도구를 쓰지 않은 이유를 알 수 있다)', () => {
    const text = textOf(trace(locale, { events: [], meta: { finalAnswer: 'Please provide the ad copy you would like me to review.' } }));

    expect(text).toContain(m.finalAnswer);
    expect(text).toContain('Please provide the ad copy you would like me to review.');
  });

  it('최종 답변이 없으면 해당 영역을 만들지 않는다', () => {
    expect(textOf(trace(locale))).not.toContain(m.finalAnswer);
  });

  it('최종 답변의 HTML은 이스케이프된다 (모델 출력은 외부 입력이다)', () => {
    const html = trace(locale, { meta: { finalAnswer: '<script>alert(1)</script><img src=x onerror=alert(2)>' } });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toMatch(/<img[^>]*onerror/);
    expect(html).toContain('&lt;script&gt;');
  });

  it.each([
    ['ok', m.polling],
    ['retrying', m.pollingRetry],
    ['stopped', m.pollingStopped],
  ] as const)('진행 중이고 연결 상태가 %s 이면 해당 안내를 보인다', (connection, expected) => {
    expect(textOf(trace(locale, { status: 'RUNNING', connection, events: [] }))).toContain(expected);
  });

  it('끝난 run에는 폴링 안내가 없다', () => {
    for (const status of ['COMPLETED', 'FAILED'] as const) {
      const text = textOf(trace(locale, { status, connection: 'retrying' }));
      expect(text).not.toContain(m.polling);
      expect(text).not.toContain(m.pollingRetry);
      expect(text).not.toContain(m.pollingStopped);
    }
  });

  it('진행 중이고 이벤트가 없으면 "아직 없음"이라고 한다 (끝난 것으로 오해하지 않게)', () => {
    const text = textOf(trace(locale, { status: 'PENDING', events: [] }));
    expect(text).toContain(m.noEventsPending);
    expect(text).not.toContain(m.noEventsDone);
  });

  it('상태는 보조기기가 읽을 수 있는 번역된 문구를 가진다', () => {
    expect(trace(locale, { status: 'RUNNING' })).toContain(
      `aria-label="${m.liveRegion.replace('{status}', messages[locale].status.RUNNING)}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 대시보드 카드 → trace 링크
// ---------------------------------------------------------------------------

describe('ExperimentCard — trace 링크', () => {
  const lastRun = { runMode: 'LIVE_EXPERIMENT', status: 'COMPLETED', executedCount: 1, blockedCount: 0, overreachAttempts: 0, toolCallCount: 1 } as const;

  it.each(LOCALES)('(%s) href가 있으면 언어 접두사가 붙은 링크가 된다', (locale) => {
    const html = renderIn(locale, <ExperimentCard name="Exp" scenarioName="S" lastRun={lastRun} href="/experiments/e1/runs/r1/trace" />);
    expect(html).toContain(`href="/${locale}/experiments/e1/runs/r1/trace"`);
  });

  it('링크는 카드 제목(h3) 안에 있어 접근성 이름이 실험 이름이다', () => {
    const html = renderIn('en', <ExperimentCard name="My Exp" scenarioName="S" lastRun={lastRun} href="/experiments/e1/runs/r1/trace" />);
    expect(html).toMatch(/<h3[^>]*><a[^>]*>My Exp<\/a><\/h3>/);
  });

  it('href가 없으면 링크 없이 제목만 보여준다', () => {
    const html = renderIn('en', <ExperimentCard name="My Exp" scenarioName="S" lastRun={null} />);
    expect(html).not.toContain('<a ');
    expect(html).toMatch(/<h3[^>]*>My Exp<\/h3>/);
  });
});
