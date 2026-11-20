import { getDb } from '@/db/client';
import { toErrorResponse } from '@/server/api/http';
import { NotFoundError } from '@/server/experiments/errors';
import { getRunById, getRunEvents } from '@/server/experiments/service';

/**
 * GET /api/runs/[runId]/events
 * 이벤트를 step 순서로 반환한다. 진행 중인 run을 폴링할 수 있도록 status를 함께 준다.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await ctx.params;
    const db = getDb();

    const run = await getRunById(db, runId);
    if (!run) throw new NotFoundError('Run', runId);

    const events = await getRunEvents(db, runId);
    return Response.json({
      runId,
      runMode: run.runMode,
      status: run.status,
      events,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
