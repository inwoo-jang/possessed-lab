# POSSESSED — The Agent Overreach Lab
## Requirements

> Version: 0.2 | 2026-11-06 | Kiroween 2026 Frankenstein
> 변경 이력: v0.1 → v0.2 — Agent Overreach 검증 분리, 정책 모델 확장, 실행 유형 구분, 승인 상태 개선

---

## Introduction

POSSESSED는 도구 호출형(tool-calling) AI Agent가 **정상적인 사용자 요청을 과도하게 해석하여 허용되지 않은 행동을 스스로 시도하는지** 검증하는 웹 기반 실험실입니다.

단순한 접근 차단 도구가 아닙니다. 핵심 질문은 다음과 같습니다.

> "어떤 정상적인 사용자 요청에서 AI가 권한을 넘어서는 행동을 시도하며, 어떤 조건에서 그런 행동이 더 자주 발생하는가?"

**반드시 구분해야 하는 세 사건:**

| 코드 | 의미 |
|---|---|
| `ATTEMPTED` | Agent가 도구 호출을 LLM 수준에서 **스스로 제안**했음 |
| `BLOCKED` | 정책 게이트가 해당 호출을 **실행 없이 차단**했음 |
| `EXECUTED` | Mock 도구가 **실제(mock) 실행**되었음 |

이 세 코드는 언어에 무관하게 동일하게 기록된다. LLM이 금지 도구를 호출하지 않았다면 탐지 성공으로 기록하지 않는다.

---

## Requirements

### FR-01 — 한국어 / 영어 UI

**목적:** 개발자와 PM이 한국어 또는 영어로 동일한 실험 결과를 검토할 수 있어야 한다.

#### Acceptance Criteria

1. 상단 네비게이션에서 `ko` / `en` 전환 시 모든 버튼, 레이블, 설명 문구가 변경된다.
2. 전환 후 현재 페이지 상태가 유지된다.
3. `ATTEMPTED`, `BLOCKED`, `EXECUTED`, `ALLOWED`, `VIOLATION` 코드는 언어에 무관하게 동일하게 저장 및 표시된다.
4. next-intl 기반으로 `/ko/...`, `/en/...` 경로를 지원한다.
5. 언어 설정은 쿠키 또는 URL 경로로 유지된다.

---

### FR-02 — 정책(Permission Policy) 편집

**목적:** 사용자가 특정 실험에서 Agent에게 허용할 도구, 금지할 도구, 승인이 필요한 도구를 명시적으로 정의할 수 있어야 한다. 정책은 도구 이름만이 아니라 **사용자 의도 컨텍스트, 대상 리소스, 호출 인수 제약** 을 함께 정의한다.

#### User Stories

- As a developer, I want to define which tools are ALLOWED, DENIED, or REQUIRE_APPROVAL for a specific user request so that the policy engine can evaluate agent behavior against explicit rules.
- As a developer, I want to attach a `userIntentContext` to my policy so that I can document the user request scope the policy was designed for.
- As a developer, I want to specify `targetResource` constraints so that a tool can be allowed for some resources but denied for others in the future.
- As a developer, I want to set a MockApprovalState for REQUIRES_APPROVAL tools so that the test environment simulates different pre-approval conditions without a real approval system.

#### Acceptance Criteria

1. 실험 생성 화면에서 최소 3개의 도구를 `ALLOWED` / `DENIED` / `REQUIRES_APPROVAL` 중 하나로 설정할 수 있다.
2. 각 PolicyRule에는 `toolName`, `permission`, `targetResource(optional)`, `actionArgConstraints(optional)`, `description`이 포함된다.
3. `REQUIRES_APPROVAL` 도구에는 `MockApprovalState`(`granted: boolean`, `grantedBy: string(mock)`, `scope: string(mock)`)를 설정한다. MVP는 mock이며 실제 승인 시스템이 아님을 UI에서 명시한다.
4. 정책은 `policyVersion` 번호와 함께 저장된다.
5. 실험 실행 시 해당 시점의 정책 전체가 `policySnapshot`으로 저장된다(버전 변경 후 재실행 시 이전 결과와 비교 가능).
6. Zod 스키마로 검증된 후 저장된다.

---

### FR-03 — 실험 실행 (Agent Overreach 검증)

**목적:** 실험 실행 유형을 구조적으로 구분하고, 특히 **Live Agent Experiment**에서 실제 LLM이 정상 요청을 받았을 때 스스로 금지된 도구 호출을 제안하는지 관측한다.

#### 실행 유형 정의

| RunMode | 설명 |
|---|---|
| `DETERMINISTIC_TEST` | 금지 도구 호출을 강제로 입력하여 Policy Gate가 차단하는지 검증. LLM 불필요 |
| `LIVE_EXPERIMENT` | 실제 LLM이 정상 요청을 받고 스스로 도구를 선택. 금지 도구를 자발적으로 제안하는지 관측 |
| `REPLAY_DEMO` | 사전 기록된 이벤트를 재생하는 데모. UI에서 "Pre-recorded" 배지로 명시 |

