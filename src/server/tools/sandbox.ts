import type { MockTool, MockToolResult } from './types';

/**
 * Mock Tool 격리 실행.
 *
 * 도구 실행을 try/catch로 감싸서 예외가 상위로 전파되지 않도록 한다.
 * 예외 발생 시 ERROR 정보가 포함된 실패 결과를 반환한다.
 */
export async function executeInSandbox(
  tool: MockTool,
  args: unknown
): Promise<SandboxResult> {
  try {
    const result = await tool.execute(args);
    return { ok: true, result, errorMessage: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      result: null,
      errorMessage: message,
    };
  }
}

export type SandboxResult =
  | { ok: true; result: MockToolResult; errorMessage: null }
  | { ok: false; result: null; errorMessage: string };
