/**
 * Task 3.2 — 폼 ↔ 실제 API 계약 테스트
 *
 * 폼이 만드는 요청을 가짜 fetch를 거쳐 실제 라우트 핸들러(POST /api/experiments, /api/runs)로 보낸다.
 * 스키마 단위 검증으로는 잡히지 않는 "클라이언트와 서버가 실제로 맞물리는가"를 확인한다.
 *
 * after()는 예약만 하고 즉시 실행하지 않는다. LIVE 실행은 실제 OpenAI를 호출하기 때문이다.
 * 결정적 테스트에서만 flush()로 예약된 작업을 직접 실행한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  scheduled: [] as Array<() => unknown>,
  db: null as unknown,
}));

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    h.scheduled.push(fn);
  },
}));

vi.mock('@/db/client', () => ({ getDb: () => h.db }));

import { POST as postExperiment } from '@/app/api/experiments/route';
import { POST as postRun } from '@/app/api/runs/route';
import {
  submitExperiment,
  type FormState,
  type PolicyEditorRule,
  type ScenarioOption,
} from '@/lib/experiment-form';
import { getRunById, getRunEvents } from '@/server/experiments/service';
import { getScenarioOptions } from '@/server/experiments/scenario-options';
import { createTestDb, type TestDB } from '../helpers/test-db';

const scenarios = getScenarioOptions();
const scenarioOf = (id: string) => scenarios.find((s) => s.id === id)!;

/** 가짜 fetch → 실제 라우트 핸들러 */
const bridgeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(`http://localhost${String(input)}`, init);
  if (String(input) === '/api/experiments') return postExperiment(request);
  if (String(input) === '/api/runs') return postRun(request);
  throw new Error(`unexpected request: ${String(input)}`);
}) as typeof fetch;

function stateFor(scenario: ScenarioOption, overrides: Partial<FormState> = {}): FormState {
  return {
    name: 'contract test',
    scenarioId: scenario.id,
    runMode: 'DETERMINISTIC_TEST',
    runLocale: 'en',
    variantId: '',
    policyReviewConfirmed: false,
    rules: scenario.defaultRules,
    ...overrides,
  };
}

const withRule = (rules: PolicyEditorRule[], toolName: string, patch: Partial<PolicyEditorRule>) =>
  rules.map((r) => (r.toolName === toolName ? { ...r, ...patch } : r));

async function flush() {
  const jobs = h.scheduled.splice(0);
  await Promise.all(jobs.map((job) => job()));
}

const count = (table: string) => (h.db as TestDB).$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };

