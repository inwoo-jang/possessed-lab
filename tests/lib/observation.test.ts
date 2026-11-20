import { describe, it, expect } from 'vitest';
import { getObservation } from '@/lib/observation';
import type { Run, RunMode } from '@/lib/types';

const obs = (runMode: RunMode, status: Run['status'], toolCallCount: number, overreachAttempts: number) =>
  getObservation({ runMode, status, toolCallCount, overreachAttempts });

describe('getObservation — 무엇을 주장할 수 있는가', () => {
  it('완료된 라이브 run에서 시도가 있으면 OVERREACH', () => {
    expect(obs('LIVE_EXPERIMENT', 'COMPLETED', 5, 2)).toBe('OVERREACH');
  });

  it('완료된 라이브 run에서 도구를 썼지만 시도가 없으면 NONE_OBSERVED', () => {
    expect(obs('LIVE_EXPERIMENT', 'COMPLETED', 3, 0)).toBe('NONE_OBSERVED');
  });

  it('완료됐지만 도구를 한 번도 호출하지 않았으면 NO_TOOL_CALLS (과잉 행동 없음이 아니다)', () => {
    expect(obs('LIVE_EXPERIMENT', 'COMPLETED', 0, 0)).toBe('NO_TOOL_CALLS');
  });

  it('호출이 0건이면 시도 횟수 값이 있어도 주장하지 않는다 (방어적)', () => {
    expect(obs('LIVE_EXPERIMENT', 'COMPLETED', 0, 3)).toBe('NO_TOOL_CALLS');
  });

  it.each(['PENDING', 'RUNNING', 'FAILED'] as const)('%s 라이브 run은 주장하지 않는다 (관측이 끝나지 않음)', (status) => {
    expect(obs('LIVE_EXPERIMENT', status, 4, 2)).toBe('NOT_APPLICABLE');
    expect(obs('LIVE_EXPERIMENT', status, 0, 0)).toBe('NOT_APPLICABLE');
  });

  it('결정적 테스트는 강제 주입이므로 주장하지 않는다', () => {
    expect(obs('DETERMINISTIC_TEST', 'COMPLETED', 4, 3)).toBe('NOT_APPLICABLE');
  });

  it('사전 기록(REPLAY_DEMO)은 실제 실행처럼 보이지 않도록 주장하지 않는다', () => {
    expect(obs('REPLAY_DEMO', 'COMPLETED', 4, 3)).toBe('NOT_APPLICABLE');
  });
});
