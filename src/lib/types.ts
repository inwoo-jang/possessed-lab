/**
 * POSSESSED — 핵심 도메인 타입
 *
 * 절대 혼동하지 않는 세 사건:
 *   ATTEMPTED: Agent가 도구 호출을 스스로 제안
 *   BLOCKED:   Policy Gate가 실행 없이 차단
 *   EXECUTED:  Mock 도구가 실제(mock) 실행됨
 */

// ---------------------------------------------------------------------------
// RunMode
// ---------------------------------------------------------------------------

/**
 * 실험 실행 유형.
 *
 * DETERMINISTIC_TEST:
 *   강제 주입으로 Policy Gate 정확성을 검증. LLM 불필요. agentProposed = false.
 *
 * LIVE_EXPERIMENT:
 *   실제 LLM이 정상 요청을 받고 도구를 선택. Agent Overreach 관측. agentProposed = true.
 *
 * REPLAY_DEMO:
 *   사전 기록된 이벤트 재생. UI에서 반드시 "Pre-recorded" 배지로 구분.
 */
export type RunMode =
  | 'DETERMINISTIC_TEST'
  | 'LIVE_EXPERIMENT'
  | 'REPLAY_DEMO';

// ---------------------------------------------------------------------------
// ActionEvent — 원자적 사건 기록 단위
// ---------------------------------------------------------------------------

/**
 * 도구 호출 처리 단계 (순서 보장).
 *
 * 하나의 도구 호출 시도는 최대 3개의 ActionEvent를 생성한다:
 *   1. PROPOSED       - 제안 기록
 *   2. POLICY_CHECKED - 판정 기록 (같은 toolCallId)
 *   3. EXECUTED 또는 BLOCKED - 결과 기록 (같은 toolCallId)
 */
export type ActionPhase =
  | 'PROPOSED'        // Agent(LLM 또는 주입)가 도구 호출을 제안
  | 'POLICY_CHECKED'  // Policy Gate 판정 완료
  | 'EXECUTED'        // Mock 도구 실행 성공 (이전의 MOCK_EXECUTED)
  | 'BLOCKED'         // 실행 없이 차단
  | 'ERROR';          // 예외 발생 — VIOLATION과 절대 혼용 금지

/**
 * Policy Gate 판정 결과.
 *
 * ALLOWED:          허용 → EXECUTED로 진행
 * VIOLATION:        명시적 DENIED 규칙 위반 → BLOCKED
 * NEEDS_APPROVAL:   승인 조건 미충족 → BLOCKED
 * PENDING:          POLICY_CHECKED 이전
 */
export type PolicyVerdict =
  | 'ALLOWED'
  | 'VIOLATION'
  | 'NEEDS_APPROVAL'
  | 'PENDING';

export type ActionEvent = {
  id: string;                            // UUID
  experimentId: string;
  runId: string;
  toolCallId: string;                    // 도구 호출 1건의 고유 ID (UUID)
  policyCheckId: string | null;          // POLICY_CHECKED ↔ BLOCKED/EXECUTED 연결
  step: number;                          // 발생 순서 (0-indexed)
  toolName: string;
  argsSummary: Record<string, unknown>;  // 민감 필드 마스킹 후 저장
  phase: ActionPhase;
  verdict: PolicyVerdict | null;         // POLICY_CHECKED 이후에만 존재
  policyRuleId: string | null;           // 적용된 PolicyRule ID
  agentProposed: boolean;                // true = LLM이 스스로 제안, false = 강제 주입
  runMode: RunMode;
  mockResult: unknown | null;            // EXECUTED 시 mock 결과
  errorMessage: string | null;          // ERROR 시
  timestamp: string;                    // ISO 8601
};

// ---------------------------------------------------------------------------
// Policy — 명시적 허가 정책
// ---------------------------------------------------------------------------

export type ToolPermission = 'ALLOWED' | 'DENIED' | 'REQUIRES_APPROVAL';

/**
 * Mock 승인 상태.
 *
 * 주의: 현재 버전은 테스트용 Mock이며 실제 승인 시스템이 아님.
 * Phase 2에서 subject, resource, expiresAt으로 확장 예정.
 */
export type MockApprovalState = {
  granted: boolean;
  grantedBy: string;   // mock 식별자 (예: "test-approver-1")
  scope: string;       // mock 범위 설명 (예: "ad-review-only")
  // Phase 2: expiresAt?: string; subject?: string; resource?: string;
};

export type PolicyRule = {
  id: string;
  toolName: string;
  permission: ToolPermission;
  mockApprovalState?: MockApprovalState;          // REQUIRES_APPROVAL 시 필수
  targetResource?: string;                         // 대상 리소스 식별자 (MVP: optional)
  actionArgConstraints?: Record<string, unknown>;  // 인수 제약 (MVP: 기록 전용)
  userIntentContext?: string;                      // 이 규칙이 적용되는 사용자 의도 설명
  description?: string;                           // 사람이 읽는 판정 근거
};

export type Policy = {
  id: string;
  name: string;
  version: number;
  rules: PolicyRule[];
  createdAt: string;
};

/**
 * 실험 실행 시 저장되는 정책 스냅샷.
 * 정책이 변경된 후에도 이전 실행의 판정 근거를 재현할 수 있음.
 */
export type PolicySnapshot = Policy & {
  snapshotAt: string;
};

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type Locale = 'ko' | 'en';

/** 한/영 문구 쌍. 시나리오 문구는 두 언어를 항상 함께 가진다. */
export type LocalizedText = Record<Locale, string>;

