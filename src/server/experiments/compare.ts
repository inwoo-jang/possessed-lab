/**
 * Run Compare — 두 run의 도구 호출과 정책을 비교한다.
 *
 * 비교 단위는 이벤트가 아니라 "도구 호출 1건"이다. 한 호출은 PROPOSED → POLICY_CHECKED →
 * EXECUTED/BLOCKED/ERROR 이벤트 여러 개로 기록되므로 toolCallId로 묶어서 본다.
 *
 * 두 run의 호출은 step 번호가 아니라 (toolName, 같은 도구의 n번째 호출)로 맞춘다.
 * LLM은 호출 순서와 횟수가 매번 달라질 수 있어서 step으로 맞추면 다른 호출끼리 비교된다.
 */

import type { DB } from '@/db/client';
import { summarizeEvents } from '@/lib/event-stats';
import { groupEventsIntoCalls } from '@/lib/trace';
import type {
  ActionEvent,
  CallOutcome,
  ComparisonWarning,
  EventDiff,
  PolicySnapshot,
  PolicyRuleDiff,
  PolicyVerdict,
  Run,
  RunComparison,
  RunComparisonSide,
} from '@/lib/types';
import { NotFoundError } from './errors';
import { getExperimentById, getRunById, getRunEvents } from './service';

// ---------------------------------------------------------------------------
// 호출 단위 요약
// ---------------------------------------------------------------------------

export interface CallSummary {
  toolName: string;
  /** 같은 toolName의 호출 중 몇 번째인지 (0부터, 발생 순서 기준) */
  occurrenceIndex: number;
  /** POLICY_CHECKED 이벤트의 판정. 판정 전에 끊겼으면 null */
  verdict: PolicyVerdict | null;
  outcome: CallOutcome;
  agentProposed: boolean;
}

/**
 * 이벤트를 toolCallId로 묶어 호출 1건당 하나의 요약으로 만든다. 발생 순서를 유지한다.
 * 묶기 규칙은 trace 화면과 공유한다 (lib/trace.ts).
 */
export function summarizeCalls(events: readonly ActionEvent[]): CallSummary[] {
  return groupEventsIntoCalls(events).map((call) => ({
    toolName: call.toolName,
    occurrenceIndex: call.occurrenceIndex,
    verdict: call.verdict,
    outcome: call.outcome,
    agentProposed: call.agentProposed,
  }));
}

// ---------------------------------------------------------------------------
// 호출 diff
// ---------------------------------------------------------------------------

const keyOf = (c: { toolName: string; occurrenceIndex: number }) => `${c.toolName}#${c.occurrenceIndex}`;

/**
 * 두 호출 목록을 (toolName, occurrenceIndex)로 맞춰 비교한다.
 * 결과 순서는 A의 호출 순서를 따르고, B에만 있는 호출은 B의 순서대로 뒤에 붙는다.
 */
export function diffCalls(a: readonly CallSummary[], b: readonly CallSummary[]): EventDiff[] {
  const bByKey = new Map(b.map((c) => [keyOf(c), c]));
  const aKeys = new Set(a.map(keyOf));
  const diffs: EventDiff[] = [];

  for (const callA of a) {
    const callB = bByKey.get(keyOf(callA));
    diffs.push(toDiff(callA.toolName, callA.occurrenceIndex, callA, callB));
  }
  for (const callB of b) {
    if (aKeys.has(keyOf(callB))) continue;
    diffs.push(toDiff(callB.toolName, callB.occurrenceIndex, undefined, callB));
  }

  return diffs;
}

function toDiff(
  toolName: string,
  occurrenceIndex: number,
  a: CallSummary | undefined,
  b: CallSummary | undefined
): EventDiff {
  const changed =
    a === undefined ||
    b === undefined ||
    a.verdict !== b.verdict ||
    a.outcome !== b.outcome;

  return {
    toolName,
    occurrenceIndex,
    verdictA: a?.verdict ?? null,
    verdictB: b?.verdict ?? null,
    outcomeA: a?.outcome ?? null,
    outcomeB: b?.outcome ?? null,
    agentProposedA: a?.agentProposed ?? null,
    agentProposedB: b?.agentProposed ?? null,
    changed,
  };
}

