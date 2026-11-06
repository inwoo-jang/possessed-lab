/**
 * POSSESSED — Drizzle ORM 스키마 (SQLite)
 *
 * 테이블 구조:
 *   policies      — 정책 정의
 *   experiments   — 실험 메타데이터
 *   runs          — 실험 실행 단위 (policySnapshot 포함)
 *   action_events — 도구 호출 이벤트 스트림
 *
 * 주요 컬럼:
 *   action_events.tool_call_id   — 하나의 도구 호출 시도를 묶는 ID
 *   action_events.policy_check_id — 판정 이벤트와 결과 이벤트 연결
 *   action_events.agent_proposed  — LLM 자발 제안(1) vs 강제 주입(0)
 *   runs.policy_snapshot          — 실행 시점 정책 전체 스냅샷 (JSON)
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// policies
// ---------------------------------------------------------------------------

export const policies = sqliteTable('policies', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  version:   integer('version').notNull().default(1),
  /** JSON: PolicyRule[] */
  rules:     text('rules').notNull(),
  createdAt: text('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// experiments
// ---------------------------------------------------------------------------

export const experiments = sqliteTable('experiments', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  scenarioId: text('scenario_id').notNull(),
  policyId:   text('policy_id').notNull(),
  createdAt:  text('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------

export const runs = sqliteTable('runs', {
  id:             text('id').primaryKey(),
  experimentId:   text('experiment_id').notNull(),
  /** RunMode: DETERMINISTIC_TEST | LIVE_EXPERIMENT | REPLAY_DEMO */
  runMode:        text('run_mode').notNull(),
  /** JSON: RunMetadata */
  metadata:       text('metadata').notNull(),
  /**
   * JSON: PolicySnapshot
   * 실행 시점의 정책 전체를 저장.
   * 정책이 이후 수정돼도 이전 실행의 판정 근거를 재현할 수 있음.
   */
  policySnapshot: text('policy_snapshot').notNull(),
  status:         text('status').notNull().default('PENDING'),
  startedAt:      text('started_at').notNull(),
  completedAt:    text('completed_at'),
});

// ---------------------------------------------------------------------------
// action_events
// ---------------------------------------------------------------------------

export const actionEvents = sqliteTable('action_events', {
  id:           text('id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  runId:        text('run_id').notNull(),
  /**
   * 하나의 도구 호출 시도를 묶는 UUID.
   * PROPOSED → POLICY_CHECKED → BLOCKED/EXECUTED 세 이벤트가 동일 값 공유.
   */
  toolCallId:   text('tool_call_id').notNull(),
  /**
   * 판정 이벤트(POLICY_CHECKED)와 결과 이벤트(EXECUTED/BLOCKED) 연결.
   * PROPOSED 단계에서는 NULL.
   */
  policyCheckId: text('policy_check_id'),
  step:          integer('step').notNull(),
  toolName:      text('tool_name').notNull(),
  /** JSON: 민감 필드 마스킹 적용된 인수 요약 */
  argsSummary:   text('args_summary').notNull(),
  /** ActionPhase: PROPOSED | POLICY_CHECKED | EXECUTED | BLOCKED | ERROR */
  phase:         text('phase').notNull(),
  /** PolicyVerdict: ALLOWED | VIOLATION | NEEDS_APPROVAL | PENDING | NULL */
  verdict:       text('verdict'),
  policyRuleId:  text('policy_rule_id'),
  /**
   * 1 = LLM이 스스로 제안 (LIVE_EXPERIMENT)
   * 0 = 강제 주입 (DETERMINISTIC_TEST)
   */
  agentProposed: integer('agent_proposed', { mode: 'boolean' }).notNull(),
  /** RunMode */
  runMode:       text('run_mode').notNull(),
  /** JSON: MockToolResult (EXECUTED 시) */
  mockResult:    text('mock_result'),
  errorMessage:  text('error_message'),
  timestamp:     text('timestamp').notNull(),
});

// ---------------------------------------------------------------------------
// 타입 추출 (Drizzle infer)
// ---------------------------------------------------------------------------

export type PolicyRow      = typeof policies.$inferSelect;
export type PolicyInsert   = typeof policies.$inferInsert;
export type ExperimentRow  = typeof experiments.$inferSelect;
export type ExperimentInsert = typeof experiments.$inferInsert;
export type RunRow         = typeof runs.$inferSelect;
export type RunInsert      = typeof runs.$inferInsert;
export type ActionEventRow = typeof actionEvents.$inferSelect;
export type ActionEventInsert = typeof actionEvents.$inferInsert;
