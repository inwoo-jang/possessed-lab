import { getDb } from '@/db/client';
import { CreateExperimentInputSchema } from '@/lib/schemas';
import { parseJsonBody, toErrorResponse } from '@/server/api/http';
import { createExperiment } from '@/server/experiments/run-service';

/**
 * POST /api/experiments
 * 실험(시나리오 + 정책)을 만든다. policy를 생략하면 시나리오 기본 정책을 사용한다.
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, CreateExperimentInputSchema);
    const { experiment, policy } = await createExperiment(getDb(), input);

    return Response.json(
      { experimentId: experiment.id, policyId: policy.id, experiment },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
