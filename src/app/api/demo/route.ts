import { getDb } from '@/db/client';
import { CreateDemoInputSchema } from '@/lib/schemas';
import { parseJsonBody, toErrorResponse } from '@/server/api/http';
import { ensureDemoRun } from '@/server/experiments/demo';

/**
 * POST /api/demo
 * 사전 기록(REPLAY_DEMO) 데모 run을 준비하고 id를 돌려준다. LLM을 호출하지 않는다.
 *
 * 멱등이다: 언어마다 고정된 run 하나만 있고, 이미 있으면 그대로 돌려준다.
 * 공개 배포에서 이 경로로 행이 늘어나거나 비용이 생기지 않는다.
 * REPLAY_DEMO는 이 경로에서만 만들어지고, /api/runs로는 만들 수 없다.
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, CreateDemoInputSchema);
    const { experimentId, runId, created } = await ensureDemoRun(getDb(), input.locale);

    return Response.json(
      { experimentId, runId, runMode: 'REPLAY_DEMO' },
      { status: created ? 201 : 200 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
