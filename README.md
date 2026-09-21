# Trip-Planner

지역·날짜·가격으로 가성비 숙소를 모아 한 화면에서 보는 도구. 수집은 로컬 PC의 Chrome(Playwright), 저장은 `data/hotels.json`, 화면은 Next.js.

## 시작

```bash
npm install
npm run dev            # http://localhost:3000 (data/hotels.json 변경은 새로고침하면 반영)
```

## 공개 배포 (GitHub Pages)

- 주소: https://jongyouna.github.io/Trip-Planner/ (누구나 접속 가능한 공개 URL. `noindex`로 검색 노출만 줄인 것이고 접근 제어는 아니다.)
- `main`에 push하면 `.github/workflows/pages.yml`이 테스트 → 정적 빌드(`output: "export"`) → 배포한다.
- 데이터는 빌드 시점의 `data/hotels.json`이다. 갱신 절차: 로컬에서 수집 → `git add data/hotels.json && git commit && git push`. (수집은 로그인 세션·자택 IP가 필요해 Actions에서 돌리지 않는다.)
- 로컬에서 정적 결과 확인: `npm run build && npx serve out`
- 공개 리포이므로 `.browser-profile/`, 쿠키·토큰, 개인정보를 커밋하지 않는다.

## 수집

```bash
npm run collect -- --region 포천 --checkin 2026-09-23 --checkout 2026-09-24 --max-price 50000 --sites yanolja
```

- 로컬에 설치된 Chrome 창이 열린다(`.browser-profile/`에 로그인 상태 유지).
- 같은 사이트·숙소·날짜는 최신 값으로 덮어쓴다. 주소는 한 번 얻으면 재사용한다(`--no-address`로 조회 생략).
- 구현된 사이트: 야놀자. Trip.com은 미구현(사유는 `CLAUDE.md`).

## 직접 모은 데이터 넣기

```bash
npm run ingest -- my-hotels.json   # Hotel[] 형식, lib/schema.ts 기준으로 검증
```

## 데이터 형식

`lib/schema.ts`의 `HotelSchema`: 사이트, 숙소 ID, 이름, 지역, 주소, 체크인/아웃, 1박 가격, 가격 메모, 리뷰 점수(만점), 리뷰 수, 예약 링크, 예약 가능 여부, 수집 시각.

## 테스트

```bash
npm test && npm run typecheck
```
