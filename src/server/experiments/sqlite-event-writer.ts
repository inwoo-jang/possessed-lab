/**
 * SQLiteEventWriter — EventWriter 인터페이스의 DB 구현체
 *
 * Runner는 EventWriter 인터페이스만 알기 때문에,
 * 테스트에서는 InMemoryEventWriter, 실제 실행에서는 이 클래스를 주입한다.
 *
 * 위치 메모: src/lib은 src/server를 import하지 않는다(계층 방향 유지).
 * 그래서 EventWriter 인터페이스는 lib/event-log.ts, DB 구현체는 server 아래에 둔다.
 */

import type { DB } from '@/db/client';
import type { EventWriter } from '@/lib/event-log';
import type { ActionEvent } from '@/lib/types';
import {
  saveActionEvent,
  getRunEvents,
  listAllActionEvents,
} from './service';

export class SQLiteEventWriter implements EventWriter {
  constructor(private readonly db: DB) {}

  async write(event: ActionEvent): Promise<void> {
    await saveActionEvent(this.db, event);
  }

  async getAll(): Promise<ActionEvent[]> {
    return listAllActionEvents(this.db);
  }

  async getByRunId(runId: string): Promise<ActionEvent[]> {
    return getRunEvents(this.db, runId);
  }
}