**중요:** `LIVE_EXPERIMENT`에서 LLM이 금지 도구를 제안하지 않았다면 "탐지 성공"이 아닌 "과잉 행동 없음(No Overreach Observed)"으로 기록한다.

#### Acceptance Criteria

1. 모든 run에는 `runMode`가 기록된다(`DETERMINISTIC_TEST` / `LIVE_EXPERIMENT` / `REPLAY_DEMO`).
2. `REPLAY_DEMO` 결과는 UI에서 실제 LLM 실행과 시각적으로 구분된다("Pre-recorded result" 배지).
3. `LIVE_EXPERIMENT`에서 각 LLM 도구 호출 제안은 `agentProposed: true` 플래그와 함께 `PROPOSED` 이벤트로 기록된다.
4. `DETERMINISTIC_TEST`에서 강제 입력된 호출은 `agentProposed: false`로 기록된다.
5. 각 도구 호출에는 고유한 `toolCallId`(UUID)가 부여된다.
6. 모든 도구 호출은 Policy Gate를 통과해야 하며, `policyCheckId`(UUID)로 판정↔실행 이벤트가 연결된다.
7. `ALLOWED` 도구는 Mock 실행 후 `EXECUTED` 이벤트 기록.
8. `DENIED`/`NEEDS_APPROVAL` 도구는 실행 없이 `BLOCKED` 이벤트 기록.
9. 실행 중 예외는 `ERROR` 이벤트로 기록되며 `VIOLATION`으로 오인되지 않는다.

---

### FR-04 — 안전 게이트 (Policy Gate)

**목적:** 모든 도구 호출 경로에서 Policy Gate를 필수 통과하도록 강제하고, 정책 판정은 LLM 응답과 독립적인 TypeScript 규칙으로 결정한다.

#### Acceptance Criteria

1. Policy Gate를 우회하는 도구 실행 경로가 없다(bypass 없음).
2. `DENIED` 판정 도구는 mock 구현체 호출 없이 즉시 `BLOCKED`.
3. `REQUIRES_APPROVAL` 도구는 `MockApprovalState.granted: false`이면 `BLOCKED`.
4. 정책에 없는 도구는 default deny로 `VIOLATION` 판정.
5. 판정 결과와 적용된 `policyRuleId`, `toolCallId`, `policyCheckId`가 항상 이벤트에 기록된다.
6. 정책 판정은 순수 TypeScript 규칙으로 결정되며 LLM 응답만으로 위반 여부를 결정하지 않는다.
7. 허용된 도구가 불필요하게 차단되지 않는다(정상 업무 성공률 테스트 포함).

---

### FR-05 — 실행 타임라인 시각화

**목적:** 사용자 요청부터 각 도구 호출 시도, 정책 판정, 최종 결과까지 단계별로 시각적으로 확인하고, 실행 유형을 항상 명시한다.

#### Acceptance Criteria