/** DETERMINISTIC_TEST에서 강제 주입할 도구 호출 (ForcedToolCall과 구조 동일) */
export type ScenarioToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

/**
 * 기본 요청의 표현 변형.
 *
 * 변형은 "표현 조건에 따라 과잉 행동 시도율이 달라지는가"를 측정하기 위한 것이다.
 * 표현이 모호해져 사용자 의도 자체가 달라질 수 있는 변형은 requiresPolicyReview: true로
 * 표시한다. 이런 변형은 기본 정책으로 자동 판정하지 않고, 사람이 허용 범위를 다시 확정해야 한다.
 */
export type ScenarioVariant = {
  id: string;
  request: LocalizedText;
  note: LocalizedText;             // 변형 의도 설명
  requiresPolicyReview: boolean;   // true = 의미가 달라질 수 있어 정책 재확정 필요
};

export type Scenario = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  baseRequest: LocalizedText;
  variants: ScenarioVariant[];
  /** 이 시나리오에서 Agent의 과잉 행동을 관측하는 대상 도구 */
  expectedViolationTools: string[];
  /**
   * DETERMINISTIC_TEST용 강제 호출 시퀀스.
   * 허용 도구와 관측 대상(금지) 도구를 섞어 두어, 차단이 정상 업무까지 막지 않는지도 검증한다.
   */
  deterministicCalls: ScenarioToolCall[];
};

// ---------------------------------------------------------------------------
// Experiment & Run
// ---------------------------------------------------------------------------

export type Experiment = {
  id: string;
  name: string;
  scenarioId: string;
  policyId: string;
  createdAt: string;
};

export type RunMetadata = {
  model: string | null;         // DETERMINISTIC_TEST에서는 null
  temperature: number | null;
  promptVersion: string;
  policyVersion: number;
  /**
   * 어떤 문구로 실험했는지 기록한다. 표현 조건별 시도율 비교와 재현성의 전제다.
   * DETERMINISTIC_TEST는 사용자 요청 문장을 쓰지 않으므로 variantId/userRequest가 null이다.
   */
  locale: Locale;
  variantId: string | null;
  userRequest: string | null;
  /** requiresPolicyReview 변형을 사람이 확인하고 실행했는지 */
  policyReviewConfirmed: boolean;
  /**
   * Agent가 마지막으로 한 말 (LIVE_EXPERIMENT가 최종 답변으로 끝났을 때만).
   * 실행이 끝난 뒤에 기록되므로 처음에는 없다. 비밀 값은 마스킹되고 길이가 제한된다.
   */
  finalAnswer?: string | null;
};

export type Run = {
  id: string;
  experimentId: string;
  runMode: RunMode;
  metadata: RunMetadata;
  policySnapshot: PolicySnapshot;  // 실행 시점 정책 전체 스냅샷
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
};

// ---------------------------------------------------------------------------
// Run Compare
// ---------------------------------------------------------------------------

/**
 * 도구 호출 1건의 최종 결과.
 * INCOMPLETE는 제안만 기록되고 결과 이벤트가 없는 경우(실행 중단 등)다.
 */
export type CallOutcome = 'EXECUTED' | 'BLOCKED' | 'ERROR' | 'INCOMPLETE';

/**
 * 두 run의 도구 호출 1건 비교.
 *
 * 매칭 기준은 step 번호가 아니라 (toolName, occurrenceIndex)다.
 * LLM은 호출 순서와 횟수가 달라질 수 있어 step으로 맞추면 엉뚱한 호출끼리 비교된다.
 * 한쪽에만 있는 호출은 다른 쪽 값이 null이다.
 * (agentProposed를 false로 채우면 "강제 주입"으로 오해되므로 null을 쓴다)
 */
export type EventDiff = {
  toolName: string;
  occurrenceIndex: number;          // 동일 toolName 중 n번째 (0부터)
  verdictA: PolicyVerdict | null;
  verdictB: PolicyVerdict | null;
  outcomeA: CallOutcome | null;
  outcomeB: CallOutcome | null;
  agentProposedA: boolean | null;
  agentProposedB: boolean | null;
  /**
   * 판정 또는 결과가 다르거나, 한쪽에만 있는 호출이면 true.
   * agentProposed만 다른 경우(예: 강제 주입 vs LLM)는 정책 결과의 변화가 아니므로 true가 아니다.
   */
  changed: boolean;
};

export type ComparisonWarningCode =
  | 'RUN_MODE_MISMATCH'
  | 'SCENARIO_MISMATCH'
  | 'RUN_NOT_COMPLETED';

export type ComparisonWarning = {
  code: ComparisonWarningCode;
  message: string;
};

/** 정책 스냅샷 간 규칙 차이. 규칙이 한쪽에만 있으면 다른 쪽은 null. */
export type PolicyRuleDiff = {
  toolName: string;
  a: { permission: ToolPermission; approvalGranted: boolean | null } | null;
  b: { permission: ToolPermission; approvalGranted: boolean | null } | null;
};

export type RunComparisonSide = {
  id: string;
  experimentId: string;
  scenarioId: string | null;
  runMode: RunMode;
  status: Run['status'];
  metadata: RunMetadata;
  policySnapshotAt: string;
  stats: {
    overreachAttempts: number;
    executedCount: number;
    blockedCount: number;
    errorCount: number;
    toolCallCount: number;
  };
};

export type RunComparison = {
  runA: RunComparisonSide;
  runB: RunComparisonSide;
  warnings: ComparisonWarning[];
  diff: EventDiff[];
  changedCount: number;
  policyDiff: PolicyRuleDiff[];
};
