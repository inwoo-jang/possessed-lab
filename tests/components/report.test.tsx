/**
 * Task 3.5 — 포렌식 보고서 검증
 *
 * 핵심:
 *   - Agent가 스스로 시도한 호출은 별도 구역에, 강제 주입된 차단은 그와 구분해서 둔다
 *   - 보고서가 하는 주장은 trace 화면과 같은 규칙을 따른다
 *   - 호출 인수의 민감 값은 표시 직전에 마스킹된다
 *   - REPLAY_DEMO는 사전 기록임을 항상 밝힌다
 */

import { describe, it, expect } from 'vitest';
import { renderIn, textOf, type TestLocale } from '../helpers/render';
import { ForensicReport } from '@/components/forensic-report/ForensicReport';
import { buildReportSections, referencedRuleIds } from '@/lib/report';
import { maskSensitiveArgs, sanitizeArgsForDisplay } from '@/lib/redact';
import type { ActionEvent, PolicySnapshot, PolicyVerdict, Run, RunMode } from '@/lib/types';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

const LOCALES: TestLocale[] = ['en', 'ko'];
const messages = { en, ko };

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
  opts: { agentProposed?: boolean; args?: Record<string, unknown>; errorMessage?: string } = {}
): ActionEvent[] {
  const agentProposed = opts.agentProposed ?? true;
  const args = opts.args ?? { adId: 'ad-001' };
  const out = [
    ev({ toolCallId: id, toolName, phase: 'PROPOSED', agentProposed, argsSummary: args }),
    ev({ toolCallId: id, toolName, phase: 'POLICY_CHECKED', verdict, agentProposed, argsSummary: args, policyRuleId: `rule-${toolName}` }),
  ];
  if (result) {
    out.push(ev({
      toolCallId: id, toolName, phase: result, verdict, agentProposed, argsSummary: args,
      policyRuleId: `rule-${toolName}`, errorMessage: result === 'ERROR' ? (opts.errorMessage ?? 'sandbox failed') : null,
    }));
  }
  return out;
}

const POLICY: PolicySnapshot = {
  id: 'p1', name: 'Review only', version: 3, createdAt: '2026-11-06T09:00:00.000Z', snapshotAt: '2026-11-06T09:59:00.000Z',
  rules: [
    { id: 'rule-read_terms', toolName: 'read_terms', permission: 'ALLOWED' },
    { id: 'rule-update_ad', toolName: 'update_ad', permission: 'DENIED' },
    { id: 'rule-approve_ad', toolName: 'approve_ad', permission: 'REQUIRES_APPROVAL', mockApprovalState: { granted: false, grantedBy: 'x', scope: 'mock' } },
  ],
};

const LIVE_OVERREACH = [
  ...call('a', 'read_terms', 'ALLOWED', 'EXECUTED'),
  ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED'),
];

function report(locale: TestLocale, opts: { runMode?: RunMode; status?: Run['status']; events?: ActionEvent[] } = {}) {
  return renderIn(
    locale,
    <ForensicReport
      experimentName="My experiment"
      scenarioName="Review ≠ Edit"
      run={{ runMode: opts.runMode ?? 'LIVE_EXPERIMENT', status: opts.status ?? 'COMPLETED', policySnapshot: POLICY }}
      events={opts.events ?? LIVE_OVERREACH}
    />
  );
}

describe('buildReportSections', () => {
  it('Agent가 제안해 차단된 호출만 agentAttempts에 둔다', () => {
    const s = buildReportSections([
      ...call('a', 'read_terms', 'ALLOWED', 'EXECUTED'),
      ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED'),
      ...call('c', 'approve_ad', 'VIOLATION', 'BLOCKED', { agentProposed: false }),
    ]);
    expect(s.agentAttempts.map((c) => c.toolName)).toEqual(['update_ad']);
    expect(s.injectedBlocks.map((c) => c.toolName)).toEqual(['approve_ad']);
    expect(s.normalCalls.map((c) => c.toolName)).toEqual(['read_terms']);
  });

  it('오류와 결과 없는 호출은 위반 구역에 들어가지 않는다', () => {
    const s = buildReportSections([
      ...call('a', 'read_terms', 'ALLOWED', 'ERROR'),
      ...call('b', 'search_rule', 'ALLOWED', null),
    ]);
    expect(s.agentAttempts).toHaveLength(0);
    expect(s.injectedBlocks).toHaveLength(0);
    expect(s.normalCalls).toHaveLength(2);
  });

  it('위반 구역의 호출이 근거로 쓴 규칙 id를 모은다', () => {
    const s = buildReportSections([...call('b', 'update_ad', 'VIOLATION', 'BLOCKED'), ...call('a', 'read_terms', 'ALLOWED', 'EXECUTED')]);
    expect([...referencedRuleIds(s)]).toEqual(['rule-update_ad']);
  });

  it('인수의 민감 필드(중첩 포함)와 문자열 값 속 API 키를 마스킹한다', () => {
    const s = buildReportSections(
      call('b', 'update_ad', 'VIOLATION', 'BLOCKED', {
        args: { adId: 'ad-1', password: 'hunter2', nested: { apiKey: 'abc', note: 'ok' }, content: 'use sk-abc123XYZ789 here' },
      })
    );
    expect(s.agentAttempts[0].argsSummary).toEqual({
      adId: 'ad-1',
      password: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', note: 'ok' },
      content: 'use [REDACTED] here',
    });
  });

  it('오류 메시지의 키도 마스킹한다', () => {
    const s = buildReportSections(call('a', 'read_terms', 'ALLOWED', 'ERROR', { errorMessage: 'bad key sk-abc123XYZ789' }));
    expect(s.normalCalls[0].errorMessage).toBe('bad key [REDACTED]');
  });
});

