/**
 * Create Experiment 폼의 순수 로직 — 상태 → API 요청 변환, 검증, 제출 순서
 *
 * 화면(React)과 분리해 두어 브라우저 없이 테스트할 수 있다.
 * 클라이언트 컴포넌트가 import하므로 서버 전용 모듈(@/server, @/db)을 가져오지 않는다.
 *
 * 서버 규칙과 어긋나지 않도록 지키는 것들:
 *   - DETERMINISTIC_TEST에는 variantId를 보내지 않는다 (서버가 거부한다)
 *   - requiresPolicyReview 변형은 사람이 확인(policyReviewConfirmed)해야 실행된다
 *   - 정책을 바꾸지 않았으면 policy를 보내지 않아 서버의 시나리오 기본 정책을 쓴다
 *   - REPLAY_DEMO는 만들 수 없다 (실행 유형 선택지에 없다)
 */

import type { Locale, LocalizedText, Policy, ToolPermission } from './types';

export type FormRunMode = 'DETERMINISTIC_TEST' | 'LIVE_EXPERIMENT';

/** 정책 편집기가 다루는 규칙 한 줄. 편집하지 않는 필드(설명 등)는 그대로 실어 보낸다. */
export interface PolicyEditorRule {
  toolName: string;
  permission: ToolPermission;
  /** REQUIRES_APPROVAL일 때만 의미가 있는 Mock 승인 부여 여부 (실제 승인 시스템이 아니다) */
  approvalGranted: boolean;
  approvalMeta?: { grantedBy: string; scope: string };
  description?: string;
  userIntentContext?: string;
}

export interface ScenarioOption {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  baseRequest: LocalizedText;
  variants: Array<{
    id: string;
    request: LocalizedText;
    note: LocalizedText;
    requiresPolicyReview: boolean;
  }>;
  defaultRules: PolicyEditorRule[];
}

export interface FormState {
  name: string;
  scenarioId: string;
  runMode: FormRunMode;
  runLocale: Locale;
  /** '' 이면 기본 요청 */
  variantId: string;
  policyReviewConfirmed: boolean;
  rules: PolicyEditorRule[];
}

// ---------------------------------------------------------------------------
// 정책 편집
// ---------------------------------------------------------------------------

const DEFAULT_APPROVAL_META = { grantedBy: 'mock-approver', scope: 'mock' };

export function toPolicyEditorRules(policy: Pick<Policy, 'rules'>): PolicyEditorRule[] {
  return policy.rules.map((rule) => ({
    toolName: rule.toolName,
    permission: rule.permission,
    approvalGranted: rule.mockApprovalState?.granted ?? false,
    ...(rule.mockApprovalState
      ? { approvalMeta: { grantedBy: rule.mockApprovalState.grantedBy, scope: rule.mockApprovalState.scope } }
      : {}),
    ...(rule.description ? { description: rule.description } : {}),
    ...(rule.userIntentContext ? { userIntentContext: rule.userIntentContext } : {}),
  }));
}

/** 기본 규칙과 비교해 이 규칙이 바뀌었는지. Mock 승인 여부는 REQUIRES_APPROVAL일 때만 비교한다. */
export function isRuleModified(defaultRule: PolicyEditorRule | undefined, rule: PolicyEditorRule): boolean {
  if (!defaultRule) return true;
  if (defaultRule.permission !== rule.permission) return true;
  return rule.permission === 'REQUIRES_APPROVAL' && defaultRule.approvalGranted !== rule.approvalGranted;
}

export function isPolicyModified(defaults: readonly PolicyEditorRule[], current: readonly PolicyEditorRule[]): boolean {
  if (defaults.length !== current.length) return true;
  return current.some((rule) => isRuleModified(defaults.find((d) => d.toolName === rule.toolName), rule));
}

// ---------------------------------------------------------------------------
// API 요청 본문
// ---------------------------------------------------------------------------

export interface ExperimentRequestBody {
  name: string;
  scenarioId: string;
  policy?: {
    name: string;
    rules: Array<{
      toolName: string;
      permission: ToolPermission;
      mockApprovalState?: { granted: boolean; grantedBy: string; scope: string };
      description?: string;
      userIntentContext?: string;
    }>;
  };
}

export interface RunRequestBody {
  experimentId: string;
  runMode: FormRunMode;
  locale: Locale;
  variantId?: string;
  policyReviewConfirmed?: boolean;
}

export function getScenario(scenarios: readonly ScenarioOption[], id: string): ScenarioOption | undefined {
  return scenarios.find((s) => s.id === id);
}

export function selectedVariant(scenario: ScenarioOption, state: Pick<FormState, 'variantId'>) {
  return scenario.variants.find((v) => v.id === state.variantId);
}

export function buildExperimentInput(state: FormState, scenario: ScenarioOption): ExperimentRequestBody {
  const body: ExperimentRequestBody = { name: state.name.trim(), scenarioId: scenario.id };

  if (!isPolicyModified(scenario.defaultRules, state.rules)) return body;

  body.policy = {
    name: `${scenario.name.en} (edited)`,
    rules: state.rules.map((rule) => ({
      toolName: rule.toolName,
      permission: rule.permission,
      ...(rule.permission === 'REQUIRES_APPROVAL'
        ? {
            mockApprovalState: {
              granted: rule.approvalGranted,
              grantedBy: rule.approvalMeta?.grantedBy ?? DEFAULT_APPROVAL_META.grantedBy,
              scope: rule.approvalMeta?.scope ?? DEFAULT_APPROVAL_META.scope,
            },
          }
        : {}),
      ...(rule.description ? { description: rule.description } : {}),
      ...(rule.userIntentContext ? { userIntentContext: rule.userIntentContext } : {}),
    })),
  };
  return body;
}

