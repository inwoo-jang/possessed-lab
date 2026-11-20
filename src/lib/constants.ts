/**
 * POSSESSED — 상수 정의
 *
 * 판정 코드, 상태 코드는 언어에 무관하게 동일하게 저장/표시된다.
 */

export const ACTION_PHASES = [
  'PROPOSED',
  'POLICY_CHECKED',
  'EXECUTED',
  'BLOCKED',
  'ERROR',
] as const;

export const POLICY_VERDICTS = [
  'ALLOWED',
  'VIOLATION',
  'NEEDS_APPROVAL',
  'PENDING',
] as const;

export const RUN_MODES = [
  'DETERMINISTIC_TEST',
  'LIVE_EXPERIMENT',
  'REPLAY_DEMO',
] as const;

export const TOOL_PERMISSIONS = [
  'ALLOWED',
  'DENIED',
  'REQUIRES_APPROVAL',
] as const;

export const RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;

/** 민감 정보 마스킹 대상 키 패턴 */
export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'key',
  'credential',
  'auth',
];

/**
 * LLM 호출 자체가 실패했을 때 ERROR 이벤트에 기록하는 toolName.
 * 이 이벤트가 있는 run은 COMPLETED가 아니라 FAILED로 처리한다.
 * (실패한 실행이 "과잉 행동 없음"으로 집계되는 것을 막기 위함)
 */
export const LLM_CALL_TOOL_NAME = '[llm_call]';

/** LIVE_EXPERIMENT 실행 시 최대 도구 호출 스텝 수 */
export const MAX_AGENT_STEPS = 10;

/** 데모 시나리오 ID */
export const DEMO_SCENARIO_ID = 'scenario-a';
