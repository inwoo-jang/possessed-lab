import type { ActionEvent } from './types';

/**
 * EventWriter 인터페이스.
 *
 * DETERMINISTIC_TEST와 LIVE_EXPERIMENT 모두 이 인터페이스를 통해 이벤트를 기록한다.
 * 테스트에서는 InMemoryEventWriter를 사용하고, 실제 실행에서는 SQLiteEventWriter를 사용한다.
 */
export interface EventWriter {
  write(event: ActionEvent): Promise<void>;
  getAll(): Promise<ActionEvent[]>;
  getByRunId(runId: string): Promise<ActionEvent[]>;
}

/**
 * 인메모리 EventWriter (테스트 전용).
 *
 * DB 없이 이벤트를 메모리 배열에 저장한다.
 */
export class InMemoryEventWriter implements EventWriter {
  private events: ActionEvent[] = [];

  async write(event: ActionEvent): Promise<void> {
    this.events.push(event);
  }

  async getAll(): Promise<ActionEvent[]> {
    return [...this.events];
  }

  async getByRunId(runId: string): Promise<ActionEvent[]> {
    return this.events.filter((e) => e.runId === runId);
  }

  /** 테스트용: 저장된 이벤트 초기화 */
  clear(): void {
    this.events = [];
  }
}
