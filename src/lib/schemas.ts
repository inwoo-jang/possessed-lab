import { z } from 'zod';
import {
  ACTION_PHASES,
  POLICY_VERDICTS,
  RUN_MODES,
  TOOL_PERMISSIONS,
  RUN_STATUSES,
} from './constants';

// ---------------------------------------------------------------------------
// Policy 스키마
// ---------------------------------------------------------------------------

export const MockApprovalStateSchema = z.object({
  granted: z.boolean(),
  grantedBy: z.string().min(1),
  scope: z.string().min(1),
});

export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  permission: z.enum(TOOL_PERMISSIONS),
  mockApprovalState: MockApprovalStateSchema.optional(),
  targetResource: z.string().optional(),
  actionArgConstraints: z.record(z.unknown()).optional(),
  userIntentContext: z.string().optional(),
  description: z.string().optional(),
});

export const PolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  rules: z.array(PolicyRuleSchema).min(1),
  createdAt: z.string().datetime(),
});

export const PolicySnapshotSchema = PolicySchema.extend({
  snapshotAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// ActionEvent 스키마
// ---------------------------------------------------------------------------

export const ActionEventSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().uuid(),
  policyCheckId: z.string().uuid().nullable(),
  step: z.number().int().nonnegative(),
  toolName: z.string().min(1),
  argsSummary: z.record(z.unknown()),
  phase: z.enum(ACTION_PHASES),
  verdict: z.enum(POLICY_VERDICTS).nullable(),
  policyRuleId: z.string().nullable(),
  agentProposed: z.boolean(),
  runMode: z.enum(RUN_MODES),
  mockResult: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  timestamp: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Run 스키마
// ---------------------------------------------------------------------------

export const RunMetadataSchema = z.object({
  model: z.string().nullable(),
  temperature: z.number().nullable(),
  promptVersion: z.string(),
  policyVersion: z.number().int().positive(),
  locale: z.enum(['ko', 'en']),
  variantId: z.string().nullable(),
  userRequest: z.string().nullable(),
  policyReviewConfirmed: z.boolean(),
  finalAnswer: z.string().nullable().optional(),
});

export const RunSchema = z.object({
  id: z.string().min(1),
  experimentId: z.string().min(1),
  runMode: z.enum(RUN_MODES),
  metadata: RunMetadataSchema,
  policySnapshot: PolicySnapshotSchema,
  status: z.enum(RUN_STATUSES),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Experiment 스키마
// ---------------------------------------------------------------------------

export const ExperimentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scenarioId: z.string().min(1),
  policyId: z.string().min(1),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// API 입력 스키마
// ---------------------------------------------------------------------------

/**
 * 클라이언트가 보내는 정책 규칙. id는 서버가 생성한다.
 * 문자열 길이와 개수에 상한을 둔다 (공개 배포 환경의 남용 방지).
 */
export const PolicyRuleInputSchema = z
  .object({
    toolName: z.string().min(1).max(100),
    permission: z.enum(TOOL_PERMISSIONS),
    mockApprovalState: MockApprovalStateSchema.optional(),
    targetResource: z.string().max(200).optional(),
    actionArgConstraints: z.record(z.unknown()).optional(),
    userIntentContext: z.string().max(500).optional(),
    description: z.string().max(500).optional(),
  })
  .refine(
    (rule) => rule.permission !== 'REQUIRES_APPROVAL' || rule.mockApprovalState !== undefined,
    {
      message: 'REQUIRES_APPROVAL rules must define mockApprovalState',
      path: ['mockApprovalState'],
    }
  );

export const CreateExperimentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scenarioId: z.string().min(1).max(100),
  /** 생략하면 시나리오의 기본 정책을 사용한다 */
  policy: z
    .object({
      name: z.string().trim().min(1).max(200),
      rules: z
        .array(PolicyRuleInputSchema)
        .min(1)
        .max(20)
        .refine((rules) => new Set(rules.map((r) => r.toolName)).size === rules.length, {
          message: 'Each tool may appear in at most one rule',
        }),
    })
    .optional(),
});

/** POST /api/demo 입력. 본문이 비어 있어도 되도록 locale은 생략할 수 있다. */
export const CreateDemoInputSchema = z.object({
  locale: z.enum(['ko', 'en']).default('en'),
});

export const CompareQuerySchema = z.object({
  runA: z.string().min(1).max(100),
  runB: z.string().min(1).max(100),
});

/**
 * REPLAY_DEMO는 이 입력으로 만들 수 없다.
 * 사전 기록 결과는 /api/demo에서만 생성되어, 실제 실행으로 위장될 수 없다.
 */
export const CreateRunInputSchema = z.object({
  experimentId: z.string().min(1).max(100),
  runMode: z.enum(['DETERMINISTIC_TEST', 'LIVE_EXPERIMENT']),
  locale: z.enum(['ko', 'en']).default('en'),
  /** LIVE_EXPERIMENT에서만 의미가 있다 */
  variantId: z.string().min(1).max(100).optional(),
  /** requiresPolicyReview 변형을 사람이 확인했음을 명시해야 실행된다 */
  policyReviewConfirmed: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// 타입 추출
// ---------------------------------------------------------------------------

export type PolicyRuleInput = z.infer<typeof PolicyRuleSchema>;
export type PolicyInput = z.infer<typeof PolicySchema>;
export type ActionEventInput = z.infer<typeof ActionEventSchema>;
export type CreateExperimentInput = z.infer<typeof CreateExperimentInputSchema>;
export type CreateRunInput = z.infer<typeof CreateRunInputSchema>;
export type PolicyRuleClientInput = z.infer<typeof PolicyRuleInputSchema>;
