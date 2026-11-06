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
│  │  └─ forensic-report/              # 보고서 컴포넌트
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
│  │     └─ scenarios.ts
│  ├─ db/
│  │  ├─ schema.ts                    # Drizzle ORM 스키마
│  │  ├─ client.ts                    # DB 연결
│  │  └─ migrations/
│  └─ lib/
│     ├─ types.ts                     # 모든 도메인 타입
│     ├─ schemas.ts                   # Zod 스키마
│     ├─ constants.ts                 # 상수
│     └─ event-log.ts                 # EventWriter 인터페이스
├─ messages/
│  ├─ ko.json                         # 한국어 번역
│  └─ en.json                         # 영어 번역
├─ tests/
│  ├─ policy/                         # Policy Gate 테스트
│  ├─ agent/                          # Runner 테스트
│  ├─ tools/                          # Mock Tool 테스트
│  └─ db/                             # DB 서비스 테스트
└─ public/
```

## 명명 규칙

- 파일명: kebab-case (`mock-ad-agent.ts`, `event-log.ts`)
- 컴포넌트: PascalCase (`TimelineView.tsx`, `EventCard.tsx`)
- 타입/인터페이스: PascalCase (`ActionEvent`, `PolicyRule`)
- 상수: UPPER_SNAKE_CASE (`ACTION_PHASES`, `RUN_MODES`)
- 함수: camelCase (`evaluatePolicy`, `runExperiment`)
