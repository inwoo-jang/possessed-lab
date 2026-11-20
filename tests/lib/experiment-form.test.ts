/**
 * Task 3.2 — Create Experiment 폼 로직 검증 (브라우저 없이)
 *
 * 클라이언트가 만드는 요청이 서버의 실제 입력 스키마를 통과하는지를 모든 시나리오·조합에서 확인한다.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MAX_NAME_LENGTH,
  buildExperimentInput,
  buildRunInput,
  isPolicyModified,
  isRuleModified,
  submitErrorKey,
  submitExperiment,
  toPolicyEditorRules,
  validateForm,
  type FormState,
  type PolicyEditorRule,
  type ScenarioOption,
} from '@/lib/experiment-form';
import { CreateExperimentInputSchema, CreateRunInputSchema } from '@/lib/schemas';
import { getScenarioOptions } from '@/server/experiments/scenario-options';
import { getScenarioPolicy } from '@/server/experiments/scenarios';

const scenarios = getScenarioOptions();
const scenarioA = scenarios.find((s) => s.id === 'scenario-a')!;

function stateFor(scenario: ScenarioOption, overrides: Partial<FormState> = {}): FormState {
  return {
    name: 'My experiment',
    scenarioId: scenario.id,
    runMode: 'DETERMINISTIC_TEST',
    runLocale: 'en',
    variantId: '',
    policyReviewConfirmed: false,
    rules: scenario.defaultRules,
    ...overrides,
  };
}

/** 특정 도구의 권한(또는 Mock 승인)만 바꾼 규칙 목록 */
function withRule(rules: PolicyEditorRule[], toolName: string, patch: Partial<PolicyEditorRule>): PolicyEditorRule[] {
  return rules.map((r) => (r.toolName === toolName ? { ...r, ...patch } : r));
}

// ---------------------------------------------------------------------------
// 정책 변환·비교
// ---------------------------------------------------------------------------

describe('toPolicyEditorRules / getScenarioOptions', () => {
  it('시나리오 기본 정책의 여섯 도구를 순서대로 규칙으로 바꾼다', () => {
    expect(scenarioA.defaultRules.map((r) => r.toolName)).toEqual([
      'search_rule', 'read_terms', 'draft_report', 'update_ad', 'approve_ad', 'send_external_message',
    ]);
  });

  it('approve_ad는 Mock 승인이 부여되지 않은 REQUIRES_APPROVAL이다', () => {
    const rule = scenarioA.defaultRules.find((r) => r.toolName === 'approve_ad')!;
    expect(rule.permission).toBe('REQUIRES_APPROVAL');
    expect(rule.approvalGranted).toBe(false);
    expect(rule.approvalMeta).toEqual({ grantedBy: 'mock-approver', scope: 'none (mock)' });
  });

  it('편집하지 않는 설명 필드를 보존한다', () => {
    const rule = scenarioA.defaultRules.find((r) => r.toolName === 'update_ad')!;
    expect(rule.description).toBe(getScenarioPolicy('scenario-a')!.rules.find((r) => r.toolName === 'update_ad')!.description);
    expect(rule.userIntentContext).toBeTruthy();
  });

  it('세 시나리오 모두 옵션으로 만들어지고 모든 변형이 한/영 문구를 가진다', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['scenario-a', 'scenario-b', 'scenario-c']);
    for (const s of scenarios) {
      for (const v of s.variants) {
        expect(v.request.ko).toBeTruthy();
        expect(v.request.en).toBeTruthy();
      }
    }
  });
});

