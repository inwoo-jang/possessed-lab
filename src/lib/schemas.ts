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

export const CreateExperimentInputSchema = z.object({
  name: z.string().min(1).max(200),
  scenarioId: z.string().min(1),
  policy: z.object({
    name: z.string().min(1),
    rules: z.array(PolicyRuleSchema).min(1),
  }),
});

export const CreateRunInputSchema = z.object({
  experimentId: z.string().min(1),
  runMode: z.enum(['DETERMINISTIC_TEST', 'LIVE_EXPERIMENT']),
});

// ---------------------------------------------------------------------------
// 타입 추출
// ---------------------------------------------------------------------------

export type PolicyRuleInput = z.infer<typeof PolicyRuleSchema>;
export type PolicyInput = z.infer<typeof PolicySchema>;
export type ActionEventInput = z.infer<typeof ActionEventSchema>;
export type CreateExperimentInput = z.infer<typeof CreateExperimentInputSchema>;
export type CreateRunInput = z.infer<typeof CreateRunInputSchema>;
