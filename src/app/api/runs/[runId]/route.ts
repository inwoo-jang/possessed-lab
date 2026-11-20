import { getDb } from '@/db/client';
import { toErrorResponse } from '@/server/api/http';
import { NotFoundError } from '@/server/experiments/errors';
import { getRunById } from '@/server/experiments/service';

/**
 * GET /api/runs/[runId]
 * run 상태, 메타데이터(실행 유형·문구·모델), 실행 시점의 정책 스냅샷을 반환한다.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await ctx.params;
    const run = await getRunById(getDb(), runId);
    if (!run) throw new NotFoundError('Run', runId);

    return Response.json(run);
  } catch (err) {
    return toErrorResponse(err);
  }
}