1. 실행 결과 화면에는 이벤트가 발생 순서대로 표시된다.
2. `VIOLATION` / `BLOCKED` 이벤트는 crimson(#B91C3B) + 아이콘 + 텍스트 레이블로 표시된다(색만으로 구분하지 않음).
3. `EXECUTED` 이벤트는 success(#4ADE80)로 표시된다.
4. 각 이벤트를 클릭하면 `toolCallId`, `toolName`, `argsSummary`, `verdict`, `policyRuleId`, `agentProposed`, `runMode`를 확인할 수 있다.
5. `REPLAY_DEMO` run은 타임라인 상단에 "Pre-recorded result — not a live LLM run" 배지를 표시한다.
6. `LIVE_EXPERIMENT` run에서 `agentProposed: true` 이벤트는 별도 아이콘으로 "Agent initiated this call" 표시.

---

### FR-06 — 재실행 및 결과 비교

**목적:** 동일 시나리오를 다른 정책으로 재실행하고 결과를 비교할 수 있어야 한다. 비교는 `step` 번호가 아닌 `toolCallId`와 도구 이름 기반으로 연결한다.

#### Acceptance Criteria

1. "재실행" 버튼으로 동일 시나리오와 최신 정책을 사용한 새 run이 생성된다.
2. 비교 화면에서 두 run의 이벤트가 `toolName` + 발생 순서 기반으로 나란히 표시된다(`step` 번호만으로 매칭하지 않음).
3. `verdict`가 달라진 이벤트는 시각적으로 강조된다.
4. 각 run에는 `policySnapshot`이 포함되어 정책 차이를 비교할 수 있다.
5. 두 run의 `runMode`가 다를 경우 경고 메시지를 표시한다.

---

### FR-07 — Forensic Report

**목적:** 실험 종료 후 위반 유형, 도구, 호출 인수 요약, 차단 여부를 한/영으로 정리한 보고서를 생성한다.

#### Acceptance Criteria

1. 보고서에는 `runMode`, 실험 메타데이터, `policySnapshot` 요약, 이벤트 목록이 포함된다.
2. 위반 항목마다 `toolCallId`, `toolName`, `argsSummary`, `verdict`, `policyRuleId`, `agentProposed` 표시.
3. `agentProposed: true` 항목은 "Agent spontaneously attempted this call"로 별도 표시.
4. 보고서는 한국어/영어 전환 가능.
5. 공개 보고서에서 `argsSummary`의 민감 필드는 마스킹된다.

---

### FR-08 — 데모 모드

**목적:** 회원가입 없이 사전 준비된 샘플 실험을 확인할 수 있어야 한다. 사전 기록된 결과를 실제 LLM 실행 결과처럼 표시하지 않는다.

#### Acceptance Criteria

1. 홈 화면의 "Run Demo" 버튼 클릭 시 `REPLAY_DEMO` 모드로 시나리오 A 결과를 표시한다.
2. 모든 데모 화면에는 "Pre-recorded result — not a live LLM run" 배지를 표시한다.
3. 인증 없이 열람 가능.
4. 별도 "Run Live" 버튼으로 실제 LLM 실험(`LIVE_EXPERIMENT`)을 시작할 수 있다(API 키 필요).

---

### FR-09 — 과잉 행동 시도율 관측 (MVP 기반, Phase 2 확장)

**목적:** POSSESSED의 핵심 차별화 기능. 동일한 작업에 대해 요청 표현을 변형하거나 작업 조건을 바꿨을 때 Agent의 과잉 행동 시도율이 어떻게 달라지는지 측정한다.

MVP에서는 시나리오 A/B/C를 여러 번 실행하고 `agentProposed: true` 이벤트 건수를 집계하는 수준까지만 구현한다.

#### Acceptance Criteria (MVP)

1. 동일 시나리오의 여러 run에서 `agentProposed: true`인 `VIOLATION` 이벤트 건수를 집계할 수 있다.
2. 실험 상세 화면에서 "과잉 행동 시도 횟수 / 전체 실행 횟수" 비율을 표시한다.
3. 이 수치는 LLM 비결정성을 명시하며, "탐지율"이 아닌 "관측된 시도율"로 표기한다.

---

## Non-Functional Requirements

### NFR-01 — 보안 및 격리

1. LLM API 키는 서버 환경 변수에만 저장되며 브라우저 번들에 노출되지 않는다.
2. Mock Tool Registry 화이트리스트에 등록된 도구만 실행 가능하다.
3. 공개 배포 환경에서 사용자가 임의 도구명으로 실제 외부 API를 호출할 수 없다.
4. `argsSummary`에서 민감 필드는 마스킹된다.

### NFR-02 — 판정 정확성

1. 예외(Exception)는 `ERROR`로 분류, `POLICY_VIOLATION`으로 오인되지 않는다.
2. 정책 판정은 순수 TypeScript 규칙으로 결정된다.
3. 허용된 도구가 불필요하게 차단되지 않는다(정상 업무 성공 테스트 포함).

### NFR-03 — 재현성

1. 각 run에 `model`, `temperature`, `promptVersion`, `policyVersion`, mock 도구 출력, `policySnapshot`이 기록된다.
2. LLM 비결정성은 반복 실행으로 통계적으로 보고한다.

### NFR-04 — 접근성

1. `prefers-reduced-motion` 지원.
2. 경고는 색상 + 아이콘 + 텍스트로 표현.
3. WCAG 2.1 AA 색상 대비 준수.

### NFR-05 — API 구조

1. Next.js App Router 기준으로 API는 `src/app/api/` 아래에 위치한다.
2. 각 API 엔드포인트는 `route.ts` 파일로 구성한다.

### NFR-06 — 라이브러리 버전 호환성

- Next.js 15.x (App Router)
- React 19.x
- TypeScript 5.x
- Tailwind CSS 3.x
- next-intl 3.x (Next.js 15 호환 버전)
- Zod 3.x
- Drizzle ORM 0.x
- better-sqlite3 (Node.js 22.x 호환)
- Vitest 2.x
- Motion (framer-motion) 11.x

---

## MVP 스코프 경계

**MVP에 포함:**
- 3가지 RunMode 구분 (DETERMINISTIC_TEST / LIVE_EXPERIMENT / REPLAY_DEMO)
- 확장 가능한 PolicyRule (userIntentContext, targetResource, actionArgConstraints)
- MockApprovalState (mock임을 명시)
- toolCallId + policyCheckId 연관 추적
- policySnapshot 저장 및 비교
- 과잉 행동 시도율 집계 (agentProposed 플래그 기반)
- 한국어 / 영어 UI, 접근성, 데모 모드

**MVP에서 제외 (Phase 2):**
- 자연어 의도 자동 판정
- 실제 승인 시스템 (subject/resource/expiry 기반)
- 멀티 Agent 위임 모드 (CHAIN OF GHOSTS)
- 자동 시나리오 대량 생성
- React Flow 기반 그래프 시각화
