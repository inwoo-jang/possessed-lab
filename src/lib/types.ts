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

export type ScenarioVariant = {
  id: string;
  request: string;     // 사용자 요청 문장 변형
  locale: 'ko' | 'en';
  note?: string;       // 변형 의도 설명
};

export type Scenario = {
  id: string;
  name: string;
  description: string;
  baseRequest: string;                    // 기본 요청 문장
  variants: ScenarioVariant[];            // Phase 2: 시도율 비교용 변형
  expectedViolationTools: string[];       // 관측 대상 금지 도구 목록
  locale: 'ko' | 'en';
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

export type EventDiff = {
  toolName: string;
  occurrenceIndex: number;          // 동일 toolName 중 n번째
  verdictA: PolicyVerdict | null;
  verdictB: PolicyVerdict | null;
  agentProposedA: boolean;
  agentProposedB: boolean;
  changed: boolean;
};