// ---------------------------------------------------------------------------
// 정책 diff
// ---------------------------------------------------------------------------

function ruleState(snapshot: PolicySnapshot, toolName: string): PolicyRuleDiff['a'] {
  const rule = snapshot.rules.find((r) => r.toolName === toolName);
  if (!rule) return null;
  return {
    permission: rule.permission,
    approvalGranted: rule.mockApprovalState ? rule.mockApprovalState.granted : null,
  };
}

/** 두 정책 스냅샷에서 달라진 규칙만 반환한다 (권한 또는 Mock 승인 상태가 다른 경우). */
export function diffPolicies(a: PolicySnapshot, b: PolicySnapshot): PolicyRuleDiff[] {
  const toolNames = [...new Set([...a.rules, ...b.rules].map((r) => r.toolName))];
  const diffs: PolicyRuleDiff[] = [];

  for (const toolName of toolNames) {
    const stateA = ruleState(a, toolName);
    const stateB = ruleState(b, toolName);

    const same =
      stateA !== null &&
      stateB !== null &&
      stateA.permission === stateB.permission &&
      stateA.approvalGranted === stateB.approvalGranted;

    if (!same) diffs.push({ toolName, a: stateA, b: stateB });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// 경고
// ---------------------------------------------------------------------------

function buildWarnings(
  runA: Run,
  runB: Run,
  scenarioA: string | null,
  scenarioB: string | null
): ComparisonWarning[] {
  const warnings: ComparisonWarning[] = [];

  if (runA.runMode !== runB.runMode) {
    warnings.push({
      code: 'RUN_MODE_MISMATCH',
      message:
        `The runs have different modes (${runA.runMode} vs ${runB.runMode}). ` +
        'Forced calls and agent-proposed calls are not directly comparable.',
    });
  }

  if (scenarioA !== scenarioB) {
    warnings.push({
      code: 'SCENARIO_MISMATCH',
      message: `The runs belong to different scenarios (${scenarioA ?? 'unknown'} vs ${scenarioB ?? 'unknown'}).`,
    });
  }

  const unfinished = [runA, runB].filter((r) => r.status !== 'COMPLETED');
  if (unfinished.length > 0) {
    warnings.push({
      code: 'RUN_NOT_COMPLETED',
      message:
        'Some runs are not completed: ' +
        unfinished.map((r) => `${r.id} (${r.status})`).join(', ') +
        '. Their events may be incomplete.',
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

async function loadSide(db: DB, run: Run, events: ActionEvent[]): Promise<RunComparisonSide> {
  const experiment = await getExperimentById(db, run.experimentId);
  return {
    id: run.id,
    experimentId: run.experimentId,
    scenarioId: experiment?.scenarioId ?? null,
    runMode: run.runMode,
    status: run.status,
    metadata: run.metadata,
    policySnapshotAt: run.policySnapshot.snapshotAt,
    stats: summarizeEvents(events),
  };
}

/** 두 run을 비교한다. 존재하지 않는 run이면 NotFoundError. */
export async function compareRuns(db: DB, runAId: string, runBId: string): Promise<RunComparison> {
  const runA = await getRunById(db, runAId);
  if (!runA) throw new NotFoundError('Run', runAId);
  const runB = await getRunById(db, runBId);
  if (!runB) throw new NotFoundError('Run', runBId);

  const [eventsA, eventsB] = await Promise.all([getRunEvents(db, runA.id), getRunEvents(db, runB.id)]);
  const [sideA, sideB] = await Promise.all([loadSide(db, runA, eventsA), loadSide(db, runB, eventsB)]);

  const diff = diffCalls(summarizeCalls(eventsA), summarizeCalls(eventsB));

  return {
    runA: sideA,
    runB: sideB,
    warnings: buildWarnings(runA, runB, sideA.scenarioId, sideB.scenarioId),
    diff,
    changedCount: diff.filter((d) => d.changed).length,
    policyDiff: diffPolicies(runA.policySnapshot, runB.policySnapshot),
  };
}
