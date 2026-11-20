/**
 * Task 2.4 — 번역 메시지 검증
 *
 * global.ts는 영어를 기준으로 키 타입을 만들 뿐이라, 한국어에서 키가 빠지거나 남는 것은
 * 컴파일로 잡히지 않는다. 두 언어의 구조가 같은지, 자리표시자가 같은지 여기서 확인한다.
 */

import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { routing } from '@/i18n/routing';
import { ACTION_PHASES, POLICY_VERDICTS, RUN_MODES } from '@/lib/constants';

type Tree = { [key: string]: string | Tree };

/** 중첩 객체를 "a.b.c" 형태의 키 → 값 맵으로 편다 */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

/**
 * ICU 메시지에서 {name} 자리표시자의 이름만 뽑는다 (plural 안의 # 는 제외).
 * 같은 변수를 여러 번 쓰는 것(영어의 복수형 분기 등)은 언어마다 다를 수 있으므로 중복은 제거한다.
 * 확인하려는 것은 "번역하다가 변수를 빠뜨리거나 잘못 추가하지 않았는가"이다.
 */
function placeholders(message: string): string[] {
  const names = [...message.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

const flatEn = flatten(en as Tree);
const flatKo = flatten(ko as Tree);

describe('지원 언어 설정', () => {
  it('영어와 한국어를 지원하고 기본 언어는 영어다', () => {
    expect([...routing.locales].sort()).toEqual(['en', 'ko']);
    expect(routing.defaultLocale).toBe('en');
  });

  it('지원하는 모든 언어에 메시지 파일이 있다', () => {
    expect(routing.locales.length).toBe(2);
    expect(Object.keys(flatEn).length).toBeGreaterThan(0);
    expect(Object.keys(flatKo).length).toBeGreaterThan(0);
  });
});

describe('ko/en 메시지 구조', () => {
  it('두 언어의 키 집합이 정확히 같다', () => {
    const onlyEn = Object.keys(flatEn).filter((k) => !(k in flatKo));
    const onlyKo = Object.keys(flatKo).filter((k) => !(k in flatEn));

    expect(onlyEn, 'ko에 없는 키').toEqual([]);
    expect(onlyKo, 'en에 없는 키').toEqual([]);
  });

  it('비어 있는 메시지가 없다', () => {
    for (const [lang, flat] of [['en', flatEn], ['ko', flatKo]] as const) {
      for (const [key, value] of Object.entries(flat)) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('자리표시자 이름이 두 언어에서 같다 (번역하다가 {step}을 빠뜨리지 않았는지)', () => {
    for (const key of Object.keys(flatEn)) {
      expect(placeholders(flatKo[key]), key).toEqual(placeholders(flatEn[key]));
    }
  });

  it('요구된 네임스페이스가 모두 있다', () => {
    const required = ['nav', 'dashboard', 'experiment', 'policy', 'timeline', 'report', 'verdict', 'runMode'];
    for (const ns of required) {
      expect(en, `en.${ns}`).toHaveProperty(ns);
      expect(ko, `ko.${ns}`).toHaveProperty(ns);
    }
  });

  it('한국어 메시지는 실제로 번역되어 있다 (영어를 그대로 복사하지 않았다)', () => {
    // 브랜드명·고유명사·언어 이름처럼 의도적으로 같은 값은 제외한다
    const intentionallySame = new Set(['meta.title', 'dashboard.title', 'dashboard.subtitle', 'locale.en', 'locale.ko']);
    const untranslated = Object.keys(flatEn).filter((k) => !intentionallySame.has(k) && flatEn[k] === flatKo[k]);
    expect(untranslated).toEqual([]);
  });
});

describe('REPLAY_DEMO 고지문', () => {
  it('영어/한국어 모두 "실제 LLM 실행이 아님"을 명시한다', () => {
    expect(en.runMode.REPLAY_DEMO.fullLabel).toBe('Pre-recorded result — not a live LLM run');
    expect(ko.runMode.REPLAY_DEMO.fullLabel).toBe('사전 기록 결과 — 실제 LLM 실행이 아님');
  });

  it('접근성 레이블에도 고지가 들어 있다', () => {
    expect(en.runMode.REPLAY_DEMO.aria).toMatch(/not a live LLM run/);
    expect(ko.runMode.REPLAY_DEMO.aria).toMatch(/실제 LLM 실행이 아님/);
  });

  it('실제 실행 유형의 문구가 REPLAY_DEMO처럼 읽히지 않는다 (혼동 방지)', () => {
    for (const lang of [en, ko]) {
      expect(lang.runMode.LIVE_EXPERIMENT.fullLabel).not.toMatch(/pre-recorded|사전 기록/i);
      expect(lang.runMode.DETERMINISTIC_TEST.fullLabel).not.toMatch(/pre-recorded|사전 기록/i);
    }
  });
});

describe('판정 코드는 번역 키가 아니다', () => {
  // ATTEMPTED/BLOCKED/EXECUTED 같은 코드는 언어와 무관하게 그대로 저장·표시한다.
  // 메시지에는 코드를 설명하는 문구만 두고, 코드 자체를 값으로 번역해 바꾸지 않는다.
  const codes = [...ACTION_PHASES, ...POLICY_VERDICTS, ...RUN_MODES, 'ATTEMPTED'];

  it('어떤 메시지 값도 판정 코드 한 단어만으로 이루어져 있지 않다', () => {
    for (const [lang, flat] of [['en', flatEn], ['ko', flatKo]] as const) {
      for (const [key, value] of Object.entries(flat)) {
        expect(codes, `${lang}:${key} = "${value}"`).not.toContain(value.trim());
      }
    }
  });

  it('verdict/runMode 키는 코드 이름을 그대로 쓰고 값은 설명 문구다', () => {
    expect(Object.keys(en.verdict)).toEqual(Object.keys(ko.verdict));
    expect(Object.keys(en.runMode).sort()).toEqual([...RUN_MODES].sort());
  });
});

describe('접근성 레이블', () => {
  it('모든 verdict 배지에 시각 레이블과 보조기기용 설명이 모두 있다', () => {
    for (const lang of [en, ko]) {
      for (const [variant, entry] of Object.entries(lang.verdict)) {
        expect(entry.label.trim(), `${variant}.label`).not.toBe('');
        expect(entry.aria.trim(), `${variant}.aria`).not.toBe('');
      }
    }
  });

  it('ERROR는 위반이 아님을 두 언어 모두에서 밝힌다', () => {
    expect(en.verdict.ERROR.label).toMatch(/not a violation/i);
    expect(ko.verdict.ERROR.label).toMatch(/위반 아님/);
  });
});
