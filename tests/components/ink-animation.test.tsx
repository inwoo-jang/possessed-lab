import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InkAnimation, resolveInkIntensity } from '@/components/timeline/InkAnimation';

describe('resolveInkIntensity', () => {
  it('Agent가 제안했고 차단된 호출(isOverreach)만 strong이다', () => {
    expect(resolveInkIntensity({ outcome: 'BLOCKED', isOverreach: true })).toBe('strong');
  });

  it('강제 주입된 차단(isOverreach: false, BLOCKED)은 weak이다', () => {
    expect(resolveInkIntensity({ outcome: 'BLOCKED', isOverreach: false })).toBe('weak');
  });

  it.each(['EXECUTED', 'ERROR', 'INCOMPLETE'] as const)('%s는 효과가 없다', (outcome) => {
    expect(resolveInkIntensity({ outcome, isOverreach: false })).toBe('none');
  });
});

describe('InkAnimation', () => {
  it('none이면 자식만 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <InkAnimation intensity="none">
        <p>내용</p>
      </InkAnimation>
    );
    expect(html).toBe('<p>내용</p>');
  });

  it('효과 레이어는 보조 기술에 숨겨지고 클릭을 막지 않는다', () => {
    const html = renderToStaticMarkup(
      <InkAnimation intensity="strong">
        <p>내용</p>
      </InkAnimation>
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('<p>내용</p>');
  });

  it('strong은 번짐이 두 개, weak는 하나다', () => {
    const count = (html: string) => (html.match(/class="ink-blot /g) ?? []).length;
    const strong = renderToStaticMarkup(<InkAnimation intensity="strong">x</InkAnimation>);
    const weak = renderToStaticMarkup(<InkAnimation intensity="weak">x</InkAnimation>);
    expect(count(strong)).toBe(2);
    expect(count(weak)).toBe(1);
  });
});

describe('globals.css 저모션 규칙', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

  it('ink 애니메이션은 no-preference 미디어 쿼리 안에서만 걸린다', () => {
    // 쿼리 밖 규칙에서 `animation:`이 .ink-blot에 직접 걸리면 reduced-motion에서도 발동한다
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '');
    expect(outside).not.toMatch(/\.ink-blot[^{]*\{[^}]*animation:/);
    expect(css).toMatch(/prefers-reduced-motion: no-preference\) \{[\s\S]*\.ink-blot-strong \{ animation:/);
  });
});
