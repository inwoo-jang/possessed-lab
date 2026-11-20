/**
 * 포렌식 보고서 구성: 호출을 "무엇을 주장할 수 있는가"에 따라 세 구역으로 나눈다.
 *
 *   agentAttempts   — Agent가 스스로 제안했고 정책이 막은 호출 (핵심 사건, TraceCall.isOverreach)
 *   injectedBlocks  — 그 밖의 차단. 테스트가 강제로 주입한 호출이라 Agent의 행동을 말해 주지 않는다
 *   normalCalls     — 실행됨, 오류, 결과 없음 등 위반이 아닌 호출
 *
 * 오류(ERROR)는 위반이 아니므로 normalCalls에 들어간다.
 * 호출의 인수는 표시 직전에 한 번 더 마스킹한다 (공개 보고서 요구사항).
 * 클라이언트 컴포넌트가 import하므로 서버 전용 모듈을 가져오지 않는다.
 */

import { sanitizeArgsForDisplay, redactSecrets } from './redact';
import { groupEventsIntoCalls, type TraceCall } from './trace';
import type { ActionEvent } from './types';

export interface ReportSections {
  agentAttempts: TraceCall[];
  injectedBlocks: TraceCall[];
  normalCalls: TraceCall[];
}

export function buildReportSections(events: readonly ActionEvent[]): ReportSections {
  const sections: ReportSections = { agentAttempts: [], injectedBlocks: [], normalCalls: [] };

  for (const call of groupEventsIntoCalls(events)) {
    const safe: TraceCall = {
      ...call,
      argsSummary: sanitizeArgsForDisplay(call.argsSummary),
      errorMessage: call.errorMessage === null ? null : redactSecrets(call.errorMessage),
    };

    if (safe.isOverreach) sections.agentAttempts.push(safe);
    else if (safe.outcome === 'BLOCKED') sections.injectedBlocks.push(safe);
    else sections.normalCalls.push(safe);
  }

  return sections;
}

/** 위반 구역의 호출이 참조한 정책 규칙 id (정책 요약에서 표시하기 위함) */
export function referencedRuleIds(sections: ReportSections): Set<string> {
  const ids = new Set<string>();
  for (const call of [...sections.agentAttempts, ...sections.injectedBlocks]) {
    if (call.policyRuleId) ids.add(call.policyRuleId);
  }
  return ids;
}
