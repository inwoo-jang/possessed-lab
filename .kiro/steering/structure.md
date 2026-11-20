---
inclusion: always
---

# POSSESSED — Directory Structure Steering

## 전체 디렉터리 구조

```
possessed-lab/
├─ .kiro/
│  ├─ steering/          # 항상 포함되는 프로젝트 가이드라인
│  └─ specs/possessed/   # 요구사항, 설계, 작업 목록
├─ src/
│  ├─ app/
│  │  ├─ api/                           # Next.js App Router API (route.ts)
│  │  │  ├─ experiments/route.ts
│  │  │  ├─ runs/route.ts
│  │  │  ├─ runs/[runId]/route.ts
│  │  │  ├─ runs/[runId]/events/route.ts
│  │  │  ├─ compare/route.ts
│  │  │  └─ demo/route.ts
│  │  └─ [locale]/                      # next-intl locale 세그먼트
│  │     ├─ layout.tsx
│  │     ├─ page.tsx                    # Dashboard
│  │     ├─ experiments/new/page.tsx    # Create Experiment
│  │     ├─ experiments/[id]/
│  │     │  ├─ page.tsx
│  │     │  └─ runs/[runId]/
│  │     │     ├─ trace/page.tsx        # Live Trace
│  │     │     └─ report/page.tsx       # Forensic Report
│  │     ├─ compare/page.tsx
│  │     └─ demo/page.tsx
│  ├─ components/
│  │  ├─ ui/                           # shadcn/ui 래퍼
│  │  ├─ timeline/                     # 이벤트 타임라인
│  │  ├─ policy-editor/                # 정책 편집 UI
│  │  ├─ forensic-report/              # 보고서 컴포넌트
│  │  ├─ compare/                      # CompareView (두 run 비교, 표시 전용)
│  │  └─ demo/                         # DemoActions (저장된 데모 run 열기)
│  ├─ server/                          # 서버 전용 (클라이언트에서 직접 import 금지)
│  │  ├─ agent/
│  │  │  ├─ runner.ts                  # Experiment Runner (메인 루프)
│  │  │  ├─ deterministic-injector.ts  # DETERMINISTIC_TEST용 강제 주입
│  │  │  └─ llm-client.ts             # LLM API 어댑터
│  │  ├─ policy/
│  │  │  ├─ gate.ts                    # Policy Gate (필수 통과)
│  │  │  ├─ evaluator.ts              # 규칙 평가 로직
│  │  │  └─ types.ts
│  │  ├─ tools/
│  │  │  ├─ registry.ts               # Mock Tool Registry (화이트리스트)
│  │  │  ├─ mock-ad-agent.ts          # 광고 검토 mock 도구 6개
│  │  │  └─ sandbox.ts                # 격리 실행
│  │  └─ experiments/
│  │     ├─ service.ts
│  │     ├─ scenarios.ts
│  │     ├─ demo.ts                    # REPLAY_DEMO 시드 → run·이벤트 (멱등 저장)
│  │     ├─ demo-seed.json             # 직접 쓴 사전 기록 시퀀스 (실제 모델 기록이 아님)
│  │     └─ run-list.ts                # 비교 화면의 run 선택 목록
│  ├─ db/
│  │  ├─ schema.ts                    # Drizzle ORM 스키마
│  │  ├─ client.ts                    # DB 연결
│  │  └─ migrations/
│  ├─ i18n/
│  │  ├─ routing.ts                   # 지원 언어(en, ko)와 URL 규칙
│  │  ├─ request.ts                   # next/root-params로 locale·메시지 결정
│  │  └─ navigation.ts                # 언어 접두사를 처리하는 Link/usePathname
│  ├─ proxy.ts                        # 언어 접두사 라우팅 (Next.js 16: middleware.ts 대체)
│  ├─ components/
│  │  ├─ dashboard/                   # ExperimentCard, OverreachSummaryCard
│  │  ├─ timeline/                    # TraceLive(폴링) → TraceView → TimelineView → EventCard
│  │  ├─ experiment-form/             # ExperimentForm (클라이언트: 입력 상태와 표시만)
│  │  └─ policy-editor/               # PolicyEditor (컨트롤드 컴포넌트)
│  └─ lib/
│     ├─ types.ts                     # 모든 도메인 타입
│     ├─ schemas.ts                   # Zod 스키마
│     ├─ constants.ts                 # 상수
│     ├─ event-log.ts                 # EventWriter 인터페이스
│     ├─ event-stats.ts               # 이벤트 집계 (Runner·비교 API 공용)
│     ├─ experiment-form.ts           # 폼 로직(요청 구성·검증·제출). 클라이언트가 import하므로 서버 모듈 금지
│     ├─ observation.ts               # 한 run에 대해 무엇을 주장할 수 있는가 (카드·trace 공용)
│     ├─ trace.ts                     # 이벤트 → 도구 호출 단위 묶기 (trace·run 비교 공용)
│     ├─ demo.ts                      # 데모 run 준비 요청(POST /api/demo) — 클라이언트 import 가능
│     ├─ report.ts                    # 호출을 보고서 구역(Agent 시도/강제 주입 차단/그 밖)으로 분류 + 표시용 마스킹
│     ├─ trace-polling.ts             # 진행 중인 run 폴링 로직
│     └─ redact.ts                    # 비밀 값 마스킹 (오류 메시지, argsSummary 민감 필드)
├─ global.ts                          # next-intl 타입 확장 (영어 메시지 기준)
├─ messages/
│  ├─ ko.json                         # 한국어 번역
│  └─ en.json                         # 영어 번역
├─ tests/
│  ├─ policy/                         # Policy Gate 테스트
│  ├─ agent/                          # Runner 테스트
│  ├─ tools/                          # Mock Tool·도구 정의 중립성 테스트
│  ├─ db/                             # DB 서비스 테스트
│  ├─ experiments/                    # 시나리오·실행 서비스·비교 테스트
│  ├─ api/                            # Route Handler 테스트
│  ├─ i18n/                           # 메시지 구조·proxy 라우팅 테스트
│  └─ helpers/                        # 테스트 공용 헬퍼 (인메모리 DB 등)
└─ public/

## i18n 규칙 (Next.js 16 + next-intl 4)

- `<html>`을 가진 루트 레이아웃은 `src/app/[locale]/layout.tsx`다. `src/app/layout.tsx`를 만들지 않는다
  (`next/root-params`로 locale을 읽으려면 `[locale]`이 루트 레이아웃 위에 있어야 한다).
- 앱 내부 링크와 이동은 `next/link`가 아니라 `@/i18n/navigation`의 `Link`, `usePathname`, `useRouter`를 쓴다.
- `/api`는 언어와 무관하다. proxy matcher에서 제외되어 있으며, Route Handler에서는 `next/root-params`를 쓸 수 없다.
- 새 메시지 키는 `messages/en.json`과 `messages/ko.json`에 함께 추가한다 (`tests/i18n/messages.test.ts`가 검증).
- 타입 체크는 `npm run typecheck`로 한다 (`next typegen`이 root-params 타입을 생성한다).
```

## 명명 규칙

- 파일명: kebab-case (`mock-ad-agent.ts`, `event-log.ts`)
- 컴포넌트: PascalCase (`TimelineView.tsx`, `EventCard.tsx`)
- 타입/인터페이스: PascalCase (`ActionEvent`, `PolicyRule`)
- 상수: UPPER_SNAKE_CASE (`ACTION_PHASES`, `RUN_MODES`)
- 함수: camelCase (`evaluatePolicy`, `runExperiment`)
