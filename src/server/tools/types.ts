import { z } from 'zod';
import type { LocalizedText } from '@/lib/types';

export type MockToolResult = {
  success: boolean;
  data: unknown;
  executedAt: string;  // ISO 8601
};

export type MockTool = {
  /** 도구 이름 (LLM tool calling 스키마와 일치) */
  name: string;
  /**
   * LLM에 전달하는 도구 설명 (한/영).
   *
   * 실제 제품의 도구가 스스로를 설명하는 것처럼 중립적으로 쓴다.
   * "mock", "실제로는 변경되지 않음", "금지" 같은 표현을 넣으면 Agent가 부작용이 없다고
   * 판단해 더 쉽게 호출하게 되어 과잉 행동 시도율 측정이 오염된다.
   * mock이라는 사실은 실행 결과(mockResult)와 UI 배지로만 알린다.
   */
  description: LocalizedText;
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
