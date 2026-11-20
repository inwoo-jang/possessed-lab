/**
 * Task 3.2 — ExperimentForm 초기 렌더링 검증
 *
 * 상호작용(클릭·제출)은 DOM이 없어 직접 다루지 않는다. 그 로직은 lib/experiment-form의
 * 순수 함수(tests/lib/experiment-form.test.ts)와 실제 API 계약(tests/api/form-contract.test.ts)에서 검증한다.
 */

import { describe, it, expect, vi } from 'vitest';

// 서버 렌더링 환경에는 App Router 컨텍스트가 없어 useRouter가 동작하지 않는다
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { ExperimentForm } from '@/components/experiment-form/ExperimentForm';
import { getScenarioOptions } from '@/server/experiments/scenario-options';
import type { FormRunMode } from '@/lib/experiment-form';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };
const scenarios = getScenarioOptions();

const render = (locale: TestLocale, opts: { liveAvailable?: boolean; initialRunMode?: FormRunMode } = {}) =>
  renderIn(
    locale,
    <ExperimentForm
      scenarios={scenarios}
      liveAvailable={opts.liveAvailable ?? true}
      initialRunMode={opts.initialRunMode ?? 'DETERMINISTIC_TEST'}
    />
  );

/** name 속성에 `suffix`가 들어간 라디오 input 태그들 */
const radios = (html: string, suffix: string) =>
  html.match(new RegExp(`<input[^>]*name="[^"]*${suffix}"[^>]*>`, 'g')) ?? [];

describe.each(LOCALES)('ExperimentForm (%s)', (locale) => {
  const m = messages[locale];

  it('실험 이름·시나리오·실행 유형·정책 영역을 모두 보여준다', () => {
    const text = textOf(render(locale));
    expect(text).toContain(m.experiment.nameLabel);
    expect(text).toContain(m.experiment.scenarioLabel);
    expect(text).toContain(m.experiment.runModeLabel);
    expect(text).toContain(m.policy.title);
    expect(text).toContain(m.experiment.start);
  });

  it('시나리오 세 개를 현재 언어 이름으로 보여준다', () => {
    const text = textOf(render(locale));
    for (const s of scenarios) expect(text).toContain(s.name[locale]);
    expect(radios(render(locale), 'scenario')).toHaveLength(3);
  });

  it('첫 시나리오가 기본 선택이다', () => {
    const [first, ...rest] = radios(render(locale), 'scenario');
    expect(first).toContain('checked');
    for (const r of rest) expect(r).not.toContain('checked');
  });

  it('실행 유형은 결정적 테스트와 라이브 두 가지뿐이고 REPLAY_DEMO는 선택할 수 없다', () => {
    const html = render(locale);
    expect(radios(html, 'runmode')).toHaveLength(2);
    expect(html).not.toContain('value="REPLAY_DEMO"');
    expect(html).toContain('value="DETERMINISTIC_TEST"');
    expect(html).toContain('value="LIVE_EXPERIMENT"');
  });

  it('결정적 테스트는 Agent 과잉 행동을 측정하지 않는다고 선택 시점에 알린다', () => {
    const text = textOf(render(locale));
    expect(text).toContain(m.experiment.runModeDeterministicHelp);
    expect(text).toContain(m.experiment.runModeLiveHelp);
  });

  it('브라우저 기본 검증은 끈다 (메시지가 페이지 언어를 따르도록)', () => {
    // React는 이 속성을 noValidate(camelCase)로 출력하므로 대소문자를 구분하지 않는다
    expect(render(locale)).toMatch(/<form[^>]*novalidate=""/i);
  });

  it('결정적 테스트에서는 요청 문구 선택 영역이 없다', () => {
    const html = render(locale);
    expect(textOf(html)).not.toContain(m.experiment.requestPreview);
    expect(radios(html, 'runlocale')).toHaveLength(0);
  });

  it('처음에는 정책 확인 경고가 없다 (기본 요청은 의미가 바뀌지 않음)', () => {
    const html = render(locale, { initialRunMode: 'LIVE_EXPERIMENT' });
    expect(textOf(html)).not.toContain(m.experiment.policyReviewRequired);
  });

  it('오류 영역은 오류가 있을 때만 나타난다', () => {
    expect(render(locale)).not.toContain('role="alert"');
  });

  it('정책 편집기를 포함하고 여섯 도구가 보인다', () => {
    const text = textOf(render(locale));
    for (const tool of ['search_rule', 'update_ad', 'approve_ad', 'send_external_message']) expect(text).toContain(tool);
    expect(text).toContain(m.policy.mockApprovalNotice);
  });
});

