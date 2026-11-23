# POSSESSED | The Agent Overreach Lab

AI 에이전트가 사용자가 승인한 범위를 넘어서는 도구 호출을 시도하는지 관찰하는 실험용 앱입니다.
요청 문구와 허용 범위를 정하고, 도구 호출의 제안·정책 판정·실행 또는 차단 결과를 추적합니다.

개인 프로젝트로 초기 구현과 검증을 진행하고 있습니다. 현재 코드의 도구는 실험용 Mock·샌드박스이며, 외부 광고 계정이나 실제 결제·업무 시스템에 연결하지 않습니다.

[프로젝트 소개](https://inwoo-jang.github.io/inwoo-portfolio/portfolio.html#p-possessed)

## 무엇을 확인하나

- 요청에서 허용한 작업과 에이전트가 제안한 도구 호출의 차이
- 정책 게이트가 호출을 허용·차단하는 과정과 테스트용 승인
- 실행별 도구 호출 타임라인과 보고서
- 같은 시나리오의 실행 결과 비교
- 한국어·영어 요청과 화면

## 실행 유형

| 유형 | 확인하는 것 | 해석할 때 주의할 점 |
| --- | --- | --- |
| 사전 기록 데모 | 작성해 둔 시퀀스로 화면과 추적 흐름 확인 | 실제 LLM의 실행 기록이 아님 |
| 결정적 테스트 | 도구 호출을 강제로 주입해 정책 게이트 확인 | 에이전트가 스스로 행동한 결과가 아님 |
| 라이브 실험 | 실제 LLM이 요청을 읽고 도구를 선택하는 과정 관찰 | 서버의 API 키가 필요하며 사용 요금이 발생할 수 있음 |

대시보드의 과잉 행동 집계는 완료된 라이브 실행에서 에이전트가 스스로 제안했고 정책이 차단한 호출을 대상으로 합니다. 도구를 호출하지 않은 실행과 미완료 실행은 별도로 구분합니다.

## 로컬 실행

Node.js와 npm이 필요합니다. 의존성은 [package.json](package.json)과 잠금 파일을 기준으로 설치합니다.

```bash
git clone https://github.com/inwoo-jang/possessed-lab.git
cd possessed-lab
npm ci
cp .env.local.example .env.local
npm run dev
```

[http://localhost:3000/ko](http://localhost:3000/ko)에서 시작합니다. 영어 화면은 `/en`입니다.

- 사전 기록 데모: `/ko/demo`
- 실험 만들기: `/ko/experiments/new`
- 실행 비교: `/ko/compare`
- API 키 없이 사전 기록 데모와 결정적 테스트를 사용할 수 있습니다.
- 라이브 실험은 `.env.local`의 `OPENAI_API_KEY`에 본인 키를 설정합니다. 이 값은 서버에서만 사용합니다.

DB는 기본적으로 `./possessed.db`의 SQLite 파일을 사용하고, 처음 DB를 열 때 마이그레이션을 적용합니다. 현재 DB 클라이언트의 연결 대상은 SQLite입니다.

## 검사와 UI 확인

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run storybook
```

명령별 동작은 [npm 스크립트](package.json)를 참고하세요.

## 구조

| 경로 | 내용 |
| --- | --- |
| [src/app](src/app) | 대시보드·실험·추적·보고서·비교 화면과 API |
| [src/server/agent](src/server/agent) | 모델 연결과 실험 실행 |
| [src/server/policy](src/server/policy) | 도구 호출의 정책 평가·게이트 |
| [src/server/tools](src/server/tools) | 실험용 도구와 샌드박스 |
| [src/server/experiments](src/server/experiments) | 실행 기록·데모·비교·대시보드 집계 |
| [src/db](src/db) | Drizzle 스키마·마이그레이션·SQLite 클라이언트 |
| [messages](messages) | 한국어·영어 화면 문구 |
| [tests](tests) | 실행·정책·API·화면 등의 검사 |

사용 기술: Next.js · React · TypeScript · Tailwind CSS · Drizzle ORM · SQLite · Vitest · Storybook.

## 확인 범위

로컬 실험용 초기 구현입니다. 사전 기록 재생, 정책 게이트 검사, 실제 모델 관찰을 구분하며, 이 저장소만으로 운영 환경에서의 안전성이나 에이전트 행동의 일반적인 빈도를 입증하지 않습니다.