describe('maskSensitiveArgs', () => {
  it('배열 안의 객체도 마스킹하고 원본을 바꾸지 않는다', () => {
    const input = { items: [{ token: 't', n: 1 }] };
    expect(maskSensitiveArgs(input)).toEqual({ items: [{ token: '[REDACTED]', n: 1 }] });
    expect(input.items[0].token).toBe('t');
    expect(sanitizeArgsForDisplay({ a: 1 })).toEqual({ a: 1 });
  });
});

describe.each(LOCALES)('ForensicReport (%s)', (locale) => {
  const m = messages[locale];

  it('Agent가 시도한 호출을 별도 구역과 문장으로 보여준다', () => {
    const html = report(locale);
    const text = textOf(html);
    expect(text).toContain(m.report.agentAttemptsHeading);
    expect(text).toContain(m.report.agentAttempted);
    expect(text).toContain(locale === 'en' ? '1 attempt' : '1회 시도');
    expect(html).toContain('agentProposed: true');
  });

  it('호출마다 toolCallId, 판정 코드, 규칙, 인수를 보여준다', () => {
    const html = report(locale);
    expect(html).toContain('>b<');            // toolCallId
    expect(html).toContain('>VIOLATION<');    // 판정 코드는 번역하지 않는다
    expect(html).toContain('rule-update_ad');
    expect(html).toContain('ad-001');
  });

  it('정책 스냅샷 요약을 보여주고 근거로 쓰인 규칙을 표시한다', () => {
    const text = textOf(report(locale));
    expect(text).toContain('Review only');
    expect(text).toContain('rule-approve_ad');
    expect(text).toContain(m.report.referencedByCall);
    expect(text).toContain(m.policy.mockApprovalNotice);
  });

  it('강제 주입된 차단은 Agent 시도로 말하지 않고 그렇게 밝힌다', () => {
    const text = textOf(report(locale, {
      runMode: 'DETERMINISTIC_TEST',
      events: call('b', 'update_ad', 'VIOLATION', 'BLOCKED', { agentProposed: false }),
    }));
    expect(text).toContain(m.report.injectedHeading);
    expect(text).toContain(m.report.injectedNote);
    expect(text).not.toContain(m.report.agentAttempted);
    expect(text).not.toContain(m.report.noOverreach);
    expect(text).not.toContain(locale === 'en' ? '1 attempt' : '1회 시도');
  });

  it('도구를 쓴 완료된 라이브 run에서 시도가 없으면 "관측되지 않음"이라고 한다', () => {
    const text = textOf(report(locale, { events: call('a', 'read_terms', 'ALLOWED', 'EXECUTED') }));
    expect(text).toContain(m.report.noOverreach);
    expect(text).toContain(m.report.none); // 위반 구역은 비어 있다
  });

  it('호출이 없으면 "관측된 것이 없음"이라고 하고 "관측되지 않음"은 말하지 않는다', () => {
    const text = textOf(report(locale, { events: [] }));
    expect(text).toContain(m.report.noToolCalls);
    expect(text).not.toContain(m.report.noOverreach);
  });

  it('진행 중이면 끝나지 않았다고 밝히고 과잉 행동에 대한 주장을 하지 않는다', () => {
    const text = textOf(report(locale, { status: 'RUNNING' }));
    expect(text).toContain(m.report.inProgress);
    expect(text).not.toContain(m.report.noOverreach);
    expect(text).not.toContain(locale === 'en' ? '1 attempt' : '1회 시도');
  });

  it('실패한 run은 결론을 내릴 수 없다고 밝힌다', () => {
    const text = textOf(report(locale, { status: 'FAILED', events: [] }));
    expect(text).toContain(m.trace.failedNotice);
    expect(text).not.toContain(m.report.noOverreach);
  });

  it('REPLAY_DEMO는 사전 기록 고지를 보이고 관측 주장을 하지 않는다', () => {
    const text = textOf(report(locale, { runMode: 'REPLAY_DEMO' }));
    expect(text).toContain(m.runMode.REPLAY_DEMO.fullLabel);
    expect(text).not.toContain(m.report.noOverreach);
    expect(text).not.toContain(locale === 'en' ? '1 attempt' : '1회 시도');
  });

  it('오류는 위반이 아니라고 밝힌다', () => {
    const text = textOf(report(locale, { events: call('a', 'read_terms', 'ALLOWED', 'ERROR') }));
    expect(text).toContain(m.timeline.errorNotViolation);
    expect(text).not.toContain(m.report.agentAttempted);
  });
});
