/**
 * Task 1.8 — DB Service 왕복 테스트
 *
 * 인메모리 SQLite(:memory:)를 사용하므로 파일 시스템에 영향 없음.
 * 각 테스트는 독립된 DB 인스턴스를 사용한다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';
import {
  savePolicy, getPolicyById,
  saveExperiment, getExperimentById, listExperiments,
  saveRun, getRunById, updateRunStatus, listRunsByExperiment,
  saveActionEvent, getRunEvents, getEventsByToolCallId,
} from '@/server/experiments/service';
import type { Policy, Experiment, Run, ActionEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// 인메모리 DB 픽스처
// ---------------------------------------------------------------------------

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './src/db/migrations' });
  return db;
}

type TestDB = ReturnType<typeof createTestDb>;

// ---------------------------------------------------------------------------
// 도메인 픽스처
// ---------------------------------------------------------------------------

const testPolicy: Policy = {
  id:        'policy-test-001',
  name:      '광고 검토 정책',
  version:   1,
  createdAt: '2026-11-06T00:00:00.000Z',
  rules: [
    { id: 'r-1', toolName: 'search_rule',  permission: 'ALLOWED',  description: '규정 검색 허용' },
    { id: 'r-2', toolName: 'update_ad',    permission: 'DENIED',   description: '광고 수정 금지' },
    {
      id: 'r-3', toolName: 'approve_ad', permission: 'REQUIRES_APPROVAL',
      mockApprovalState: { granted: false, grantedBy: 'tester', scope: 'test' },
    },
  ],
};

const testExperiment: Experiment = {
  id:         'exp-test-001',
  name:       '시나리오 A 테스트',
  scenarioId: 'scenario-a',
  policyId:   testPolicy.id,
  createdAt:  '2026-11-06T00:00:00.000Z',
};

const testRun: Run = {
  id:           'run-test-001',
  experimentId: testExperiment.id,
  runMode:      'DETERMINISTIC_TEST',
  metadata: {
    model:         null,
    temperature:   null,
    promptVersion: 'v1',
    policyVersion: 1,
  },
  policySnapshot: {
    ...testPolicy,
    snapshotAt: '2026-11-06T00:00:00.000Z',
  },
  status:      'PENDING',
  startedAt:   '2026-11-06T00:00:00.000Z',
  completedAt: null,
};

const makeEvent = (overrides: Partial<ActionEvent> = {}): ActionEvent => ({
  id:            'evt-001',
  experimentId:  testExperiment.id,
  runId:         testRun.id,
  toolCallId:    'tc-550e8400-0001',
  policyCheckId: null,
  step:          0,
  toolName:      'update_ad',
  argsSummary:   { adId: 'ad-001', content: 'mock' },
  phase:         'PROPOSED',
  verdict:       null,
  policyRuleId:  null,
  agentProposed: false,
  runMode:       'DETERMINISTIC_TEST',
  mockResult:    null,
  errorMessage:  null,
  timestamp:     '2026-11-06T00:00:00.000Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Policy 테스트
// ---------------------------------------------------------------------------

describe('Policy — 저장 및 조회', () => {
  let db: TestDB;
  beforeEach(() => { db = createTestDb(); });

  it('savePolicy → getPolicyById 왕복', async () => {
    await savePolicy(db, testPolicy);
    const found = await getPolicyById(db, testPolicy.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(testPolicy.id);
    expect(found!.name).toBe(testPolicy.name);
    expect(found!.version).toBe(1);
  });

  it('rules가 JSON으로 정확하게 저장되고 복원된다', async () => {
    await savePolicy(db, testPolicy);
    const found = await getPolicyById(db, testPolicy.id);

    expect(found!.rules).toHaveLength(3);
    expect(found!.rules[1].toolName).toBe('update_ad');
    expect(found!.rules[1].permission).toBe('DENIED');
    // REQUIRES_APPROVAL mockApprovalState 포함 검증
    expect(found!.rules[2].mockApprovalState?.granted).toBe(false);
  });

  it('없는 ID 조회 시 null 반환', async () => {
    const result = await getPolicyById(db, 'non-existent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Experiment 테스트
// ---------------------------------------------------------------------------

describe('Experiment — 저장, 조회, 목록', () => {
  let db: TestDB;
  beforeEach(() => { db = createTestDb(); });

  it('saveExperiment → getExperimentById 왕복', async () => {
    await saveExperiment(db, testExperiment);
    const found = await getExperimentById(db, testExperiment.id);

    expect(found).not.toBeNull();
    expect(found!.scenarioId).toBe('scenario-a');
    expect(found!.policyId).toBe(testPolicy.id);
  });

  it('listExperiments — 저장된 실험 목록 반환', async () => {
    await saveExperiment(db, testExperiment);
    await saveExperiment(db, { ...testExperiment, id: 'exp-002', name: '두 번째 실험' });

    const list = await listExperiments(db);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.id)).toContain('exp-002');
  });

  it('없는 ID 조회 시 null 반환', async () => {
    const result = await getExperimentById(db, 'non-existent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Run 테스트
// ---------------------------------------------------------------------------

describe('Run — 저장, 조회, 상태 업데이트', () => {
  let db: TestDB;
  beforeEach(() => { db = createTestDb(); });

  it('saveRun → getRunById 왕복', async () => {
    await saveRun(db, testRun);
    const found = await getRunById(db, testRun.id);

    expect(found).not.toBeNull();
    expect(found!.runMode).toBe('DETERMINISTIC_TEST');
    expect(found!.status).toBe('PENDING');
  });

  it('policySnapshot이 JSON으로 정확하게 저장/복원된다', async () => {
    await saveRun(db, testRun);
    const found = await getRunById(db, testRun.id);

    expect(found!.policySnapshot.id).toBe(testPolicy.id);
    expect(found!.policySnapshot.snapshotAt).toBe('2026-11-06T00:00:00.000Z');
    expect(found!.policySnapshot.rules).toHaveLength(3);
  });

  it('metadata(model: null)가 null 포함 JSON으로 저장/복원된다', async () => {
    await saveRun(db, testRun);
    const found = await getRunById(db, testRun.id);

    expect(found!.metadata.model).toBeNull();
    expect(found!.metadata.promptVersion).toBe('v1');
  });

  it('updateRunStatus — PENDING → COMPLETED', async () => {
    await saveRun(db, testRun);
    await updateRunStatus(db, testRun.id, 'COMPLETED', '2026-11-06T01:00:00.000Z');

    const updated = await getRunById(db, testRun.id);
    expect(updated!.status).toBe('COMPLETED');
    expect(updated!.completedAt).toBe('2026-11-06T01:00:00.000Z');
  });

  it('listRunsByExperiment — 실험의 run 목록 반환', async () => {
    await saveRun(db, testRun);
    await saveRun(db, { ...testRun, id: 'run-002' });
    await saveRun(db, { ...testRun, id: 'run-003', experimentId: 'other-exp' });

    const list = await listRunsByExperiment(db, testExperiment.id);
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.experimentId === testExperiment.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ActionEvent 테스트
// ---------------------------------------------------------------------------

describe('ActionEvent — 저장 및 조회', () => {
  let db: TestDB;
  beforeEach(() => { db = createTestDb(); });

  it('saveActionEvent → getRunEvents 왕복', async () => {
    const event = makeEvent();
    await saveActionEvent(db, event);

    const events = await getRunEvents(db, testRun.id);
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('update_ad');
    expect(events[0].phase).toBe('PROPOSED');
  });

  it('argsSummary가 JSON으로 정확하게 저장/복원된다', async () => {
    const event = makeEvent({ argsSummary: { adId: 'ad-999', content: '[REDACTED]' } });
    await saveActionEvent(db, event);

    const [found] = await getRunEvents(db, testRun.id);
    expect(found.argsSummary).toEqual({ adId: 'ad-999', content: '[REDACTED]' });
  });

  it('agentProposed boolean이 정확하게 저장/복원된다', async () => {
    await saveActionEvent(db, makeEvent({ id: 'e1', agentProposed: false, step: 0 }));
    await saveActionEvent(db, makeEvent({ id: 'e2', agentProposed: true,  step: 1 }));

    const events = await getRunEvents(db, testRun.id);
    expect(events[0].agentProposed).toBe(false);
    expect(events[1].agentProposed).toBe(true);
  });

  it('mockResult가 있는 EXECUTED 이벤트를 정확하게 저장/복원한다', async () => {
    const mockResult = { success: true, data: { reportId: 'mock-001' }, executedAt: '2026-11-06T00:00:01.000Z' };
    const event = makeEvent({
      id: 'evt-executed',
      phase: 'EXECUTED',
      verdict: 'ALLOWED',
      policyCheckId: 'pc-001',
      mockResult,
    });
    await saveActionEvent(db, event);

    const [found] = await getRunEvents(db, testRun.id);
    expect(found.phase).toBe('EXECUTED');
    expect(found.mockResult).toEqual(mockResult);
  });

  it('mockResult: null인 이벤트는 null로 복원된다', async () => {
    await saveActionEvent(db, makeEvent({ mockResult: null }));
    const [found] = await getRunEvents(db, testRun.id);
    expect(found.mockResult).toBeNull();
  });

  it('getRunEvents는 step 순서대로 이벤트를 반환한다', async () => {
    // 의도적으로 역순 저장
    await saveActionEvent(db, makeEvent({ id: 'e2', step: 2, phase: 'BLOCKED' }));
    await saveActionEvent(db, makeEvent({ id: 'e0', step: 0, phase: 'PROPOSED' }));
    await saveActionEvent(db, makeEvent({ id: 'e1', step: 1, phase: 'POLICY_CHECKED', policyCheckId: 'pc-1' }));

    const events = await getRunEvents(db, testRun.id);
    expect(events.map((e) => e.step)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.phase)).toEqual(['PROPOSED', 'POLICY_CHECKED', 'BLOCKED']);
  });

  it('getEventsByToolCallId — 같은 toolCallId의 이벤트 그룹을 반환한다', async () => {
    const tcId = 'tc-group-001';
    await saveActionEvent(db, makeEvent({ id: 'e0', step: 0, toolCallId: tcId, phase: 'PROPOSED'       }));
    await saveActionEvent(db, makeEvent({ id: 'e1', step: 1, toolCallId: tcId, phase: 'POLICY_CHECKED', policyCheckId: 'pc-1' }));
    await saveActionEvent(db, makeEvent({ id: 'e2', step: 2, toolCallId: tcId, phase: 'BLOCKED',        policyCheckId: 'pc-1' }));
    // 다른 toolCallId
    await saveActionEvent(db, makeEvent({ id: 'e3', step: 3, toolCallId: 'tc-other', phase: 'PROPOSED' }));

    const group = await getEventsByToolCallId(db, tcId);
    expect(group).toHaveLength(3);
    expect(group.map((e) => e.phase)).toEqual(['PROPOSED', 'POLICY_CHECKED', 'BLOCKED']);
    expect(group.every((e) => e.toolCallId === tcId)).toBe(true);
  });

  it('policyCheckId가 POLICY_CHECKED와 BLOCKED 이벤트에서 동일하게 복원된다', async () => {
    const pcId = 'pc-link-test';
    const tcId = 'tc-link-test';
    await saveActionEvent(db, makeEvent({ id: 'e0', step: 0, toolCallId: tcId, policyCheckId: null,  phase: 'PROPOSED'       }));
    await saveActionEvent(db, makeEvent({ id: 'e1', step: 1, toolCallId: tcId, policyCheckId: pcId,  phase: 'POLICY_CHECKED', verdict: 'VIOLATION' }));
    await saveActionEvent(db, makeEvent({ id: 'e2', step: 2, toolCallId: tcId, policyCheckId: pcId,  phase: 'BLOCKED',        verdict: 'VIOLATION' }));

    const events = await getRunEvents(db, testRun.id);
    expect(events[0].policyCheckId).toBeNull();
    expect(events[1].policyCheckId).toBe(pcId);
    expect(events[2].policyCheckId).toBe(pcId);
  });
});

// ---------------------------------------------------------------------------
// Runner와 DB 통합 — 실제 실행 결과를 DB에 저장하고 재조회
// ---------------------------------------------------------------------------

describe('Runner → DB 통합 — 실행 이벤트를 DB에 기록하고 복원한다', () => {
  let db: TestDB;

  beforeEach(() => { db = createTestDb(); });

  it('DETERMINISTIC_TEST 실행 → saveActionEvent → getRunEvents 전체 흐름', async () => {
    const { runExperiment } = await import('@/server/agent/runner');
    const { adAgentRegistry } = await import('@/server/tools/registry');
    const { InMemoryEventWriter } = await import('@/lib/event-log');

    const policy: import('@/lib/types').Policy = {
      id: 'p-integration', name: 'Integration Test Policy', version: 1,
      createdAt: '2026-11-06T00:00:00.000Z',
      rules: [
        { id: 'r1', toolName: 'search_rule', permission: 'ALLOWED' },
        { id: 'r2', toolName: 'update_ad',   permission: 'DENIED'  },
      ],
    };

    // Runner 실행 (인메모리 writer)
    const writer = new InMemoryEventWriter();
    const result = await runExperiment({
      runMode:      'DETERMINISTIC_TEST',
      runId:        'run-integration-001',
      experimentId: 'exp-integration-001',
      policy,
      registry:     adAgentRegistry,
      eventWriter:  writer,
      forcedCalls: [
        { toolName: 'search_rule', args: { query: '테스트' } },
        { toolName: 'update_ad',   args: { adId: 'ad-1', content: 'x' } },
      ],
    });

    // Runner 결과 확인
    expect(result.executedCount).toBe(1);
    expect(result.blockedCount).toBe(1);

    // DB에 저장
    const events = await writer.getAll();
    for (const event of events) {
      await saveActionEvent(db, event);
    }

    // DB에서 재조회
    const fromDb = await getRunEvents(db, 'run-integration-001');
    expect(fromDb).toHaveLength(events.length);

    // 순서 보장
    expect(fromDb.map((e) => e.step)).toEqual([...Array(events.length).keys()]);

    // update_ad BLOCKED 이벤트가 DB에 정확히 저장됐는지
    const blocked = fromDb.find((e) => e.phase === 'BLOCKED');
    expect(blocked).toBeDefined();
    expect(blocked!.toolName).toBe('update_ad');
    expect(blocked!.verdict).toBe('VIOLATION');
    expect(blocked!.agentProposed).toBe(false);
  });
});