describe('isPolicyModified / isRuleModified', () => {
  it('기본 규칙 그대로면 수정되지 않은 것이다', () => {
    expect(isPolicyModified(scenarioA.defaultRules, scenarioA.defaultRules)).toBe(false);
    expect(isPolicyModified(scenarioA.defaultRules, structuredClone(scenarioA.defaultRules))).toBe(false);
  });

  it('권한을 바꾸면 수정된 것이다', () => {
    const edited = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED' });
    expect(isPolicyModified(scenarioA.defaultRules, edited)).toBe(true);
  });

  it('REQUIRES_APPROVAL의 Mock 승인을 켜면 수정된 것이다', () => {
    const edited = withRule(scenarioA.defaultRules, 'approve_ad', { approvalGranted: true });
    expect(isPolicyModified(scenarioA.defaultRules, edited)).toBe(true);
  });

  it('REQUIRES_APPROVAL이 아닌 규칙의 approvalGranted는 무시한다 (정책에 영향이 없으므로)', () => {
    const edited = withRule(scenarioA.defaultRules, 'update_ad', { approvalGranted: true });
    expect(isPolicyModified(scenarioA.defaultRules, edited)).toBe(false);
  });

  it('바꿨다가 원래대로 돌리면 수정되지 않은 것이다', () => {
    const changed = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED' });
    const reverted = withRule(changed, 'update_ad', { permission: 'DENIED' });
    expect(isPolicyModified(scenarioA.defaultRules, reverted)).toBe(false);
  });

  it('규칙 수가 다르면 수정된 것이다', () => {
    expect(isPolicyModified(scenarioA.defaultRules, scenarioA.defaultRules.slice(1))).toBe(true);
  });

  it('기본에 없는 규칙은 수정된 것으로 본다', () => {
    expect(isRuleModified(undefined, scenarioA.defaultRules[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 요청 본문 — 서버 스키마와의 계약
// ---------------------------------------------------------------------------

describe('buildExperimentInput', () => {
  it('정책을 바꾸지 않았으면 policy를 보내지 않는다 (서버의 기본 정책 사용)', () => {
    const body = buildExperimentInput(stateFor(scenarioA), scenarioA);
    expect(body).toEqual({ name: 'My experiment', scenarioId: 'scenario-a' });
    expect(body).not.toHaveProperty('policy');
  });

  it('이름의 앞뒤 공백은 제거한다', () => {
    expect(buildExperimentInput(stateFor(scenarioA, { name: '  spaced  ' }), scenarioA).name).toBe('spaced');
  });

  it('정책을 바꿨으면 전체 규칙을 보낸다', () => {
    const rules = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED' });
    const body = buildExperimentInput(stateFor(scenarioA, { rules }), scenarioA);

    expect(body.policy?.rules).toHaveLength(6);
    expect(body.policy?.rules.find((r) => r.toolName === 'update_ad')?.permission).toBe('ALLOWED');
  });

  it('REQUIRES_APPROVAL 규칙에는 Mock 승인 상태를 싣는다', () => {
    const rules = withRule(scenarioA.defaultRules, 'approve_ad', { approvalGranted: true });
    const rule = buildExperimentInput(stateFor(scenarioA, { rules }), scenarioA).policy!.rules.find((r) => r.toolName === 'approve_ad')!;

    expect(rule.mockApprovalState).toEqual({ granted: true, grantedBy: 'mock-approver', scope: 'none (mock)' });
  });

  it('REQUIRES_APPROVAL이 아닌 규칙에는 Mock 승인 상태를 싣지 않는다', () => {
    const rules = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED', approvalGranted: true });
    const rule = buildExperimentInput(stateFor(scenarioA, { rules }), scenarioA).policy!.rules.find((r) => r.toolName === 'update_ad')!;
    expect(rule).not.toHaveProperty('mockApprovalState');
  });

  it('승인이 필요 없던 도구를 REQUIRES_APPROVAL로 바꾸면 기본 Mock 승인 정보를 채운다', () => {
    const rules = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'REQUIRES_APPROVAL' });
    const rule = buildExperimentInput(stateFor(scenarioA, { rules }), scenarioA).policy!.rules.find((r) => r.toolName === 'update_ad')!;
    expect(rule.mockApprovalState).toEqual({ granted: false, grantedBy: 'mock-approver', scope: 'mock' });
  });

  it('편집하지 않은 설명 필드를 그대로 전달한다', () => {
    const rules = withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED' });
    const sent = buildExperimentInput(stateFor(scenarioA, { rules }), scenarioA).policy!.rules.find((r) => r.toolName === 'search_rule')!;
    expect(sent.description).toBeTruthy();
    expect(sent.userIntentContext).toBeTruthy();
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('%s: 기본·수정 정책 모두 서버 스키마를 통과한다', (_id, scenario) => {
    const unmodified = buildExperimentInput(stateFor(scenario), scenario);
    expect(CreateExperimentInputSchema.safeParse(unmodified).success).toBe(true);

    const rules = withRule(withRule(scenario.defaultRules, 'update_ad', { permission: 'ALLOWED' }), 'approve_ad', { approvalGranted: true });
    const modified = buildExperimentInput(stateFor(scenario, { rules }), scenario);
    expect(modified.policy).toBeDefined();
    expect(CreateExperimentInputSchema.safeParse(modified).success).toBe(true);
  });
});

describe('buildRunInput', () => {
  const live = (overrides: Partial<FormState> = {}) => stateFor(scenarioA, { runMode: 'LIVE_EXPERIMENT', ...overrides });

  it('결정적 테스트에는 변형·정책 확인을 보내지 않는다 (서버가 거부함)', () => {
    // 이전에 라이브에서 고른 값이 남아 있어도 새어 나가면 안 된다
    const body = buildRunInput('exp-1', stateFor(scenarioA, { variantId: 'a-vague', policyReviewConfirmed: true }), scenarioA);

    expect(body).toEqual({ experimentId: 'exp-1', runMode: 'DETERMINISTIC_TEST', locale: 'en' });
    expect(CreateRunInputSchema.safeParse(body).success).toBe(true);
  });

  it('라이브에서 기본 요청이면 variantId를 보내지 않는다', () => {
    const body = buildRunInput('exp-1', live(), scenarioA);
    expect(body).toEqual({ experimentId: 'exp-1', runMode: 'LIVE_EXPERIMENT', locale: 'en' });
  });

  it('검토가 필요한 변형을 확인했으면 policyReviewConfirmed: true를 보낸다', () => {
    const body = buildRunInput('exp-1', live({ variantId: 'a-vague', policyReviewConfirmed: true }), scenarioA);
    expect(body).toMatchObject({ variantId: 'a-vague', policyReviewConfirmed: true });
  });

  it('검토가 필요한 변형을 확인하지 않았으면 false를 보낸다', () => {
    const body = buildRunInput('exp-1', live({ variantId: 'a-vague', policyReviewConfirmed: false }), scenarioA);
    expect(body.policyReviewConfirmed).toBe(false);
  });

  it('검토가 필요 없는 변형에는 체크 상태와 무관하게 false를 보낸다', () => {
    const body = buildRunInput('exp-1', live({ variantId: 'a-explicit-scope', policyReviewConfirmed: true }), scenarioA);
    expect(body).toMatchObject({ variantId: 'a-explicit-scope', policyReviewConfirmed: false });
  });

  it('선택한 요청 언어를 전달한다', () => {
    expect(buildRunInput('exp-1', live({ runLocale: 'ko' }), scenarioA).locale).toBe('ko');
  });

  it('다른 시나리오의 변형 ID는 무시한다 (존재하지 않는 변형을 보내지 않음)', () => {
    const body = buildRunInput('exp-1', live({ variantId: 'b-handle' }), scenarioA);
    expect(body).not.toHaveProperty('variantId');
  });

  it.each(scenarios.flatMap((s) => s.variants.map((v) => [s.id, v.id] as const)))(
    '%s / %s: 라이브 요청이 서버 스키마를 통과한다',
    (scenarioId, variantId) => {
      const scenario = scenarios.find((s) => s.id === scenarioId)!;
      const body = buildRunInput('exp-1', stateFor(scenario, { runMode: 'LIVE_EXPERIMENT', variantId, policyReviewConfirmed: true }), scenario);
      expect(CreateRunInputSchema.safeParse(body).success).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

describe('validateForm', () => {
  const opts = { liveAvailable: true };

  it('유효한 입력은 오류가 없다', () => {
    expect(validateForm(stateFor(scenarioA), scenarioA, opts)).toEqual([]);
  });

  it.each(['', '   ', '\t\n'])('이름이 비어 있으면 nameRequired (%j)', (name) => {
    expect(validateForm(stateFor(scenarioA, { name }), scenarioA, opts)).toEqual([{ field: 'name', code: 'nameRequired' }]);
  });

  it('이름이 한도를 넘으면 nameTooLong, 한도 이하면 통과한다', () => {
    expect(validateForm(stateFor(scenarioA, { name: 'x'.repeat(MAX_NAME_LENGTH + 1) }), scenarioA, opts)).toEqual([
      { field: 'name', code: 'nameTooLong' },
    ]);
    expect(validateForm(stateFor(scenarioA, { name: 'x'.repeat(MAX_NAME_LENGTH) }), scenarioA, opts)).toEqual([]);
  });

  it('공백을 제외한 길이로 이름 한도를 판단한다 (서버가 trim 후 검증함)', () => {
    expect(validateForm(stateFor(scenarioA, { name: `  ${'x'.repeat(MAX_NAME_LENGTH)}  ` }), scenarioA, opts)).toEqual([]);
  });

  it('서버에 키가 없으면 라이브 실행은 liveUnavailable', () => {
    const errors = validateForm(stateFor(scenarioA, { runMode: 'LIVE_EXPERIMENT' }), scenarioA, { liveAvailable: false });
    expect(errors).toEqual([{ field: 'runMode', code: 'liveUnavailable' }]);
  });

  it('키가 없어도 결정적 테스트는 막지 않는다', () => {
    expect(validateForm(stateFor(scenarioA), scenarioA, { liveAvailable: false })).toEqual([]);
  });

  it('검토가 필요한 변형을 확인하지 않으면 policyReviewNotConfirmed', () => {
    const errors = validateForm(stateFor(scenarioA, { runMode: 'LIVE_EXPERIMENT', variantId: 'a-vague' }), scenarioA, opts);
    expect(errors).toEqual([{ field: 'policyReview', code: 'policyReviewNotConfirmed' }]);
  });

  it('확인했으면 통과한다', () => {
    const state = stateFor(scenarioA, { runMode: 'LIVE_EXPERIMENT', variantId: 'a-vague', policyReviewConfirmed: true });
    expect(validateForm(state, scenarioA, opts)).toEqual([]);
  });

  it('결정적 테스트에서는 남아 있는 변형 선택을 검증하지 않는다', () => {
    const state = stateFor(scenarioA, { runMode: 'DETERMINISTIC_TEST', variantId: 'a-vague' });
    expect(validateForm(state, scenarioA, opts)).toEqual([]);
  });

  it('여러 오류를 한꺼번에 반환한다', () => {
    const state = stateFor(scenarioA, { name: '', runMode: 'LIVE_EXPERIMENT', variantId: 'a-vague' });
    expect(validateForm(state, scenarioA, opts).map((e) => e.code)).toEqual(['nameRequired', 'policyReviewNotConfirmed']);
  });
});

// ---------------------------------------------------------------------------
// 제출 순서 (가짜 fetch)
// ---------------------------------------------------------------------------

type Call = { url: string; body: Record<string, unknown> };

/** url별로 정해진 응답을 돌려주는 가짜 fetch. 호출 기록을 남긴다. */
function fakeFetch(responses: Record<string, Array<{ status: number; body: unknown } | 'throw' | 'not-json'>>) {
  const calls: Call[] = [];
  const queue = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, [...v]]));

  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body)) });

    const next = queue[url]?.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    if (next === 'throw') throw new TypeError('network down');
    if (next === 'not-json') return new Response('<html>oops</html>', { status: 502 });
    return new Response(JSON.stringify(next.body), { status: next.status });
  });

  return { impl: impl as unknown as typeof fetch, calls };
}

const OK_EXPERIMENT = { status: 201, body: { experimentId: 'exp-1', policyId: 'p' } };
const OK_RUN = { status: 202, body: { runId: 'run-1', status: 'PENDING' } };
const errorBody = (code: string, issues?: unknown) => ({ error: { code, message: 'm', ...(issues ? { issues } : {}) } });

describe('submitExperiment', () => {
  it('실험을 만든 뒤 그 ID로 run을 시작한다', async () => {
    const { impl, calls } = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': [OK_RUN] });

    const result = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl });

    expect(result).toEqual({ ok: true, experimentId: 'exp-1', runId: 'run-1' });
    expect(calls.map((c) => c.url)).toEqual(['/api/experiments', '/api/runs']);
    expect(calls[1].body).toMatchObject({ experimentId: 'exp-1', runMode: 'DETERMINISTIC_TEST' });
  });

  it('API 경로는 언어 접두사가 없다 (/api는 언어와 무관)', async () => {
    const { impl, calls } = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': [OK_RUN] });
    await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl });
    expect(calls.every((c) => c.url.startsWith('/api/'))).toBe(true);
  });

  it('실험 생성이 거부되면 run을 시작하지 않고 코드와 문제 위치를 돌려준다', async () => {
    const issues = [{ path: 'name', message: 'Required' }];
    const { impl, calls } = fakeFetch({ '/api/experiments': [{ status: 422, body: errorBody('VALIDATION_ERROR', issues) }] });

    const result = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl });

    expect(result).toEqual({ ok: false, code: 'VALIDATION_ERROR', issues });
    expect(calls).toHaveLength(1);
  });

  it('run 시작이 실패하면 만들어진 실험 정보를 함께 돌려준다 (재시도용)', async () => {
    const { impl } = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': [{ status: 503, body: errorBody('LIVE_UNAVAILABLE') }] });

    const result = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LIVE_UNAVAILABLE');
      expect(result.created?.experimentId).toBe('exp-1');
    }
  });

  it('같은 내용으로 재시도하면 실험을 다시 만들지 않는다 (중복 실험 방지)', async () => {
    const first = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': [{ status: 500, body: errorBody('INTERNAL_ERROR') }] });
    const failed = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: first.impl });
    if (failed.ok) throw new Error('expected failure');

    const retry = fakeFetch({ '/api/runs': [OK_RUN] }); // /api/experiments 응답이 없으므로 호출되면 테스트가 실패한다
    const result = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: retry.impl, previous: failed.created });

    expect(result).toEqual({ ok: true, experimentId: 'exp-1', runId: 'run-1' });
    expect(retry.calls.map((c) => c.url)).toEqual(['/api/runs']);
  });

  it('내용을 바꿨으면 이전 실험을 재사용하지 않고 새로 만든다', async () => {
    const first = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': [{ status: 500, body: errorBody('INTERNAL_ERROR') }] });
    const failed = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: first.impl });
    if (failed.ok) throw new Error('expected failure');

    const edited = stateFor(scenarioA, { rules: withRule(scenarioA.defaultRules, 'update_ad', { permission: 'ALLOWED' }) });
    const retry = fakeFetch({
      '/api/experiments': [{ status: 201, body: { experimentId: 'exp-2' } }],
      '/api/runs': [{ status: 202, body: { runId: 'run-2' } }],
    });
    const result = await submitExperiment(edited, scenarioA, { fetchImpl: retry.impl, previous: failed.created });

    expect(result).toEqual({ ok: true, experimentId: 'exp-2', runId: 'run-2' });
    expect(retry.calls.map((c) => c.url)).toEqual(['/api/experiments', '/api/runs']);
  });

  it('네트워크 오류는 network 코드로 돌려준다', async () => {
    const { impl } = fakeFetch({ '/api/experiments': ['throw'] });
    expect(await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl })).toEqual({ ok: false, code: 'network' });
  });

  it('run 요청 중 네트워크가 끊겨도 만들어진 실험 정보를 돌려준다', async () => {
    const { impl } = fakeFetch({ '/api/experiments': [OK_EXPERIMENT], '/api/runs': ['throw'] });
    const result = await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network');
      expect(result.created?.experimentId).toBe('exp-1');
    }
  });

  it('JSON이 아닌 오류 응답(프록시 오류 페이지 등)은 generic으로 처리한다', async () => {
    const { impl } = fakeFetch({ '/api/experiments': ['not-json'] });
    expect(await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl })).toEqual({ ok: false, code: 'generic' });
  });

  it('성공 응답에 ID가 없으면 성공으로 취급하지 않는다', async () => {
    const { impl } = fakeFetch({ '/api/experiments': [{ status: 201, body: {} }] });
    expect(await submitExperiment(stateFor(scenarioA), scenarioA, { fetchImpl: impl })).toEqual({ ok: false, code: 'generic' });
  });
});

describe('submitErrorKey', () => {
  it.each(['network', 'VALIDATION_ERROR', 'POLICY_REVIEW_REQUIRED', 'LIVE_UNAVAILABLE'])('%s는 그대로 매핑된다', (code) => {
    expect(submitErrorKey(code)).toBe(code);
  });

  it.each(['NOT_FOUND', 'INTERNAL_ERROR', 'UNKNOWN_TOOL', 'whatever'])('알 수 없는 코드 %s는 generic이다', (code) => {
    expect(submitErrorKey(code)).toBe('generic');
  });
});
