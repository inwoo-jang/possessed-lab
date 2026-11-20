import { getDb } from '@/db/client';
import { CompareQuerySchema } from '@/lib/schemas';
import { toErrorResponse } from '@/server/api/http';
import { compareRuns } from '@/server/experiments/compare';

/**
 * GET /api/compare?runA=:id&runB=:id
 *
 * 두 run의 도구 호출을 (toolName, 같은 도구의 n번째 호출)로 맞춰 비교한다.
 * 실행 유형·시나리오가 다르거나 미완료 run이 섞이면 warnings로 알린다.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = CompareQuerySchema.parse({
      runA: params.get('runA') ?? undefined,
      runB: params.get('runB') ?? undefined,
    });

    return Response.json(await compareRuns(getDb(), query.runA, query.runB));
  } catch (err) {
    return toErrorResponse(err);
  }
}
