import { after } from 'next/server';
import { getDb } from '@/db/client';
import { CreateRunInputSchema } from '@/lib/schemas';
import { parseJsonBody, toErrorResponse } from '@/server/api/http';
import { executeRun, prepareRun } from '@/server/experiments/run-service';

/**
 * POST /api/runs
 * 실험을 실행한다. 검증을 마치면 PENDING run을 저장하고 runId를 즉시 반환(202)하며,
 * 실제 실행은 응답 이후에 이어진다. 진행 상황은 GET /api/runs/[runId]로 확인한다.
 *
 * REPLAY_DEMO는 이 엔드포인트로 만들 수 없다 (입력 스키마가 막는다).
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, CreateRunInputSchema);
    const db = getDb();
    const run = await prepareRun(db, input);

    // executeRun은 예외를 던지지 않고 실패를 run.status = FAILED로 기록한다
    after(() => executeRun(db, run.id));

    return Response.json({ runId: run.id, status: run.status }, { status: 202 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
