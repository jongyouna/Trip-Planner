# Aside 브라우저 핸드오프 (파일 기반)

크롬 데스크탑 내장 브라우저·크롬 클로드 플러그인(home pc) 둘 다 사이트 접근이 막힐 때
(`CLAUDE.md` 브라우저 검색 규칙 3단계), 채팅으로 매번 사용자에게 묻는 대신 파일로 작업을
넘기고 넘겨받는 절차. "aside 브라우저" = 이 세션이 못 여는 사이트를 대신 열 수 있는 주체
(사용자 본인 또는 그 사이트 접근 가능한 다른 세션/브라우저).

## 파일

리포 루트에 둘. **커밋 안 함** (`.gitignore` 등록, 검색 이력·개인정보 가능성):

- `aside-request.md` — 이 세션이 작성. 막힌 작업 요청.
- `aside-result.md` — aside 브라우저가 작성. 찾은 정보.

## 흐름

1. 이 세션이 사이트 접근 차단 만남 (에러 메시지 그대로 기록).
2. `aside-request.md` 작성 (`status: pending`), 사용자에게 알림: "요청 파일 작성함,
   aside 브라우저로 처리 후 알려달라."
3. aside 브라우저(사람 또는 다른 세션)가 파일 읽고 작업 수행. 이때도 `CLAUDE.md` 브라우저
   규칙 그대로 적용 — CAPTCHA·봇 감지 우회 안 함, 스텔스 옵션 안 씀.
4. 작업 끝나면 `aside-result.md` 작성 (`status: done` / `blocked` / `partial`).
5. 사용자가 이 세션에 "결과 확인해줘" 하면 `aside-result.md` Read, 표로 정리해 답변.
   필요하면 `npm run ingest -- aside-result.md` 대신 `lib/schema.ts` 형식 JSON으로 옮겨
   `npm run ingest`로 `data/hotels.json` 병합.

이 세션은 파일을 자동으로 폴링하지 않음 — 완료 여부는 사용자가 알려줄 때 확인한다
(외부/사람이 끝내는 작업이라 하네스가 완료를 감지 못 함).

## `aside-request.md` 템플릿

```markdown
# Aside Browser Request

- status: pending
- created: 2026-09-23T14:00
- site: map.naver.com
- blocked_reason: "This site is not allowed due to safety restrictions"

## 작업
<자연어로 무엇을 확인해야 하는지>

## 대상
- <숙소명 또는 URL 목록>

## 조건
- 체크인: 2026-10-05
- 체크아웃: 2026-10-06
- 인원: 2

## 필요한 정보 (항목별)
- 숙소명
- 가격 (1박 기준, 회원가 여부 표기)
- 예약/상세 링크
- 리뷰 수·점수 (있으면)
- 주소 (있으면)
```

## `aside-result.md` 템플릿

```markdown
# Aside Browser Result

- status: done
- completed: 2026-09-23T14:20
- request_ref: aside-request.md (created 2026-09-23T14:00)

## 결과

| 숙소명 | 가격 | 날짜 | 조건 | 링크 | 비고 |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | 회원가 |

## 막힌 항목 (있으면)
- <숙소명>: <이유>
```

## 주의

- 파일 하나씩만 유지 (이력 불필요). 여러 요청 동시 진행 필요해지면
  `aside-request-YYYYMMDD-HHMM.md` 식으로 타임스탬프 붙이는 방식 고려.
- `status` 필드로 이 세션이 재확인 시 pending/done/blocked 구분.
- 링크·가격은 결과 보고 규칙 그대로: 항상 예약 링크 함께, "회원가"면 표기.
