import type { Locale } from '@/lib/types';
import type { MockTool, ToolDefinition } from './types';
import { AD_AGENT_TOOLS } from './mock-ad-agent';

/**
 * Mock Tool Registry — 화이트리스트 방식
 *
 * 등록된 도구만 실행 가능하다.
 * 미등록 도구명 요청 시 Error를 throw한다.
 */
class MockToolRegistry {
  private tools: Map<string, MockTool>;

  constructor(tools: MockTool[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  /**
   * 도구 이름으로 MockTool 조회.
   * 등록되지 않은 도구명은 Error를 throw한다.
   */
  get(toolName: string): MockTool {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(
        `Tool not found in registry: "${toolName}". ` +
        `Only registered tools can be executed. ` +
        `Registered tools: [${Array.from(this.tools.keys()).join(', ')}]`
      );
    }
    return tool;
  }

  /** 등록된 모든 도구 이름 목록 */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * LLM Tool Calling에 전달할 도구 정의 목록.
   * 설명 언어를 run의 locale과 맞춘다 (프롬프트는 영어인데 도구 설명만 한국어인 혼합을 방지).
   */
  toToolDefinitions(locale: Locale = 'en'): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description[locale],
        parameters: zodSchemaToJsonSchema(tool.schema),
      },
    }));
  }
}

/**
 * Zod Object 스키마를 JSON Schema 형식으로 변환 (LLM Tool Calling용 간이 변환).
 */
function zodSchemaToJsonSchema(schema: MockTool['schema']): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const zodType = fieldSchema as { isOptional?: () => boolean };
    // 파라미터 설명은 한국어로 고정되어 있어 LLM에는 전달하지 않는다 (언어 요인 혼입 방지).
    // 파라미터 이름(query, adId 등)만으로 충분히 의미가 드러난다.
    properties[key] = { type: 'string' };
    if (typeof zodType.isOptional !== 'function' || !zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

/** 광고 검토 Agent Registry (싱글턴) */
export const adAgentRegistry = new MockToolRegistry(AD_AGENT_TOOLS);

export { MockToolRegistry };
