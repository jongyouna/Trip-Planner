@AGENTS.md

# CLAUDE.md

가성비 숙소 수집기(Playwright) + 대시보드(Next.js). 숙소를 지역·날짜·가격으로 모아 `data/hotels.json`에 저장하고 웹에서 본다. DB 없음.

## 명령

- `npm run dev` 대시보드 (개발 서버는 `data/hotels.json`을 다시 읽음)
- `npm run collect -- --region 포천 --checkin 2026-09-23 --checkout 2026-09-24 --max-price 50000 --sites yanolja [--no-address]`
- `npm run ingest -- file.json` Claude 브라우저 등으로 손수 모은 JSON을 검증·병합 (형식: `Hotel[]`)
- `npm test`, `npm run typecheck`

## 구조

- `lib/schema.ts` zod 스키마 하나가 수집기·ingest·대시보드 모두의 기준. 사이트가 바뀌면 여기서 검증 실패로 드러난다.
- `collector/core.ts` 브라우저 실행, 재시도(`withRetry`), 지터, 병합 저장, 실행 로그(`data/run-log.json`).
- `collector/sites/*.ts` 사이트 어댑터. 사이트별 코드는 여기에만 둔다.

## 브라우저 검색 규칙

- 이 프로젝트에서 웹 브라우저 검색·탐색은 항상 **크롬 데스크탑 내장 브라우저**로 직접 열어서 진행한다.
- 크롬 데스크탑 내장 브라우저가 사이트에서 차단되면(접근 거부, 봇 감지, 로딩 실패 등) **크롬 클로드 플러그인(home pc)** 으로 다시 시도한다.
- 두 방법 모두 막히면 어떤 사이트에서 어떻게 막혔는지 사용자에게 알리고 다음 방법을 묻는다. CAPTCHA·봇 감지는 우회하지 않는다. 스텔스 옵션(webdriver 숨김, UA 위장)은 쓰지 않는다.

## 결과 보고 규칙

- 검색으로 숙소·상품 정보를 찾으면 **예약(또는 상세 페이지) 링크를 항상 함께** 보여준다.
- 가격, 날짜, 조건(1박, 인원 등)을 링크와 함께 적는다. "회원가"는 로그인 회원 기준일 수 있으니 표기한다.

## 야놀자(NOL) 메모

- 목록 데이터는 내부 API `POST /discovery/api/list/universal-search/v2/list`(같은 출처 fetch). 본문에 날짜(`localAccommodation.checkInDate`)·페이지가 들어 있어 캘린더 조작이 필요 없다. 본문 필드가 하나라도 빠지면 400이므로 화면이 보내는 구조를 그대로 유지한다(`collector/sites/yanolja.ts`의 `requestBody`).
- `priceRange` 필터는 서버에서 적용되지 않는 것으로 보여 가격 조건은 응답을 받은 뒤 코드에서 거른다.
- 대실이 예약마감이어도 숙박이 판매 중일 수 있다. 예약마감 항목은 `discountPrice`가 없다. 숙박 가격이 없으면 제외한다.
- 주소는 `GET /stay/api/trpc/stay.properties.getSellerInfo`의 "사업자주소"만 사용한다. 체인 본사 주소일 수 있어 실제 숙소 주소와 다를 수 있다. 대표자명·연락처·이메일은 읽지도 저장하지도 않는다.
- 상세 링크: `https://nol.yanolja.com/stay/domestic/{숙소ID}?adultCount=2&checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD`
- 목록 페이지 UI의 날짜는 화면 상태다. 확장(Claude 브라우저)에서 캘린더 "적용하기"가 자동 클릭으로 반영되지 않을 수 있다.
- Claude 확장의 `javascript_tool`은 쿠키·쿼리 문자열이 포함된 결과를 차단한다. 링크는 `find`로 얻는다.

## Trip.com 메모 (어댑터 미구현)

- 목록 URL에 도시·날짜가 들어간다: `https://kr.trip.com/hotels/list?cityId=72363&countryId=42&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&crn=1&adult=2&curr=KRW&locale=ko-KR` (72363=포천). 다른 지역은 메인에서 목적지를 검색한 뒤 URL의 `cityId`를 읽는다.
- 처음 10건은 서버 렌더링된 DOM(`.hotel-info`/`.right-card`)에서 이름·평점(/10)·리뷰 수·세금 포함 가격을 읽을 수 있다. 주소는 목록에 없다.
- 스크롤해서 다음 페이지를 불러오면 목록이 "결과 0개"로 리셋되는 현상이 자동화 Chrome에서 관찰됐다. 차단인지 로딩 문제인지 확인되지 않았으므로 우회하지 말고 사용자에게 알린다.

## 배포

- GitHub Pages(정적 export): https://jongyouna.github.io/Trip-Planner/ . `main` push → `.github/workflows/pages.yml`. 데이터 갱신은 로컬 수집 후 `data/hotels.json` 커밋·푸시.
- 리포가 **public**이다. 시크릿·`.browser-profile/`·개인정보를 커밋하지 않는다. `next.config.ts`의 `output: "export"`와 서버 전용 기능(`force-dynamic`, 라우트 핸들러 등)은 함께 쓸 수 없다.

## 주의

- 수집은 로컬 PC(자택 IP)에서 개인용·저빈도로만 한다. 클라우드 IP는 차단되는 사이트가 많다. 사이트 약관을 확인하고 대량 수집을 하지 않는다.
- `.browser-profile/`(로그인 세션 포함)은 커밋하지 않는다.
