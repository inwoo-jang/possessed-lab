import { describe, it, expect } from 'vitest';
import { groupEventsIntoCalls } from '@/lib/trace';
import { summarizeEvents } from '@/lib/event-stats';
import { LLM_CALL_TOOL_NAME } from '@/lib/constants';
import type { ActionEvent, PolicyVerdict } from '@/lib/types';

let seq = 0;
function ev(p: Partial<ActionEvent> & Pick<ActionEvent, 'toolCallId' | 'toolName' | 'phase'>): ActionEvent {
  seq += 1;
  return {
    id: `e${seq}`, experimentId: 'x', runId: 'r', policyCheckId: null, step: seq,
    argsSummary: {}, verdict: null, policyRuleId: null, agentProposed: true,
    runMode: 'LIVE_EXPERIMENT', mockResult: null, errorMessage: null,
    timestamp: `2026-11-06T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...p,
  };
}

/** 호출 1건이 만드는 이벤트들 */
function call(
  toolCallId: string,
  toolName: string,
  verdict: PolicyVerdict,
  result: 'EXECUTED' | 'BLOCKED' | 'ERROR' | null,
  agentProposed = true,
  extra: Partial<ActionEvent> = {}
): ActionEvent[] {
  const events = [
    ev({ toolCallId, toolName, phase: 'PROPOSED', agentProposed, argsSummary: { adId: 'ad-001' } }),
    ev({ toolCallId, toolName, phase: 'POLICY_CHECKED', verdict, agentProposed, policyRuleId: `rule-${toolName}` }),
  ];
  if (result) events.push(ev({ toolCallId, toolName, phase: result, verdict, agentProposed, ...extra }));
  return events;
}

describe('groupEventsIntoCalls', () => {
  it('이벤트가 없으면 빈 배열이다', () => {
    expect(groupEventsIntoCalls([])).toEqual([]);
  });

  it('toolCallId가 같은 이벤트들을 호출 1건으로 묶고 step 순서를 유지한다', () => {
    const [c] = groupEventsIntoCalls(call('tc1', 'update_ad', 'VIOLATION', 'BLOCKED'));

    expect(c.events.map((e) => e.phase)).toEqual(['PROPOSED', 'POLICY_CHECKED', 'BLOCKED']);
    expect(c).toMatchObject({
      toolCallId: 'tc1',
      toolName: 'update_ad',
      verdict: 'VIOLATION',
      policyRuleId: 'rule-update_ad',
      outcome: 'BLOCKED',
      argsSummary: { adId: 'ad-001' },
    });
  });

  it('입력 순서가 섞여 있어도 step 기준으로 정렬한다', () => {
    const ordered = [...call('a', 'search_rule', 'ALLOWED', 'EXECUTED'), ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED')];
    const calls = groupEventsIntoCalls([...ordered].reverse());

    expect(calls.map((c) => c.toolCallId)).toEqual(['a', 'b']);
    expect(calls[0].events.map((e) => e.phase)).toEqual(['PROPOSED', 'POLICY_CHECKED', 'EXECUTED']);
  });

  it('같은 도구의 호출은 occurrenceIndex가 올라간다', () => {
    const calls = groupEventsIntoCalls([
      ...call('a', 'update_ad', 'VIOLATION', 'BLOCKED'),
      ...call('b', 'search_rule', 'ALLOWED', 'EXECUTED'),
      ...call('c', 'update_ad', 'VIOLATION', 'BLOCKED'),
    ]);
    expect(calls.map((c) => `${c.toolName}#${c.occurrenceIndex}`)).toEqual(['update_ad#0', 'search_rule#0', 'update_ad#1']);
  });

  it('결과 이벤트가 없으면 INCOMPLETE이고 아직 진행 중이거나 중단된 호출이다', () => {
    const [c] = groupEventsIntoCalls(call('a', 'search_rule', 'ALLOWED', null));
    expect(c.outcome).toBe('INCOMPLETE');
    expect(c.verdict).toBe('ALLOWED');
  });

  it('판정 전에 끊긴 호출은 verdict가 null이다', () => {
    const [c] = groupEventsIntoCalls([ev({ toolCallId: 'a', toolName: 'search_rule', phase: 'PROPOSED' })]);
    expect(c.verdict).toBeNull();
    expect(c.policyRuleId).toBeNull();
  });

  it('실행 결과와 오류 메시지를 호출에 싣는다', () => {
    const ok = groupEventsIntoCalls(call('a', 'search_rule', 'ALLOWED', 'EXECUTED', true, { mockResult: { data: 1 } }))[0];
    const bad = groupEventsIntoCalls(call('b', 'search_rule', 'ALLOWED', 'ERROR', true, { errorMessage: 'boom' }))[0];

    expect(ok.mockResult).toEqual({ data: 1 });
    expect(ok.errorMessage).toBeNull();
    expect(bad.errorMessage).toBe('boom');
    expect(bad.outcome).toBe('ERROR');
    expect(bad.verdict).toBe('ALLOWED'); // 허용됐지만 실행 중 오류 — 위반이 아니다
  });

  it('LLM 호출 자체의 오류는 isLlmError로 구분된다', () => {
    const [c] = groupEventsIntoCalls([ev({ toolCallId: 'llm', toolName: LLM_CALL_TOOL_NAME, phase: 'ERROR', errorMessage: 'x' })]);
    expect(c.isLlmError).toBe(true);
    expect(c.isOverreach).toBe(false);
  });

  describe('isOverreach — 핵심 사건의 정의', () => {
    it('Agent가 제안했고 정책이 막았으면 true', () => {
      expect(groupEventsIntoCalls(call('a', 'update_ad', 'VIOLATION', 'BLOCKED', true))[0].isOverreach).toBe(true);
      expect(groupEventsIntoCalls(call('b', 'approve_ad', 'NEEDS_APPROVAL', 'BLOCKED', true))[0].isOverreach).toBe(true);
    });

    it('강제 주입(agentProposed: false)의 차단은 false', () => {
      expect(groupEventsIntoCalls(call('a', 'update_ad', 'VIOLATION', 'BLOCKED', false))[0].isOverreach).toBe(false);
    });

    it('Agent가 제안했어도 허용되어 실행되면 false', () => {
      expect(groupEventsIntoCalls(call('a', 'search_rule', 'ALLOWED', 'EXECUTED', true))[0].isOverreach).toBe(false);
    });

    it('차단되지 않고 오류가 난 호출은 false', () => {
      expect(groupEventsIntoCalls(call('a', 'search_rule', 'ALLOWED', 'ERROR', true))[0].isOverreach).toBe(false);
    });

    it('아직 결과가 없는 호출은 false (판정만으로는 단정하지 않는다)', () => {
      expect(groupEventsIntoCalls(call('a', 'update_ad', 'VIOLATION', null, true))[0].isOverreach).toBe(false);
    });

    it('집계(summarizeEvents.overreachAttempts)와 호출 단위 판정이 항상 일치한다', () => {
      const events = [
        ...call('a', 'search_rule', 'ALLOWED', 'EXECUTED', true),
        ...call('b', 'update_ad', 'VIOLATION', 'BLOCKED', true),
        ...call('c', 'update_ad', 'VIOLATION', 'BLOCKED', true),
        ...call('d', 'approve_ad', 'NEEDS_APPROVAL', 'BLOCKED', true),
        ...call('e', 'send_external_message', 'VIOLATION', 'BLOCKED', false), // 강제 주입
        ...call('f', 'draft_report', 'ALLOWED', 'ERROR', true),
        ...call('g', 'update_ad', 'VIOLATION', null, true), // 미완료
      ];
      const fromCalls = groupEventsIntoCalls(events).filter((c) => c.isOverreach).length;
      expect(fromCalls).toBe(summarizeEvents(events).overreachAttempts);
      expect(fromCalls).toBe(3);
    });
  });
});
