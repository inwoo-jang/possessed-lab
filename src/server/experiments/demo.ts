/**
 * Demo Mode — 사전 기록(REPLAY_DEMO) 시퀀스
 *
 * 시드(demo-seed.json)는 실제 모델 실행에서 기록한 것이 아니라 과잉 행동 시도가 화면에 어떻게
 * 나타나는지 보여 주려고 직접 쓴 시퀀스다. 그래서:
 *   - 모든 이벤트의 runMode는 REPLAY_DEMO이고, 화면은 항상 "사전 기록 결과 — 실제 LLM 실행이 아님"을 보인다.
 *   - 모델 이름과 온도는 비워 둔다 (실제 모델이 한 것처럼 보이지 않게).
 *   - agentProposed는 "Agent가 제안한 것으로 쓴 시퀀스"라는 뜻으로 true를 기록한다.
 *     이 값으로 집계하지 않는다: 대시보드·비교 수치는 완료된 LIVE_EXPERIMENT만 센다.
 *
 * ID는 고정값(uuid v5)이라 같은 요청을 여러 번 해도 행이 늘어나지 않는다 (공개 배포에서 행 남용 방지).
 * 언어마다 run이 하나씩 있다: 사용자 요청과 최종 답변이 그 언어로 기록되기 때문이다.
 */

import { v5 as uuidv5 } from 'uuid';
import type { DB } from '@/db/client';
import type {
  ActionEvent,
  Experiment,
  Locale,
  Policy,
  PolicySnapshot,
  PolicyVerdict,
  Run,
} from '@/lib/types';
import seed from './demo-seed.json';
import { getScenario, getScenarioPolicy } from './scenarios';
import {
  getExperimentById,
  getPolicyById,
  getRunById,
  getRunEvents,
  saveActionEvent,
  saveExperiment,
  savePolicy,
  saveRun,
} from './service';

/** 시드에서 ID를 만들 때만 쓰는 고정 네임스페이스 */
const DEMO_NAMESPACE = '6f1d5a9e-3c1b-4f0a-9d63-5f4b6a1c2e70';

export const DEMO_EXPERIMENT_ID = 'demo-experiment';
export const DEMO_POLICY_ID = 'policy-demo';
const DEMO_EXPERIMENT_NAME = '[Demo] 검토 ≠ 수정 / Review ≠ Edit';

export function demoRunId(locale: Locale): string {
  return `demo-run-${locale}`;
}

const STEP_MS = 500;

type SeedCall = (typeof seed.calls)[number];

export interface DemoRunData {
  experiment: Experiment;
  policy: Policy;
  run: Run;
  events: ActionEvent[];
}

function buildCallEvents(call: SeedCall, runId: string, firstStep: number): ActionEvent[] {
  const toolCallId = uuidv5(`${runId}:${call.key}`, DEMO_NAMESPACE);
  const policyCheckId = uuidv5(`${runId}:${call.key}:check`, DEMO_NAMESPACE);
  const base = {
    experimentId: DEMO_EXPERIMENT_ID,
    runId,
    toolCallId,
    toolName: call.toolName,
    argsSummary: call.args as Record<string, unknown>,
    agentProposed: true,
    runMode: 'REPLAY_DEMO' as const,
    policyRuleId: `rule-${call.toolName}`,
    errorMessage: null,
  };
  const at = (step: number) => new Date(Date.parse(seed.startedAt) + step * STEP_MS).toISOString();
  const verdict = call.verdict as PolicyVerdict;
  const mockResult = 'mockResult' in call ? (call.mockResult as unknown) : null;

  const make = (offset: number, phase: ActionEvent['phase'], extra: Partial<ActionEvent>): ActionEvent => {
    const step = firstStep + offset;
    return {
      ...base,
      id: uuidv5(`${runId}:${call.key}:${phase}`, DEMO_NAMESPACE),
      step,
      phase,
      timestamp: at(step),
      policyCheckId: null,
      verdict: null,
      mockResult: null,
      ...extra,
    };
  };

  return [
    make(0, 'PROPOSED', {}),
    make(1, 'POLICY_CHECKED', { policyCheckId, verdict }),
    call.result === 'BLOCKED'
      ? make(2, 'BLOCKED', { policyCheckId, verdict })
      : make(2, 'EXECUTED', { policyCheckId, verdict, mockResult }),
  ];
}

/** 시드에서 한 언어의 데모 실험·정책·run·이벤트를 만든다 (DB를 건드리지 않는다). */
export function buildDemoRun(locale: Locale): DemoRunData {
  const scenario = getScenario(seed.scenarioId);
  const basePolicy = getScenarioPolicy(seed.scenarioId);
  if (!scenario || !basePolicy) throw new Error(`Demo seed references an unknown scenario: ${seed.scenarioId}`);

  const runId = demoRunId(locale);
  const policy: Policy = { ...basePolicy, id: DEMO_POLICY_ID };
  const snapshot: PolicySnapshot = { ...policy, snapshotAt: seed.startedAt };

  const events = seed.calls.flatMap((call, index) => buildCallEvents(call, runId, index * 3 + 1));

  return {
    policy,
    experiment: {
      id: DEMO_EXPERIMENT_ID,
      name: DEMO_EXPERIMENT_NAME,
      scenarioId: seed.scenarioId,
      policyId: policy.id,
      createdAt: policy.createdAt,
    },
    run: {
      id: runId,
      experimentId: DEMO_EXPERIMENT_ID,
      runMode: 'REPLAY_DEMO',
      metadata: {
        model: null,
        temperature: null,
        promptVersion: seed.promptVersion,
        policyVersion: policy.version,
        locale,
        variantId: null,
        userRequest: scenario.baseRequest[locale],
        policyReviewConfirmed: false,
        finalAnswer: seed.finalAnswer[locale],
      },
      policySnapshot: snapshot,
      status: 'COMPLETED',
      startedAt: seed.startedAt,
      completedAt: seed.completedAt,
    },
    events,
  };
}

/**
 * 데모 run이 DB에 없으면 만들고, 있으면 그대로 돌려준다 (멱등).
 * run은 마지막에 저장하므로, run이 있으면 이벤트도 모두 있다.
 */
export async function ensureDemoRun(
  db: DB,
  locale: Locale
): Promise<{ experimentId: string; runId: string; created: boolean }> {
  const data = buildDemoRun(locale);
  const runId = data.run.id;

  if (await getRunById(db, runId)) return { experimentId: DEMO_EXPERIMENT_ID, runId, created: false };

  if (!(await getPolicyById(db, data.policy.id))) await savePolicy(db, data.policy);
  if (!(await getExperimentById(db, data.experiment.id))) await saveExperiment(db, data.experiment);

  const existing = new Set((await getRunEvents(db, runId)).map((e) => e.id));
  for (const event of data.events) {
    if (!existing.has(event.id)) await saveActionEvent(db, event);
  }
  await saveRun(db, data.run);

  return { experimentId: DEMO_EXPERIMENT_ID, runId, created: true };
}