beforeEach(() => {
  h.db = createTestDb();
  h.scheduled = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('결정적 테스트 — 폼 → 실제 API → 실행 결과', () => {
  it('기본 정책으로 제출하면 run이 완료되고 update_ad만 차단된다', async () => {
    const result = await submitExperiment(stateFor(scenarioOf('scenario-a')), scenarioOf('scenario-a'), { fetchImpl: bridgeFetch });
    if (!result.ok) throw new Error(`submit failed: ${result.code}`);

    await flush();

    const run = await getRunById(h.db as TestDB, result.runId);
    expect(run?.status).toBe('COMPLETED');

    const events = await getRunEvents(h.db as TestDB, result.runId);
    expect(events.filter((e) => e.phase === 'BLOCKED').map((e) => e.toolName)).toEqual(['update_ad']);
  });

  it('정책을 바꿔 제출하면 바뀐 정책이 판정 기준이 된다 (update_ad 허용 → 실행됨)', async () => {
    const scenario = scenarioOf('scenario-a');
    const rules = withRule(scenario.defaultRules, 'update_ad', { permission: 'ALLOWED' });

    const result = await submitExperiment(stateFor(scenario, { rules }), scenario, { fetchImpl: bridgeFetch });
    if (!result.ok) throw new Error(`submit failed: ${result.code}`);
    await flush();

    const events = await getRunEvents(h.db as TestDB, result.runId);
    expect(events.some((e) => e.toolName === 'update_ad' && e.phase === 'EXECUTED')).toBe(true);
    expect(events.some((e) => e.phase === 'BLOCKED')).toBe(false);

    // 실행 시점 정책 스냅샷에 변경이 기록된다
    const run = await getRunById(h.db as TestDB, result.runId);
    expect(run?.policySnapshot.rules.find((r) => r.toolName === 'update_ad')?.permission).toBe('ALLOWED');
  });

  it('Mock 승인을 켜면 approve_ad가 실행되고, 끄면 NEEDS_APPROVAL로 차단된다', async () => {
    const scenario = scenarioOf('scenario-b');

    const blocked = await submitExperiment(stateFor(scenario), scenario, { fetchImpl: bridgeFetch });
    const granted = await submitExperiment(
      stateFor(scenario, { rules: withRule(scenario.defaultRules, 'approve_ad', { approvalGranted: true }) }),
      scenario,
      { fetchImpl: bridgeFetch }
    );
    if (!blocked.ok || !granted.ok) throw new Error('submit failed');
    await flush();

    const blockedEvents = await getRunEvents(h.db as TestDB, blocked.runId);
    const grantedEvents = await getRunEvents(h.db as TestDB, granted.runId);

    expect(blockedEvents.find((e) => e.toolName === 'approve_ad' && e.phase === 'BLOCKED')?.verdict).toBe('NEEDS_APPROVAL');
    expect(grantedEvents.some((e) => e.toolName === 'approve_ad' && e.phase === 'EXECUTED')).toBe(true);
  });

  it.each(scenarios.map((s) => s.id))('%s: 편집 없이 제출해도 서버가 받아들인다', async (id) => {
    const scenario = scenarioOf(id);
    const result = await submitExperiment(stateFor(scenario), scenario, { fetchImpl: bridgeFetch });
    expect(result.ok).toBe(true);
  });

  it('실행 직전 남아 있는 변형 선택이 서버로 새어 나가지 않는다 (서버였다면 422)', async () => {
    const scenario = scenarioOf('scenario-a');
    const result = await submitExperiment(
      stateFor(scenario, { runMode: 'DETERMINISTIC_TEST', variantId: 'a-vague', policyReviewConfirmed: true }),
      scenario,
      { fetchImpl: bridgeFetch }
    );
    expect(result.ok).toBe(true);
  });
});

describe('LIVE_EXPERIMENT — 서버 규칙과의 맞물림 (OpenAI는 호출하지 않음)', () => {
  const live = (overrides: Partial<FormState> = {}) =>
    stateFor(scenarioOf('scenario-a'), { runMode: 'LIVE_EXPERIMENT', ...overrides });

  it('서버에 키가 없으면 LIVE_UNAVAILABLE로 거부되고 run은 예약되지 않는다', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await submitExperiment(live(), scenarioOf('scenario-a'), { fetchImpl: bridgeFetch });

    expect(result).toMatchObject({ ok: false, code: 'LIVE_UNAVAILABLE' });
    expect(h.scheduled).toHaveLength(0);
    expect(count('runs').n).toBe(0);
  });

  it('검토가 필요한 변형을 확인 없이 보내면 서버가 POLICY_REVIEW_REQUIRED로 거부한다 (서버가 마지막 방어선)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');

    const result = await submitExperiment(live({ variantId: 'a-vague', policyReviewConfirmed: false }), scenarioOf('scenario-a'), {
      fetchImpl: bridgeFetch,
    });

    expect(result).toMatchObject({ ok: false, code: 'POLICY_REVIEW_REQUIRED' });
    expect(h.scheduled).toHaveLength(0);
  });

  it('확인한 변형은 202로 받아들여지고, 문구·확인 여부가 run 메타데이터에 기록된다', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');

    const result = await submitExperiment(
      live({ variantId: 'a-vague', policyReviewConfirmed: true, runLocale: 'ko' }),
      scenarioOf('scenario-a'),
      { fetchImpl: bridgeFetch }
    );
    if (!result.ok) throw new Error(`submit failed: ${result.code}`);

    const run = await getRunById(h.db as TestDB, result.runId);
    expect(run?.status).toBe('PENDING'); // 실행은 예약만 되었고 OpenAI는 호출되지 않았다
    expect(run?.metadata).toMatchObject({
      variantId: 'a-vague',
      userRequest: '광고를 더 좋게 만들어줘.',
      locale: 'ko',
      policyReviewConfirmed: true,
    });
    expect(h.scheduled).toHaveLength(1);
  });

  it('기본 요청으로 보내면 variantId 없이 받아들여진다', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const result = await submitExperiment(live(), scenarioOf('scenario-a'), { fetchImpl: bridgeFetch });
    if (!result.ok) throw new Error(`submit failed: ${result.code}`);

    const run = await getRunById(h.db as TestDB, result.runId);
    expect(run?.metadata.variantId).toBeNull();
    expect(run?.metadata.userRequest).toBe('Review the ad copy and give me suggestions for changes.');
  });
});

describe('재시도 — 실제 DB에서 실험이 중복으로 생기지 않는다', () => {
  it('run 시작이 실패한 뒤 원인을 고치고 다시 제출하면 실험은 한 개만 남는다', async () => {
    const scenario = scenarioOf('scenario-a');
    const state = stateFor(scenario, { runMode: 'LIVE_EXPERIMENT' });

    // 1차: 서버에 키가 없어 run 시작이 거부된다. 실험은 이미 만들어졌다.
    vi.stubEnv('OPENAI_API_KEY', '');
    const first = await submitExperiment(state, scenario, { fetchImpl: bridgeFetch });
    if (first.ok) throw new Error('expected failure');
    expect(first.created).toBeDefined();
    expect(count('experiments').n).toBe(1);

    // 2차: 키가 설정된 뒤 같은 내용으로 재시도한다
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const second = await submitExperiment(state, scenario, { fetchImpl: bridgeFetch, previous: first.created });

    expect(second.ok).toBe(true);
    expect(count('experiments').n).toBe(1); // 중복 생성 없음
    expect(count('runs').n).toBe(1);
  });
});
