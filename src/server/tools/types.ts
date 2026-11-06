import { z } from 'zod';

export type MockToolResult = {
  success: boolean;
  data: unknown;
  executedAt: string;  // ISO 8601
};

export type MockTool = {
  /** 도구 이름 (LLM tool calling 스키마와 일치) */
  name: string;
  /** LLM에 전달하는 도구 설명 */
  description: string;
  /** 인수 검증 Zod 스키마 */
  schema: z.ZodObject<z.ZodRawShape>;
  /**
   * Mock 실행 함수.
   *
   * 주의: 실제 외부 API 호출 금지. 실제 DB 수정 금지.
   * 모든 mock 도구는 부작용 없는 가짜 응답만 반환한다.
   */
  execute: (args: unknown) => Promise<MockToolResult>;
};

/** LLM Tool Calling에 전달할 도구 정의 (OpenAI format) */
export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
