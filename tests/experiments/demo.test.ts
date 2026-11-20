/**
 * Task 3.7 — Demo Mode (REPLAY_DEMO 시드와 멱등 저장)
 *
 * 핵심:
 *   - 시드의 모든 이벤트와 run이 REPLAY_DEMO로 기록된다 (실제 실행으로 위장하지 않음)
 *   - 모델 이름을 채우지 않는다 (실제 모델이 한 것처럼 보이지 않게)
 *   - 같은 요청을 반복해도 행이 늘지 않는다
 *   - 대시보드의 과잉 행동 시도 수에 섞이지 않는다
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/test-db';
import { buildDemoRun, ensureDemoRun, demoRunId, DEMO_EXPERIMENT_ID } from '@/server/experiments/demo';
import { getOverreachSummary } from '@/server/experiments/dashboard';
import { compareRuns } from '@/server/experiments/compare';
import { getRunById, getRunEvents, listExperiments } from '@/server/experiments/service';
import { listRecentRunOptions } from '@/server/experiments/run-list';
import { ActionEventSchema } from '@/lib/schemas';
import { groupEventsIntoCalls } from '@/lib/trace';
import { summarizeEvents } from '@/lib/event-stats';
import { getObservation } from '@/lib/observation';
import type { Locale } from '@/lib/types';

const LOCALES: Locale[] = ['en', 'ko'];

describe.each(LOCALES)('buildDemoRun (%s)', (locale) => {
  const data = buildDemoRun(locale);

  it('run과 모든 이벤트가 REPLAY_DEMO다', () => {
    expect(data.run.runMode).toBe('REPLAY_DEMO');
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.events.every((e) => e.runMode === 'REPLAY_DEMO')).toBe(true);
  });

  it('모델 이름과 온도를 채우지 않는다', () => {
    expect(data.run.metadata.model).toBeNull();
    expect(data.run.metadata.temperature).toBeNull();
  });

  it('이벤트는 스키마를 만족하고 id가 겹치지 않는다', () => {
    for (const event of data.events) expect(ActionEventSchema.safeParse(event).success).toBe(true);
    expect(new Set(data.events.map((e) => e.id)).size).toBe(data.events.length);
  });

  it('Agent가 제안해 차단된 호출이 정확히 하나이고 update_ad다', () => {
    const calls = groupEventsIntoCalls(data.events);
    const overreach = calls.filter((c) => c.isOverreach);
    expect(overreach.map((c) => c.toolName)).toEqual(['update_ad']);
    // 차단 뒤의 정상 업무는 막히지 않는다
    expect(calls.at(-1)).toMatchObject({ toolName: 'draft_report', outcome: 'EXECUTED' });
  });

  it('차단된 호출은 실행 결과를 갖지 않는다', () => {
    const blocked = data.events.filter((e) => e.phase === 'BLOCKED');
    expect(blocked.every((e) => e.mockResult === null)).toBe(true);
  });

  it('요청과 최종 답변이 그 언어로 기록된다', () => {
    expect(data.run.metadata.locale).toBe(locale);
    expect(data.run.metadata.userRequest).toBeTruthy();
    expect(data.run.metadata.finalAnswer).toBeTruthy();
  });

  it('관측 주장을 하지 않는다 (사전 기록)', () => {
    const stats = summarizeEvents(data.events);
    const observation = getObservation({
      runMode: data.run.runMode,
      status: data.run.status,
      toolCallCount: stats.toolCallCount,
      overreachAttempts: stats.overreachAttempts,
    });
    expect(observation).toBe('NOT_APPLICABLE');
  });

  it('같은 입력이면 같은 결과를 만든다 (결정적)', () => {
    expect(buildDemoRun(locale)).toEqual(data);
  });
});

describe('언어별 run은 서로 다른 id를 가진다', () => {
  it('이벤트·toolCallId가 겹치지 않는다 (PK 충돌 방지)', () => {
    const en = buildDemoRun('en').events;
    const ko = buildDemoRun('ko').events;
    const ids = new Set([...en, ...ko].map((e) => e.id));
    expect(ids.size).toBe(en.length + ko.length);
    const calls = new Set([...en, ...ko].map((e) => e.toolCallId));
    expect(calls.size).toBe(new Set(en.map((e) => e.toolCallId)).size * 2);
  });
});

describe('ensureDemoRun', () => {
  it('처음에는 만들고, 다시 호출하면 그대로 돌려준다 (멱등)', async () => {
    const db = createTestDb();

    const first = await ensureDemoRun(db, 'en');
    expect(first).toEqual({ experimentId: DEMO_EXPERIMENT_ID, runId: demoRunId('en'), created: true });

    const second = await ensureDemoRun(db, 'en');
    expect(second.created).toBe(false);
    expect(await getRunEvents(db, demoRunId('en'))).toHaveLength(buildDemoRun('en').events.length);
    expect(await listExperiments(db)).toHaveLength(1);
  });

  it('두 언어를 모두 만들어도 실험은 하나다', async () => {
    const db = createTestDb();
    await ensureDemoRun(db, 'en');
    await ensureDemoRun(db, 'ko');

    expect(await listExperiments(db)).toHaveLength(1);
    expect((await getRunById(db, demoRunId('ko')))?.metadata.locale).toBe('ko');
  });

  it('이벤트가 일부만 저장된 상태에서 다시 호출하면 나머지를 채운다', async () => {
    const db = createTestDb();
    await ensureDemoRun(db, 'en');
    // run이 없으면 이벤트가 몇 개 남아 있어도 이어서 채운다 (run은 마지막에 저장되기 때문)
    const { runs } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(runs).where(eq(runs.id, demoRunId('en')));

    const again = await ensureDemoRun(db, 'en');

    expect(again.created).toBe(true);
    expect(await getRunEvents(db, demoRunId('en'))).toHaveLength(buildDemoRun('en').events.length);
  });

  it('대시보드의 과잉 행동 시도 수에 섞이지 않는다', async () => {
    const db = createTestDb();
    await ensureDemoRun(db, 'en');

    expect(await getOverreachSummary(db)).toEqual({ observedLiveRuns: 0, inconclusiveLiveRuns: 0, overreachAttempts: 0 });
  });

  it('비교 화면에서 REPLAY_DEMO로 표시되고 실행 유형 경고가 나온다', async () => {
    const db = createTestDb();
    await ensureDemoRun(db, 'en');
    await ensureDemoRun(db, 'ko');

    const sameMode = await compareRuns(db, demoRunId('en'), demoRunId('ko'));
    expect(sameMode.runA.runMode).toBe('REPLAY_DEMO');
    expect(sameMode.warnings.map((w) => w.code)).not.toContain('RUN_MODE_MISMATCH');
    // 같은 시퀀스이므로 호출 판정·결과는 같다
    expect(sameMode.changedCount).toBe(0);
  });

  it('run 선택 목록에 실험 이름과 함께 나온다', async () => {
    const db = createTestDb();
    await ensureDemoRun(db, 'en');

    const options = await listRecentRunOptions(db);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: demoRunId('en'), runMode: 'REPLAY_DEMO', status: 'COMPLETED' });
    expect(options[0].experimentName).toContain('Review ≠ Edit');
  });
});
