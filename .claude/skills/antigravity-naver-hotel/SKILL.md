---
name: antigravity-naver-hotel
description: >-
  Extracts saved accommodations from Naver Map bookmarks/favorites, queries real-time room prices and availability for specific check-in/check-out dates using Naver Hotel and Naver Place, and generates structured comparison reports. Use when asked to search, collect, or compare accommodation prices, saved places, or hotels from Naver Map or Naver Hotel.
---

# Antigravity Naver Hotel & Map Accommodation Skill

이 스킬은 **네이버 지도 즐겨찾기(저장 폴더)**에서 숙소를 추출하고, 지정된 날짜(체크인/체크아웃)의 **1박 실시간 가격, 예약 링크, 리뷰, 주소**를 수집하여 비교 보고서(예: `aside-result.md`)를 작성하는 절차를 안내합니다.

## 배경 및 핵심 원리

1. **차단 우회 정책 준수 (`CLAUDE.md`)**:
   - CAPTCHA나 봇 감지 우회 기법(스텔스 옵션, UA 위장 등)을 절대 사용하지 않습니다.
   - 개인용·저빈도로 로컬 PC(사용자 자택 IP)에서 영속 프로필(`.browser-profile`)을 통해 실행합니다.
2. **네이버 지도 즐겨찾기 동기화**:
   - 네이버 로그인 쿠키(`NID_AUT`, `NID_SES`)가 유지된 세션으로 `https://map.naver.com/p/bookmark` 접근 시, 클라이언트로 전체 북마크 데이터가 동기화됩니다 (`/p/api/bookmark`).
   - 응답 내 `folderMappings` 및 폴더 목록 API(`/save-pages/api/maps-bookmark/v3/folders`)를 통해 '숙소' 폴더(ID: `35367544` 등) 및 `mcid === 'ACCOMMODATION'` 대상을 정확히 필터링할 수 있습니다.
3. **상세 및 가격 조회 경로**:
   - **호텔 / 리조트**: `https://hotels.naver.com/accommodation/search/detail/domestic/{sid}/rates?dAdultCnt=2&dCheckIn=YYYY-MM-DD&dCheckOut=YYYY-MM-DD`로 실시간 최저가 및 예약 링크 확보.
   - **펜션 / 풀빌라 / 게스트하우스**: `https://map.naver.com/p/entry/place/{sid}?placePath=%2Froom%3FstartDate%3DYYYY-MM-DD%26endDate%3DYYYY-MM-DD` 접속 후 `#entryIframe`(`pcmap.place.naver.com`) 내부의 객실 최저가 및 네이버예약(`booking.naver.com`) 링크 추출.
   - **캠핑장 / 공공 예약**: 전용 공공 예약 시스템(예: `gwgs.pubcamping.kr`) 또는 인스타그램/전화번호 안내 정보 확보.

---

## 작업 절차

### 1단계: 로그인 세션 확인 및 프로필 로드

Playwright의 `launchPersistentContext`를 사용하여 프로젝트 내 `.browser-profile`을 로드합니다.

```typescript
import { chromium } from "playwright";
const PROFILE_DIR = path.join(process.cwd(), ".browser-profile");

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: true, // 로그인 확인 후에는 headless 권장
});

const cookies = await ctx.cookies("https://naver.com");
const isLoggedIn = cookies.some((c) => c.name === "NID_AUT");
```

> [!NOTE]
> 만약 로그인이 안 되어 있다면(`NID_AUT` 없음), 사용자에게 터미널에서 `npm run aside-collect`를 실행하여 포그라운드 Chrome 창에서 1회 로그인하도록 안내합니다.

---

### 2단계: 네이버 지도 즐겨찾기(저장) 추출

1. `page.goto("https://map.naver.com/p/bookmark", { waitUntil: "networkidle" })` 이동.
2. `page.on("response", ...)`로 다음 API 응답 캡처:
   - `https://map.naver.com/p/api/bookmark` (전체 북마크 동기화 데이터: `data.my.bookmarkSync.bookmarks`)
   - `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/folders` (폴더 목록: '숙소' 폴더 ID 확인)
3. 북마크 데이터 파싱:
   - `folderId`: '숙소' 폴더 매핑 필터링 (`folderMappings.some(m => m.folderId === accommodationFolderId)`)
   - 카테고리: `mcid === 'ACCOMMODATION'` (주차장, 단순 주소, 편의시설 자동 제외)
   - 지역 필터: `address.includes(지역명)` (예: "강원 고성군", "포천시" 등)

---

### 3단계: 숙소별 지정 날짜 가격 및 상세 정보 수집

각 숙소(`sid`)에 대해 체크인/체크아웃 날짜 파라미터를 적용하여 조회합니다:

```typescript
const entryUrl = `https://map.naver.com/p/entry/place/${sid}?placePath=%2Froom%3FstartDate%3D${checkIn}%26endDate%3D${checkOut}`;
await page.goto(entryUrl, { waitUntil: "domcontentloaded" });

const iframeEl = await page.waitForSelector("#entryIframe", { timeout: 15000 });
const frame = await iframeEl.contentFrame();
```

1. **호텔 가격비교 링크 여부 확인**:
   - `frame` 내에 `hotels.naver.com` 또는 '실시간 가격비교' 링크가 존재하면 호텔 가격비교 페이지로 이동하여 최저 OTA/회원가 요금 추출:
     `https://hotels.naver.com/accommodation/search/detail/domestic/{sid}/rates?dAdultCnt=2&dCheckIn={checkIn}&dCheckOut={checkOut}`
2. **펜션/객실 요금 확인**:
   - `frame` 내부 객실 목록에서 `\d{1,3}(,\d{3})+원` 정규식으로 표시 최저가 및 네이버페이 가능 여부 확인.
   - "예약 마감" 문구 감지 시 "예약 마감"으로 표기.
3. **외부 예약/캠핑장 처리**:
   - 네이버 직접 예약이 없는 경우 자체 홈페이지, 전용 예약 사이트(예: 지자체 공공캠핑 사이트), 또는 인스타그램/전화번호 정보를 비고에 기재.

---

### 4단계: 결과 보고서 작성 (`aside-result.md`)

수집된 결과를 마크다운 표로 정렬하여 작성합니다:

```markdown
# Aside Browser Result

- status: done
- completed: YYYY-MM-DDTHH:mm:ss+09:00
- request_ref: aside-request.md

## 결과

| 숙소명 | 가격 (1박) | 날짜 | 조건 | 링크 | 주소 | 비고 |
|---|---|---|---|---|---|---|
| ... | 150,000원~ | YYYY-MM-DD ~ YYYY-MM-DD | 1박 (기본 인원) | [예약/상세 링크](URL) | 주소 | 네이버페이 가능, 평점 4.9 |

## 제외된 비숙소 항목
- 주차장, 단순 주소 지점 등

## 막힌 항목 (있으면)
- 없음
```

---

## 주의사항 및 팁

- **지연 시간 (Jitter/Sleep)**: 대량 요청 시 네이버 플레이스 단기 IP 제한(과도한 요청 안내)이 발생할 수 있으므로 요청 간 1.5~2.5초의 대기 시간을 둡니다.
- **`m.place.naver.com` 직접 접근 주의**: 모바일 플레이스 URL 직접 접근 시 Referer 검증으로 차단될 수 있으므로, 항상 `map.naver.com/p/entry/place/{sid}`를 부모로 하여 `#entryIframe`을 통해 접근하거나 `hotels.naver.com` 정규 링크를 사용합니다.
