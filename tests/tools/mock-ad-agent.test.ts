import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AD_AGENT_TOOLS } from '@/server/tools/mock-ad-agent';
import { adAgentRegistry } from '@/server/tools/registry';

describe('Mock Tool Registry — 화이트리스트 검증', () => {
  it('미등록 도구명 조회 시 Error를 throw한다', () => {
    expect(() => adAgentRegistry.get('nonexistent_tool')).toThrow('Tool not found in registry');
  });

  it('등록된 6개 도구를 모두 조회할 수 있다', () => {
    const toolNames = adAgentRegistry.listNames();
    expect(toolNames).toContain('search_rule');
    expect(toolNames).toContain('read_terms');
    expect(toolNames).toContain('draft_report');
    expect(toolNames).toContain('update_ad');
    expect(toolNames).toContain('approve_ad');
    expect(toolNames).toContain('send_external_message');
    expect(toolNames).toHaveLength(6);
  });
});

describe('Mock Tool 격리 — 외부 네트워크 호출 없음', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    // globalThis.fetch를 spy하여 실제 네트워크 호출 감지
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch called — external network call detected in mock tool!');
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('update_ad 실행 시 외부 fetch 호출이 없다', async () => {
    const tool = adAgentRegistry.get('update_ad');
    await tool.execute({ adId: 'ad-001', content: 'test content' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('approve_ad 실행 시 외부 fetch 호출이 없다', async () => {
    const tool = adAgentRegistry.get('approve_ad');
    await tool.execute({ adId: 'ad-001' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('send_external_message 실행 시 외부 fetch 호출이 없다', async () => {
    const tool = adAgentRegistry.get('send_external_message');
    await tool.execute({ to: 'test@example.com', body: 'hello' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('search_rule 실행 시 외부 fetch 호출이 없다', async () => {
    const tool = adAgentRegistry.get('search_rule');
    await tool.execute({ query: '허위 광고 금지' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Mock Tool 반환 값 검증', () => {
  it('search_rule은 results 배열을 반환한다', async () => {
    const tool = adAgentRegistry.get('search_rule');
    const result = await tool.execute({ query: '테스트' });
    expect(result.success).toBe(true);
    expect((result.data as { results: unknown[] }).results).toBeInstanceOf(Array);
  });

  it('draft_report는 reportId를 포함한 결과를 반환한다', async () => {
    const tool = adAgentRegistry.get('draft_report');
    const result = await tool.execute({ content: '검토 결과: 문제 없음', adId: 'ad-001' });
    expect(result.success).toBe(true);
    expect((result.data as { reportId: string }).reportId).toMatch(/^mock-report-/);
  });

  it('update_ad mock 결과에는 mocked: true가 포함된다', async () => {
    const tool = adAgentRegistry.get('update_ad');
    const result = await tool.execute({ adId: 'ad-001', content: 'modified' });
    expect(result.success).toBe(true);
    expect((result.data as { mocked: boolean }).mocked).toBe(true);
  });

  it('approve_ad mock 결과에는 mocked: true가 포함된다', async () => {
    const tool = adAgentRegistry.get('approve_ad');
    const result = await tool.execute({ adId: 'ad-001' });
    expect((result.data as { mocked: boolean }).mocked).toBe(true);
  });

  it('send_external_message mock 결과에는 mocked: true가 포함된다', async () => {
    const tool = adAgentRegistry.get('send_external_message');
    const result = await tool.execute({ to: 'x@example.com', body: 'hi' });
    expect((result.data as { mocked: boolean }).mocked).toBe(true);
  });

  it('모든 mock 도구의 반환 값에는 executedAt(ISO 8601)이 포함된다', async () => {
    for (const tool of AD_AGENT_TOOLS) {
      const args = getValidArgs(tool.name);
      const result = await tool.execute(args);
      expect(result.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

/** 각 도구의 유효한 테스트 인수 */
function getValidArgs(toolName: string): Record<string, string> {
  switch (toolName) {
    case 'search_rule': return { query: 'test' };
    case 'read_terms': return { adId: 'ad-001' };
    case 'draft_report': return { content: 'test report' };
    case 'update_ad': return { adId: 'ad-001', content: 'new content' };
    case 'approve_ad': return { adId: 'ad-001' };
    case 'send_external_message': return { to: 'test@test.com', body: 'hello' };
    default: return {};
  }
}
