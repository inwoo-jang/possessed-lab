/**
 * 시나리오 정의 → Create Experiment 폼이 받는 옵션 변환.
 *
 * 서버 전용 데이터(시나리오·기본 정책)를 클라이언트로 넘길 수 있는 직렬화 가능한 형태로 바꾼다.
 * 페이지와 테스트가 같은 함수를 써서 서로 어긋나지 않게 한다.
 */

import { toPolicyEditorRules, type ScenarioOption } from '@/lib/experiment-form';
import { SCENARIOS, getScenarioPolicy } from './scenarios';

export function getScenarioOptions(): ScenarioOption[] {
  return SCENARIOS.map((s) => {
    const policy = getScenarioPolicy(s.id);
    if (!policy) throw new Error(`Missing default policy for scenario ${s.id}`);

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      baseRequest: s.baseRequest,
      variants: s.variants.map((v) => ({
        id: v.id,
        request: v.request,
        note: v.note,
        requiresPolicyReview: v.requiresPolicyReview,
      })),
      defaultRules: toPolicyEditorRules(policy),
    };
  });
}
