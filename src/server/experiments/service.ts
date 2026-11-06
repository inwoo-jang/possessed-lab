/**
 * Experiment Service — Repository 계층
 *
 * DB 접근을 추상화한다. 모든 DB 쓰기/읽기는 이 파일을 통해 이루어진다.
 *
 * 직렬화 규칙:
 *   - JSON 컬럼(rules, metadata, policySnapshot, argsSummary, mockResult)은
 *     저장 시 JSON.stringify, 읽기 시 JSON.parse 처리
 *   - agentProposed는 Drizzle { mode: 'boolean' }으로 자동 변환
 */

import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { policies, experiments, runs, actionEvents } from '@/db/schema';
import type {
  Policy,
  PolicySnapshot,
  Experiment,
  Run,
  RunMetadata,
  ActionEvent,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export async function savePolicy(db: DB, policy: Policy): Promise<void> {
  await db.insert(policies).values({
    id:        policy.id,
    name:      policy.name,
    version:   policy.version,
    rules:     JSON.stringify(policy.rules),
    createdAt: policy.createdAt,
  });
}

export async function getPolicyById(db: DB, id: string): Promise<Policy | null> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id:        row.id,
    name:      row.name,
    version:   row.version,
    rules:     JSON.parse(row.rules),
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Experiment
// ---------------------------------------------------------------------------

export async function saveExperiment(db: DB, experiment: Experiment): Promise<void> {
  await db.insert(experiments).values({
    id:         experiment.id,
    name:       experiment.name,
    scenarioId: experiment.scenarioId,
    policyId:   experiment.policyId,
    createdAt:  experiment.createdAt,
  });
}

export async function getExperimentById(db: DB, id: string): Promise<Experiment | null> {
  const rows = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id:         row.id,
    name:       row.name,
    scenarioId: row.scenarioId,
    policyId:   row.policyId,
    createdAt:  row.createdAt,
  };
}

export async function listExperiments(db: DB): Promise<Experiment[]> {
  const rows = await db.select().from(experiments);
  return rows.map((row) => ({
    id:         row.id,
    name:       row.name,
    scenarioId: row.scenarioId,
    policyId:   row.policyId,
    createdAt:  row.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function saveRun(db: DB, run: Run): Promise<void> {
  await db.insert(runs).values({
    id:             run.id,
    experimentId:   run.experimentId,
    runMode:        run.runMode,
    metadata:       JSON.stringify(run.metadata),
    policySnapshot: JSON.stringify(run.policySnapshot),
    status:         run.status,
    startedAt:      run.startedAt,
    completedAt:    run.completedAt ?? null,
  });
}

export async function updateRunStatus(
  db: DB,
  runId: string,
  status: Run['status'],
  completedAt?: string
): Promise<void> {
  await db
    .update(runs)
    .set({
      status,
      ...(completedAt ? { completedAt } : {}),
    })
    .where(eq(runs.id, runId));
}

export async function getRunById(db: DB, id: string): Promise<Run | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return deserializeRun(row);
}

export async function listRunsByExperiment(db: DB, experimentId: string): Promise<Run[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.experimentId, experimentId));

  return rows.map(deserializeRun);
}

function deserializeRun(row: typeof runs.$inferSelect): Run {
  return {
    id:             row.id,
    experimentId:   row.experimentId,
    runMode:        row.runMode as Run['runMode'],
    metadata:       JSON.parse(row.metadata) as RunMetadata,
    policySnapshot: JSON.parse(row.policySnapshot) as PolicySnapshot,
    status:         row.status as Run['status'],
    startedAt:      row.startedAt,
    completedAt:    row.completedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// ActionEvent
// ---------------------------------------------------------------------------

export async function saveActionEvent(db: DB, event: ActionEvent): Promise<void> {
  await db.insert(actionEvents).values({
    id:            event.id,
    experimentId:  event.experimentId,
    runId:         event.runId,
    toolCallId:    event.toolCallId,
    policyCheckId: event.policyCheckId ?? null,
    step:          event.step,
    toolName:      event.toolName,
    argsSummary:   JSON.stringify(event.argsSummary),
    phase:         event.phase,
    verdict:       event.verdict ?? null,
    policyRuleId:  event.policyRuleId ?? null,
    agentProposed: event.agentProposed,
    runMode:       event.runMode,
    mockResult:    event.mockResult !== null ? JSON.stringify(event.mockResult) : null,
    errorMessage:  event.errorMessage ?? null,
    timestamp:     event.timestamp,
  });
}

export async function getRunEvents(db: DB, runId: string): Promise<ActionEvent[]> {
  const rows = await db
    .select()
    .from(actionEvents)
    .where(eq(actionEvents.runId, runId))
    .orderBy(actionEvents.step); // step 순서 보장

  return rows.map(deserializeActionEvent);
}

export async function getEventsByToolCallId(
  db: DB,
  toolCallId: string
): Promise<ActionEvent[]> {
  const rows = await db
    .select()
    .from(actionEvents)
    .where(eq(actionEvents.toolCallId, toolCallId))
    .orderBy(actionEvents.step);

  return rows.map(deserializeActionEvent);
}

function deserializeActionEvent(row: typeof actionEvents.$inferSelect): ActionEvent {
  return {
    id:            row.id,
    experimentId:  row.experimentId,
    runId:         row.runId,
    toolCallId:    row.toolCallId,
    policyCheckId: row.policyCheckId ?? null,
    step:          row.step,
    toolName:      row.toolName,
    argsSummary:   JSON.parse(row.argsSummary),
    phase:         row.phase as ActionEvent['phase'],
    verdict:       (row.verdict ?? null) as ActionEvent['verdict'],
    policyRuleId:  row.policyRuleId ?? null,
    agentProposed: row.agentProposed,
    runMode:       row.runMode as ActionEvent['runMode'],
    mockResult:    row.mockResult ? JSON.parse(row.mockResult) : null,
    errorMessage:  row.errorMessage ?? null,
    timestamp:     row.timestamp,
  };
}