describe('ExperimentForm — 라이브 실행 가능 여부', () => {
  it('키가 없으면 라이브 선택지가 비활성화되고 이유가 보인다', () => {
    const html = render('en', { liveAvailable: false });
    const live = radios(html, 'runmode').find((r) => r.includes('LIVE_EXPERIMENT'))!;

    expect(live).toContain('disabled');
    expect(textOf(html)).toContain(en.experiment.liveUnavailable);
  });

  it('키가 없으면 결정적 테스트는 여전히 선택할 수 있다', () => {
    const html = render('en', { liveAvailable: false });
    const deterministic = radios(html, 'runmode').find((r) => r.includes('DETERMINISTIC_TEST'))!;
    expect(deterministic).not.toContain('disabled');
    expect(deterministic).toContain('checked');
  });

  it('키가 있으면 라이브 선택지가 활성화되고 이유 문구가 없다', () => {
    const html = render('en', { liveAvailable: true });
    const live = radios(html, 'runmode').find((r) => r.includes('LIVE_EXPERIMENT'))!;

    expect(live).not.toContain('disabled');
    expect(textOf(html)).not.toContain(en.experiment.liveUnavailable);
  });

  it('키가 없으면 라이브로 시작하자고 요청해도 결정적 테스트로 시작한다', () => {
    const html = render('en', { liveAvailable: false, initialRunMode: 'LIVE_EXPERIMENT' });
    const checked = radios(html, 'runmode').filter((r) => r.includes('checked'));

    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('DETERMINISTIC_TEST');
    expect(textOf(html)).not.toContain(en.experiment.requestPreview);
  });
});

describe('ExperimentForm — 라이브로 시작', () => {
  it('라이브가 선택되고 요청 문구 영역이 나타난다', () => {
    const html = render('en', { initialRunMode: 'LIVE_EXPERIMENT' });
    const checked = radios(html, 'runmode').filter((r) => r.includes('checked'));

    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('LIVE_EXPERIMENT');
    expect(textOf(html)).toContain(en.experiment.requestPreview);
    expect(textOf(html)).toContain(en.experiment.languageLabel);
  });

  it('Agent가 받게 될 요청의 미리보기는 UI 언어를 기본으로 한다', () => {
    const enText = textOf(render('en', { initialRunMode: 'LIVE_EXPERIMENT' }));
    const koText = textOf(render('ko', { initialRunMode: 'LIVE_EXPERIMENT' }));

    expect(enText).toContain(scenarios[0].baseRequest.en);
    expect(koText).toContain(scenarios[0].baseRequest.ko);
  });

  it('변형 선택지에 기본 요청과 첫 시나리오의 변형이 모두 나온다', () => {
    const html = render('en', { initialRunMode: 'LIVE_EXPERIMENT' });
    const text = textOf(html);

    expect(text).toContain(en.experiment.baseRequest);
    for (const v of scenarios[0].variants) expect(text).toContain(v.request.en);
    // 다른 시나리오의 변형은 보이지 않는다
    for (const v of scenarios[1].variants) expect(text).not.toContain(v.request.en);
  });

  it('요청 언어 선택지는 영어와 한국어다', () => {
    const html = render('en', { initialRunMode: 'LIVE_EXPERIMENT' });
    expect(radios(html, 'runlocale')).toHaveLength(2);
  });

  it('미리보기 블록에 요청 언어(lang)가 표시된다 (스크린리더 발음)', () => {
    expect(render('ko', { initialRunMode: 'LIVE_EXPERIMENT' })).toMatch(/<blockquote[^>]*lang="ko"/);
  });
});
