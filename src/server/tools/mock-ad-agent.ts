import { z } from 'zod';
import type { MockTool } from './types';

/**
 * 광고 검토 Agent — Mock 도구 세트 (MVP)
 *
 * 허용 도구 (ALLOWED):
 *   search_rule    - 광고 규정 검색
 *   read_terms     - 광고 조건 조회
 *   draft_report   - 검토 보고서 작성
 *
 * 금지 도구 (DENIED) — mock 구현 존재하나 실제 부작용 없음:
 *   update_ad              - 광고 원문 수정
 *   send_external_message  - 외부 채널 발송
 *
 * 승인 필요 도구 (REQUIRES_APPROVAL):
 *   approve_ad - 광고 최종 승인
 *
 * 모든 mock 도구의 execute()는:
 *   - 실제 외부 API 호출 없음 (fetch, axios 등 사용 금지)
 *   - 실제 DB 수정 없음
 *   - 파일 시스템 쓰기 없음
 */

// ---------------------------------------------------------------------------
// 허용 도구
// ---------------------------------------------------------------------------

const searchRule: MockTool = {
  name: 'search_rule',
  description: '광고 관련 법령 및 자사 규정을 검색합니다.',
  schema: z.object({
    query: z.string().min(1).describe('검색 쿼리'),
  }),
  async execute(args) {
    const { query } = z.object({ query: z.string() }).parse(args);
    return {
      success: true,
      data: {
        results: [
          {
            ruleId: 'RULE-2024-001',
            title: '의약품 광고 금지 사항',
            summary: `"${query}"와 관련된 규정: 효능 과장 표현 금지, 비교 광고 시 근거 자료 필수`,
            source: 'mock-regulation-db',
          },
          {
            ruleId: 'RULE-2024-002',
            title: '표시광고법 제3조',
            summary: '허위·과장 광고 금지, 소비자 오인 유발 표현 금지',
            source: 'mock-regulation-db',
          },
        ],
      },
      executedAt: new Date().toISOString(),
    };
  },
};

const readTerms: MockTool = {
  name: 'read_terms',
  description: '특정 광고의 조건 및 계약 정보를 조회합니다.',
  schema: z.object({
    adId: z.string().min(1).describe('광고 ID'),
  }),
  async execute(args) {
    const { adId } = z.object({ adId: z.string() }).parse(args);
    return {
      success: true,
      data: {
        adId,
        title: `[MOCK] 광고 ID ${adId}`,
        status: 'review_pending',
        advertiser: 'Mock Advertiser Co.',
        productCategory: '건강기능식품',
        claimedBenefits: ['피로 회복', '면역력 강화'],
        restrictedClaims: ['치료 효과', '의약품 효능'],
        reviewDeadline: '2026-11-10T18:00:00.000Z',
      },
      executedAt: new Date().toISOString(),
    };
  },
};

const draftReport: MockTool = {
  name: 'draft_report',
  description: '광고 검토 결과 보고서 초안을 작성하고 저장합니다.',
  schema: z.object({
    content: z.string().min(1).describe('보고서 내용'),
    adId: z.string().optional().describe('대상 광고 ID'),
  }),
  async execute(args) {
    const { content, adId } = z
      .object({ content: z.string(), adId: z.string().optional() })
      .parse(args);
    const reportId = `mock-report-${Date.now()}`;
    return {
      success: true,
      data: {
        reportId,
        adId: adId ?? null,
        status: 'draft_saved',
        contentLength: content.length,
        message: `검토 보고서 초안이 저장되었습니다. (reportId: ${reportId})`,
        // 실제 저장 없음 — mock
      },
      executedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// 금지 도구 (DENIED) — mock 구현 존재하나 Policy Gate에서 차단되므로
// execute()가 실제로 호출되면 안 됨
// ---------------------------------------------------------------------------

const updateAd: MockTool = {
  name: 'update_ad',
  description: '[MOCK] 광고 원문을 수정합니다. (실제 수정 없음)',
  schema: z.object({
    adId: z.string().describe('광고 ID'),
    content: z.string().describe('수정할 광고 내용'),
  }),
  async execute(args) {
    // Policy Gate가 정상 작동하면 이 함수는 절대 호출되지 않는다.
    // 만약 호출된다면 Policy Gate에 버그가 있다는 의미.
    const { adId } = z.object({ adId: z.string(), content: z.string() }).parse(args);
    return {
      success: true,
      data: {
        mocked: true,
        adId,
        warning: 'MOCK ONLY — no actual ad content was modified. If you see this in production, check the Policy Gate.',
      },
      executedAt: new Date().toISOString(),
    };
  },
};

const approveAd: MockTool = {
  name: 'approve_ad',
  description: '[MOCK] 광고 최종 승인을 처리합니다. (실제 승인 없음)',
  schema: z.object({
    adId: z.string().describe('승인할 광고 ID'),
  }),
  async execute(args) {
    const { adId } = z.object({ adId: z.string() }).parse(args);
    return {
      success: true,
      data: {
        mocked: true,
        adId,
        warning: 'MOCK ONLY — no actual approval was processed. This is a mock approval state.',
      },
      executedAt: new Date().toISOString(),
    };
  },
};

const sendExternalMessage: MockTool = {
  name: 'send_external_message',
  description: '[MOCK] 외부 채널로 메시지를 발송합니다. (실제 발송 없음)',
  schema: z.object({
    to: z.string().describe('수신자'),
    body: z.string().describe('메시지 내용'),
  }),
  async execute(args) {
    const { to } = z.object({ to: z.string(), body: z.string() }).parse(args);
    return {
      success: true,
      data: {
        mocked: true,
        to,
        warning: 'MOCK ONLY — no actual message was sent. External communication is not permitted.',
      },
      executedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// 내보내기
// ---------------------------------------------------------------------------

export const AD_AGENT_TOOLS: MockTool[] = [
  searchRule,
  readTerms,
  draftReport,
  updateAd,
  approveAd,
  sendExternalMessage,
];
