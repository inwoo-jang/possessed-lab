/**
 * Task 3.2 — PolicyEditor 렌더링 검증
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { PolicyEditor } from '@/components/policy-editor/PolicyEditor';
import { getScenarioOptions } from '@/server/experiments/scenario-options';
import type { PolicyEditorRule } from '@/lib/experiment-form';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };
const defaults = getScenarioOptions()[0].defaultRules;
const TOOLS = ['search_rule', 'read_terms', 'draft_report', 'update_ad', 'approve_ad', 'send_external_message'];

const noop = () => {};
const render = (locale: TestLocale, rules: PolicyEditorRule[], extra: { disabled?: boolean } = {}) =>
  renderIn(locale, <PolicyEditor rules={rules} defaultRules={defaults} onChange={noop} {...extra} />);

const withRule = (toolName: string, patch: Partial<PolicyEditorRule>) =>
  defaults.map((r) => (r.toolName === toolName ? { ...r, ...patch } : r));

describe.each(LOCALES)('PolicyEditor (%s)', (locale) => {
  const m = messages[locale].policy;

  it('여섯 도구 이름을 번역하지 않고 그대로 보여준다', () => {
    const text = textOf(render(locale, defaults));
    for (const tool of TOOLS) expect(text).toContain(tool);
  });

  it('권한 선택지는 번역된 설명 + 번역되지 않는 코드로 구성된다', () => {
    const html = render(locale, defaults);
    expect(html).toContain(`${m.allowed} — ALLOWED`.replace('—', '—'));
    expect(textOf(html)).toContain(`${m.denied} — DENIED`);
    expect(textOf(html)).toContain(`${m.requiresApproval} — REQUIRES_APPROVAL`);
  });

  it('권한 값(option value)은 언어와 무관하게 코드다', () => {
    const html = render(locale, defaults);
    for (const code of ['ALLOWED', 'DENIED', 'REQUIRES_APPROVAL']) {
      expect(html).toContain(`value="${code}"`);
    }
  });

  it('기본 정책 그대로면 "수정됨" 표시와 되돌리기 버튼이 없다', () => {
    const text = textOf(render(locale, defaults));
    expect(text).toContain(m.usingDefault);
    expect(text).not.toContain(m.modified);
    expect(text).not.toContain(m.resetToDefault);
  });

  it('권한을 바꾼 규칙에는 "수정됨"이 한 번 표시되고 되돌리기 버튼이 나타난다', () => {
    const text = textOf(render(locale, withRule('update_ad', { permission: 'ALLOWED' })));
    expect(text.split(m.modified).length - 1).toBe(1);
    expect(text).toContain(m.resetToDefault);
    expect(text).toContain(m.customPolicy);
    expect(text).not.toContain(m.usingDefault);
  });

  it('수정 표시는 색이 아니라 텍스트로도 전달된다 (접근성)', () => {
    const html = render(locale, withRule('update_ad', { permission: 'ALLOWED' }));
    expect(textOf(html)).toContain(m.modified);
    expect(html).toContain('aria-hidden="true">●'); // 장식 아이콘은 스크린리더에서 숨긴다
  });

  it('REQUIRES_APPROVAL 규칙에만 Mock 승인 체크박스가 있고, 실제 승인이 아니라는 안내가 함께 나온다', () => {
    const html = render(locale, defaults);
    const text = textOf(html);

    expect(text.split(m.mockApprovalGranted).length - 1).toBe(1); // approve_ad 한 곳
    expect(html).toContain('type="checkbox"');
    expect(text).toContain(m.mockApprovalNotice);
    expect(html).toContain('role="note"');
  });

  it('승인이 필요한 규칙이 없으면 체크박스도 안내도 없다', () => {
    const noApproval = withRule('approve_ad', { permission: 'DENIED' });
    const html = render(locale, noApproval);

    expect(html).not.toContain('type="checkbox"');
    expect(textOf(html)).not.toContain(m.mockApprovalNotice);
  });

  it('Mock 승인 체크 상태를 반영하고, 안내 문구와 연결(aria-describedby)된다', () => {
    const html = render(locale, withRule('approve_ad', { approvalGranted: true }));
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toMatch(/aria-describedby="([^"]+)"/);

    const describedBy = html.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${describedBy}"`); // 끊어진 참조가 아니다
  });

  it('disabled이면 fieldset 전체가 비활성화된다', () => {
    expect(render(locale, defaults, { disabled: true })).toMatch(/<fieldset[^>]*disabled=""/);
    expect(render(locale, defaults)).not.toMatch(/<fieldset[^>]*disabled/);
  });

  it('각 권한 선택은 도구 이름을 포함한 접근성 레이블을 가진다', () => {
    const html = render(locale, defaults);
    for (const tool of TOOLS) {
      expect(html).toContain(`aria-label="${m.permission}: ${tool}"`);
    }
  });
});

describe('PolicyEditor — 선택값 반영', () => {
  it('현재 권한이 선택된 option으로 표시된다', () => {
    const single: PolicyEditorRule[] = [{ toolName: 'update_ad', permission: 'REQUIRES_APPROVAL', approvalGranted: false }];
    const html = renderIn('en', <PolicyEditor rules={single} defaultRules={single} onChange={noop} />);
    expect(html).toMatch(/<option value="REQUIRES_APPROVAL" selected="">/);
    expect(html).not.toMatch(/<option value="ALLOWED" selected/);
  });
});
