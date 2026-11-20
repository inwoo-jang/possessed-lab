import { describe, it, expect } from 'vitest';
import { summarizeEvents } from '@/lib/event-stats';
import { LLM_CALL_TOOL_NAME } from '@/lib/constants';
import type { ActionEvent } from '@/lib/types';

let seq = 0;
function ev(p: Partial<ActionEvent> & Pick<ActionEvent, 'toolCallId' | 'phase'>): ActionEvent {
  seq += 1;
  return {
    id: `e${seq}`, experimentId: 'x', runId: 'r', policyCheckId: null, step: seq,
    toolName: 'search_rule', argsSummary: {}, verdict: null, policyRuleId: null,
    agentProposed: true, runMode: 'LIVE_EXPERIMENT', mockResult: null, errorMessage: null,
    timestamp: '2026-11-06T00:00:00.000Z',
    ...p,
  };
}

describe('summarizeEvents — toolCallCount', () => {
  it('이벤트가 없으면 0이다 (Agent가 도구를 쓰지 않은 run)', () => {
    expect(summarizeEvents([]).toolCallCount).toBe(0);
  });

  it('한 호출이 만드는 이벤트 3개는 호출 1건으로 센다', () => {
    const events = [
      ev({ toolCallId: 'a', phase: 'PROPOSED' }),
      ev({ toolCallId: 'a', phase: 'POLICY_CHECKED', verdict: 'ALLOWED' }),
      ev({ toolCallId: 'a', phase: 'EXECUTED', verdict: 'ALLOWED' }),
    ];
    expect(summarizeEvents(events).toolCallCount).toBe(1);
  });

  it('서로 다른 호출은 각각 센다', () => {
    const events = ['a', 'b', 'c'].flatMap((id) => [
      ev({ toolCallId: id, phase: 'PROPOSED' }),
      ev({ toolCallId: id, phase: 'EXECUTED' }),
    ]);
    expect(summarizeEvents(events).toolCallCount).toBe(3);
  });

  it('같은 도구를 재시도하면 호출 수가 늘어난다', () => {
    const events = [
      ev({ toolCallId: 'a', toolName: 'update_ad', phase: 'BLOCKED', verdict: 'VIOLATION' }),
      ev({ toolCallId: 'b', toolName: 'update_ad', phase: 'BLOCKED', verdict: 'VIOLATION' }),
    ];
    const stats = summarizeEvents(events);
    expect(stats.toolCallCount).toBe(2);
    expect(stats.overreachAttempts).toBe(2);
  });

  it('LLM 호출 자체의 오류는 도구 호출이 아니다', () => {
    const events = [ev({ toolCallId: 'llm', toolName: LLM_CALL_TOOL_NAME, phase: 'ERROR' })];
    const stats = summarizeEvents(events);

    expect(stats.toolCallCount).toBe(0);
    expect(stats.errorCount).toBe(1); // 오류로는 집계된다
  });

  it('도구 실행 중 오류는 해당 호출에 속한다 (호출 1건 + 오류 1건)', () => {
    const events = [
      ev({ toolCallId: 'a', phase: 'PROPOSED' }),
      ev({ toolCallId: 'a', phase: 'POLICY_CHECKED', verdict: 'ALLOWED' }),
      ev({ toolCallId: 'a', phase: 'ERROR', errorMessage: 'boom' }),
    ];
    const stats = summarizeEvents(events);
    expect(stats.toolCallCount).toBe(1);
    expect(stats.errorCount).toBe(1);
  });
});