export function buildRunInput(experimentId: string, state: FormState, scenario: ScenarioOption): RunRequestBody {
  const body: RunRequestBody = { experimentId, runMode: state.runMode, locale: state.runLocale };

  // 변형과 정책 확인은 LIVE_EXPERIMENT에서만 의미가 있다.
  // 실행 유형을 바꾸고 남은 값이 서버로 새어 나가면 서버가 거부한다.
  if (state.runMode !== 'LIVE_EXPERIMENT') return body;

  const variant = selectedVariant(scenario, state);
  if (variant) {
    body.variantId = variant.id;
    body.policyReviewConfirmed = variant.requiresPolicyReview && state.policyReviewConfirmed;
  }
  return body;
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

export const MAX_NAME_LENGTH = 200;

export type FormErrorCode = 'nameRequired' | 'nameTooLong' | 'liveUnavailable' | 'policyReviewNotConfirmed';

export interface FormError {
  field: 'name' | 'runMode' | 'policyReview';
  code: FormErrorCode;
}

export function validateForm(
  state: FormState,
  scenario: ScenarioOption,
  options: { liveAvailable: boolean }
): FormError[] {
  const errors: FormError[] = [];
  const name = state.name.trim();

  if (name.length === 0) errors.push({ field: 'name', code: 'nameRequired' });
  else if (name.length > MAX_NAME_LENGTH) errors.push({ field: 'name', code: 'nameTooLong' });

  if (state.runMode === 'LIVE_EXPERIMENT') {
    if (!options.liveAvailable) errors.push({ field: 'runMode', code: 'liveUnavailable' });

    const variant = selectedVariant(scenario, state);
    if (variant?.requiresPolicyReview && !state.policyReviewConfirmed) {
      errors.push({ field: 'policyReview', code: 'policyReviewNotConfirmed' });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 제출: 실험 생성 → run 시작
// ---------------------------------------------------------------------------

export interface CreatedExperiment {
  experimentId: string;
  /** 실험 본문의 직렬화. 같으면 재시도 때 실험을 다시 만들지 않는다. */
  signature: string;
}

export type SubmitResult =
  | { ok: true; experimentId: string; runId: string }
  | {
      ok: false;
      code: string;
      issues?: Array<{ path: string; message: string }>;
      /** 실험은 만들어졌지만 run 시작이 실패한 경우에만 있다 (재시도용) */
      created?: CreatedExperiment;
    };

type PostResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; issues?: Array<{ path: string; message: string }> };

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'network' };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const data = (json ?? {}) as { error?: { code?: unknown; issues?: unknown } } & Record<string, unknown>;

  if (res.ok) {
    return json && typeof json === 'object' ? { ok: true, data } : { ok: false, code: 'generic' };
  }

  const code = typeof data.error?.code === 'string' ? data.error.code : 'generic';
  const issues = Array.isArray(data.error?.issues)
    ? (data.error.issues as Array<{ path: string; message: string }>)
    : undefined;
  return { ok: false, code, ...(issues ? { issues } : {}) };
}

/**
 * 실험을 만들고 run을 시작한다.
 *
 * run 시작이 실패했는데 사용자가 다시 누르면 실험이 중복으로 생기므로,
 * 같은 내용이면 이미 만든 실험을 재사용한다(previous).
 */
export async function submitExperiment(
  state: FormState,
  scenario: ScenarioOption,
  options: { previous?: CreatedExperiment | null; fetchImpl?: typeof fetch } = {}
): Promise<SubmitResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const experimentBody = buildExperimentInput(state, scenario);
  const signature = JSON.stringify(experimentBody);

  let experimentId: string;
  if (options.previous && options.previous.signature === signature) {
    experimentId = options.previous.experimentId;
  } else {
    const created = await postJson(fetchImpl, '/api/experiments', experimentBody);
    if (!created.ok) return { ok: false, code: created.code, ...(created.issues ? { issues: created.issues } : {}) };

    const id = created.data.experimentId;
    if (typeof id !== 'string') return { ok: false, code: 'generic' };
    experimentId = id;
  }

  const run = await postJson(fetchImpl, '/api/runs', buildRunInput(experimentId, state, scenario));
  if (!run.ok) {
    return {
      ok: false,
      code: run.code,
      ...(run.issues ? { issues: run.issues } : {}),
      created: { experimentId, signature },
    };
  }

  const runId = run.data.runId;
  if (typeof runId !== 'string') return { ok: false, code: 'generic', created: { experimentId, signature } };
  return { ok: true, experimentId, runId };
}

/** 서버 오류 코드를 화면 메시지 키로 바꾼다. 모르는 코드는 일반 메시지다. */
export type SubmitErrorKey = 'network' | 'generic' | 'VALIDATION_ERROR' | 'POLICY_REVIEW_REQUIRED' | 'LIVE_UNAVAILABLE';

export function submitErrorKey(code: string): SubmitErrorKey {
  switch (code) {
    case 'network':
    case 'VALIDATION_ERROR':
    case 'POLICY_REVIEW_REQUIRED':
    case 'LIVE_UNAVAILABLE':
      return code;
    default:
      return 'generic';
  }
}
