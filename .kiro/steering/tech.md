---
inclusion: always
---

# POSSESSED — Technical Steering

## 기술 스택 (고정)

| 레이어 | 기술 | 버전 |
|---|---|---|
| 프레임워크 | Next.js (App Router) | 16.x |
| 언어 | TypeScript | 5.x |
| 스타일링 | Tailwind CSS | 4.x (CSS-first, @theme 블록) |
| 다국어 | next-intl | 4.x (Next.js 16 호환) |
| 스키마 검증 | Zod | 3.x |
| 정책 엔진 | 순수 TypeScript (상태 머신) | — |
| DB (로컬) | SQLite + better-sqlite3 | 13.x |
| ORM | Drizzle ORM | 0.x |
| 테스트 | Vitest | 2.x |
| 애니메이션 | Motion (framer-motion) | 14.x |

## 보안 제약 (위반 금지)

1. **LLM API 키는 서버 환경 변수 전용**
   - `NEXT_PUBLIC_` 접두사 사용 절대 금지
   - 클라이언트 컴포넌트에서 `process.env.OPENAI_API_KEY` 참조 금지

2. **Mock Tool Registry 화이트리스트**
   - `src/server/tools/registry.ts`에 등록된 도구만 실행 가능
   - 미등록 도구명 → 즉시 오류 반환 (실행 없음)
   - 모든 mock 구현체는 외부 네트워크 호출 없음

3. **Policy Gate bypass 없음**
   - 모든 도구 호출 경로에서 `evaluatePolicy()` 반드시 통과
   - shortcut이나 직접 sandbox 호출 금지

## API 파일 위치 (Next.js App Router)

```
src/app/api/
├─ experiments/route.ts          # POST /api/experiments
├─ runs/route.ts                 # POST /api/runs
├─ runs/[runId]/route.ts         # GET /api/runs/[runId]
├─ runs/[runId]/events/route.ts  # GET /api/runs/[runId]/events
├─ compare/route.ts              # GET /api/compare
└─ demo/route.ts                 # POST /api/demo
```

Pages Router 방식(`pages/api/`) 사용 금지.

## 서버/클라이언트 분리

- `src/server/` — 서버 전용 코드 (agent, policy, tools, experiments)
- `src/server/` 내 파일은 클라이언트 컴포넌트에서 직접 import 금지
- LLM 호출은 Route Handler 또는 Server Action에서만 수행

## Tailwind v4 사용 방식

- `tailwind.config.js` 사용하지 않음
- 커스텀 색상은 `src/app/globals.css`의 `@theme` 블록에 정의
- POSSESSED 디자인 토큰: `--color-possessed-bg`, `--color-possessed-crimson` 등
