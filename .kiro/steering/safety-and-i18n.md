---
inclusion: always
---

# POSSESSED — Safety & i18n Steering

## 안전 규칙

### 판정 코드 언어 독립성

`ATTEMPTED`, `BLOCKED`, `EXECUTED`, `ALLOWED`, `VIOLATION`, `NEEDS_APPROVAL` 코드는 언어에 무관하게 동일하게 저장되고 표시된다. 번역 대상이 아니다.

### REPLAY_DEMO 구분 표시 (필수)

`RunMode: REPLAY_DEMO`인 run을 표시하는 모든 화면에는 다음 배지를 반드시 표시해야 한다.

```
⬜ Pre-recorded result — not a live LLM run
```

사전 기록된 결과를 실제 LLM 실행 결과처럼 표시하는 것은 허용되지 않는다.

### argsSummary 민감 필드 마스킹

`ActionEvent.argsSummary`에 저장하기 전에 다음 필드는 마스킹한다.
- `password`, `token`, `secret`, `key`, `credential`, `auth`
- 이름에 위 단어가 포함된 중첩 필드

마스킹 형식: `"[REDACTED]"`

### 외부 데이터 조작 금지

모든 mock 도구의 `execute()` 함수는:
- 실제 외부 API 호출 금지 (`fetch`, `axios` 등)
- DB 실제 데이터 수정 금지
- 파일 시스템 쓰기 금지 (테스트 임시 파일 제외)

## 접근성 규칙

### 색상만으로 구분 금지

경고·위반·상태는 반드시 색상 + 아이콘 + 텍스트 레이블로 표현한다.

| 색상 역할 | 추가 표현 |
|---|---|
| crimson(#B91C3B) = 위반/차단 | ShieldOff 아이콘 + "차단됨 / Blocked" 텍스트 |
| success(#4ADE80) = 정상 실행 | CheckCircle 아이콘 + "실행됨 / Executed" 텍스트 |
| alert(#FB7185) = 경고 | AlertTriangle 아이콘 + "위반 / Violation" 텍스트 |

### prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  /* 모든 애니메이션 비활성화, 색상 변화만 사용 */
}
```

Policy Violation 잉크 애니메이션은 `prefers-reduced-motion: reduce` 환경에서 발동하지 않는다.

### WCAG 2.1 AA 색상 대비

- `#F5F3F4` on `#0B090D`: 대비 21:1 (통과)
- `#4ADE80` on `#0B090D`: 대비 확인 필요 시 텍스트와 조합
- `#B91C3B` 단독 배경 사용 시 흰색 텍스트(`#F5F3F4`) 사용

## i18n 규칙

### 번역 파일 구조

```
messages/
├─ ko.json
└─ en.json
```

### 번역하지 않는 값

- 판정 코드: `ATTEMPTED`, `BLOCKED`, `EXECUTED`, `ALLOWED`, `VIOLATION`
- RunMode: `DETERMINISTIC_TEST`, `LIVE_EXPERIMENT`, `REPLAY_DEMO`
- 도구 이름: `update_ad`, `search_rule` 등
- ID, UUID 값

### 번역 키 네임스페이스

```json
{
  "nav": {},
  "dashboard": {},
  "experiment": {},
  "policy": {},
  "timeline": {},
  "report": {},
  "verdict": {},
  "runMode": {
    "LIVE_EXPERIMENT": "라이브 LLM 실행 / Live LLM Run",
    "DETERMINISTIC_TEST": "결정적 테스트 / Deterministic Test",
    "REPLAY_DEMO": "사전 기록 결과 — 실제 LLM 실행이 아님 / Pre-recorded result — not a live LLM run"
  }
}
```
