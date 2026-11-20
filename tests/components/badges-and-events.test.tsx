/**
 * 번역 연결 검증 — VerdictBadge / RunModeBadge / EventCard
 *
 * Phase 2에서 남긴 기준을 실제 렌더링으로 확인한다:
 *   "ATTEMPTED/BLOCKED/EXECUTED 등 코드는 언어와 무관하게 동일하게 표시된다"
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { VerdictBadge, type VerdictBadgeVariant } from '@/components/ui/VerdictBadge';
import { RunModeBadge } from '@/components/ui/RunModeBadge';
import { EventCard } from '@/components/timeline/EventCard';
import { ACTION_PHASES, RUN_MODES } from '@/lib/constants';
import type { ActionEvent } from '@/lib/types';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };
const VARIANTS = Object.keys(en.verdict) as VerdictBadgeVariant[];

const baseEvent: ActionEvent = {
  id: 'e1',
  experimentId: 'x',
  runId: 'r',
  toolCallId: 'tc-1',
  policyCheckId: 'pc-1',
  step: 0,
  toolName: 'update_ad',
  argsSummary: { adId: 'ad-001' },
  phase: 'BLOCKED',
  verdict: 'VIOLATION',
  policyRuleId: 'rule-update_ad',
  agentProposed: true,
  runMode: 'LIVE_EXPERIMENT',
  mockResult: null,
  errorMessage: null,
  timestamp: '2026-11-06T10:00:00.000Z',
};

describe.each(LOCALES)('VerdictBadge (%s)', (locale) => {
  it.each(VARIANTS)('%s: 번역된 레이블이 화면에 보이고 보조기기용 설명이 달린다', (variant) => {
    const html = renderIn(locale, <VerdictBadge variant={variant} />);
    const m = messages[locale].verdict[variant];

    expect(textOf(html)).toContain(m.label);
    expect(html).toContain(`aria-label="${m.aria}"`);
  });

  it('색상만이 아니라 아이콘 + 텍스트로 상태를 표현한다 (접근성)', () => {
    const html = renderIn(locale, <VerdictBadge variant="BLOCKED_AGENT" />);
    expect(html).toContain('aria-hidden="true"'); // 장식 아이콘
    expect(textOf(html).length).toBeGreaterThan(1); // 텍스트 레이블 존재
  });
});

describe('VerdictBadge 언어별 차이', () => {
  it('같은 variant가 언어에 따라 다른 문구로 보인다', () => {
    const enHtml = textOf(renderIn('en', <VerdictBadge variant="BLOCKED_AGENT" />));
    const koHtml = textOf(renderIn('ko', <VerdictBadge variant="BLOCKED_AGENT" />));

    expect(enHtml).toContain('Agent Attempted — Blocked');
    expect(koHtml).toContain('Agent 시도 — 차단됨');
  });

  it('ERROR는 두 언어 모두 "위반이 아님"을 화면에서 밝힌다', () => {
    expect(textOf(renderIn('en', <VerdictBadge variant="ERROR" />))).toContain('not a violation');
    expect(textOf(renderIn('ko', <VerdictBadge variant="ERROR" />))).toContain('위반 아님');
  });
});

describe.each(LOCALES)('RunModeBadge (%s)', (locale) => {
  it.each(RUN_MODES)('%s: compact는 짧은 레이블, full은 전체 레이블을 보여준다', (mode) => {
    const m = messages[locale].runMode[mode];

    expect(textOf(renderIn(locale, <RunModeBadge mode={mode} variant="compact" />))).toContain(m.label);
    expect(textOf(renderIn(locale, <RunModeBadge mode={mode} variant="full" />))).toContain(m.fullLabel);
  });
});

describe('REPLAY_DEMO 고지', () => {
  it('full 표시에 "실제 LLM 실행이 아님"이 두 언어 모두 나온다', () => {
    expect(textOf(renderIn('en', <RunModeBadge mode="REPLAY_DEMO" variant="full" />))).toContain(
      'Pre-recorded result — not a live LLM run'
    );
    expect(textOf(renderIn('ko', <RunModeBadge mode="REPLAY_DEMO" variant="full" />))).toContain(
      '사전 기록 결과 — 실제 LLM 실행이 아님'
    );
  });

  it.each(LOCALES)('(%s) 실제 실행 유형은 사전 기록처럼 보이지 않는다', (locale) => {
    for (const mode of ['LIVE_EXPERIMENT', 'DETERMINISTIC_TEST'] as const) {
      const text = textOf(renderIn(locale, <RunModeBadge mode={mode} variant="full" />));
      expect(text).not.toMatch(/pre-recorded|사전 기록/i);
    }
  });

  it.each(LOCALES)('(%s) 접근성 레이블에도 고지가 포함된다', (locale) => {
    const html = renderIn(locale, <RunModeBadge mode="REPLAY_DEMO" />);
    expect(html).toContain(`aria-label="${messages[locale].runMode.REPLAY_DEMO.aria}"`);
  });
});

describe('EventCard — 판정 코드는 언어와 무관하게 동일하게 표시된다', () => {
  it.each(ACTION_PHASES)('phase 코드 %s 는 한국어 화면에서도 번역되지 않고 그대로 보인다', (phase) => {
    const event = { ...baseEvent, phase };
    const enText = textOf(renderIn('en', <EventCard event={event} />));
    const koText = textOf(renderIn('ko', <EventCard event={event} />));

    expect(enText).toContain(phase);
    expect(koText).toContain(phase);
  });

  it('도구 이름은 번역되지 않는다', () => {
    expect(textOf(renderIn('ko', <EventCard event={baseEvent} />))).toContain('update_ad');
  });

  it('펼친 상세에서 기술 식별자 레이블(toolCallId, policyCheckId)은 두 언어에서 같다', () => {
    for (const locale of LOCALES) {
      const text = textOf(renderIn(locale, <EventCard event={baseEvent} expanded />));
      expect(text).toContain('toolCallId');
      expect(text).toContain('policyCheckId');
      expect(text).toContain('tc-1');
    }
  });

  it('설명 문구는 언어에 따라 번역된다', () => {
    const enText = textOf(renderIn('en', <EventCard event={baseEvent} expanded />));
    const koText = textOf(renderIn('ko', <EventCard event={baseEvent} expanded />));

    expect(enText).toContain('Agent initiated');
    expect(enText).toContain('Arguments');
    expect(koText).toContain('Agent가 직접 시작함');
    expect(koText).toContain('인수');
  });

  it('접근성 레이블에 번역된 문장과 phase 코드가 함께 들어간다', () => {
    expect(renderIn('en', <EventCard event={baseEvent} />)).toContain('aria-label="Event: update_ad, phase BLOCKED"');
    expect(renderIn('ko', <EventCard event={baseEvent} />)).toContain('aria-label="이벤트: update_ad, BLOCKED 단계"');
  });

  it('agentProposed가 false이면 "Agent가 직접 시작함"을 표시하지 않는다 (강제 주입)', () => {
    const injected = { ...baseEvent, agentProposed: false };
    expect(textOf(renderIn('ko', <EventCard event={injected} />))).not.toContain('Agent가 직접 시작함');
    expect(textOf(renderIn('en', <EventCard event={injected} />))).not.toContain('Agent initiated');
  });

  it.each(LOCALES)('(%s) ERROR 이벤트는 위반이 아님을 밝히고 VIOLATION으로 표시하지 않는다', (locale) => {
    const error: ActionEvent = {
      ...baseEvent,
      phase: 'ERROR',
      verdict: null,
      errorMessage: 'sandbox failed',
    };
    const html = renderIn(locale, <EventCard event={error} expanded />);
    const text = textOf(html);

    expect(text).toContain(messages[locale].timeline.errorNotViolation);
    expect(text).toContain('sandbox failed');
    // "위반"은 "오류 (위반 아님)"에도 들어 있어 부분 문자열로는 구분할 수 없다.
    // 위반 배지만 가지는 고유한 보조기기용 설명으로 확인한다.
    expect(html).not.toContain(messages[locale].verdict.VIOLATION.aria);
    expect(html).toContain(messages[locale].verdict.ERROR.aria);
  });
});
