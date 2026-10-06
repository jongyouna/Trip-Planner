---
name: naver-stay-availability-devtools
description: >-
  Checks availability and prices of accommodations saved in the user's Naver Map bookmarks ('숙소' folder) for a given region, check-in/check-out date and guest count, using the chrome-devtools MCP attached to the user's own logged-in Chrome (no Playwright). Use when asked to find bookable stays among Naver Map favorites ("네이버 지도 즐겨찾기 숙소 중 O월 O일 예약 가능한 곳", "강원도 즐겨찾기 숙소 가격 비교") and the work should run in the real Chrome session instead of `npm run collect -- --sites naver`.
---

# 네이버 지도 즐겨찾기 숙소 가용성 조회 (chrome-devtools MCP)

사용자의 **실제 Chrome(이미 네이버 로그인됨)**에 chrome-devtools MCP로 붙어, 즐겨찾기 '숙소' 폴더의 숙소를 지역·날짜·인원 기준으로 조회한다. Playwright 수집기(`collector/sites/naver.ts`)와는 별개 경로이며, 사용자가 "Playwright 말고 chrome devtools로만" 하라고 했을 때 쓴다. 2026-10-06에 강원 125곳을 10/10 1박 2명으로 조회하며 검증한 절차다(`progress.md` 19번).

## 전제 조건

- MCP 설정: `~/.claude.json`의 `chrome-devtools` 서버 args에 `--autoConnect`가 있어야 한다(`cmd /c npx -y chrome-devtools-mcp@latest --autoConnect`). Chrome 144+, `chrome://inspect/#remote-debugging`에서 원격 디버깅 허용, 첫 호출 때 Chrome의 허용 팝업 승인. 설정을 바꿨으면 Claude Code를 재시작해야 반영된다.
- 도구는 deferred라 `ToolSearch`로 `mcp__chrome-devtools__list_pages, new_page, navigate_page, evaluate_script, take_snapshot, take_screenshot, click, close_page`를 한 번에 불러온다.
- 사용자의 기존 탭은 건드리지 않는다. 작업은 `new_page`로 연 새 탭에서 하고, 끝나면 `close_page`로 닫는다.
- 비밀번호·쿠키는 입력·열람하지 않는다. 로그인이 풀려 있으면 사용자에게 Chrome에서 직접 로그인하라고 요청한다.
- 개인용·저빈도 원칙. 아래 속도 제한 규칙을 지킨다.

## 절차

### 1. 즐겨찾기 목록 (map.naver.com 탭에서)

`new_page`로 `https://map.naver.com/p/`를 연다(10초 네비게이션 타임아웃이 나도 탭은 열리니 `list_pages`로 확인). 그 탭에서 `evaluate_script`:

```js
async () => {
  const j = await (await fetch('/p/api/bookmark', {credentials:'include'})).json();
  const folders = j.my.folderSync.folders;          // {folderId, name, bookmarkCount}
  const FOLDER = folders.find(f => f.name === '숙소').folderId;   // 2026-10 기준 35367544
  const bms = j.my.bookmarkSync.bookmarks
    .filter(b => (b.folderMappings||[]).some(m => m.folderId === FOLDER));
  const region = /^강원/;                            // 지역 정규식으로 교체
  return bms.filter(b => region.test(b.bookmark.address||''))
    .map(b => `${b.bookmark.sid}|${b.bookmark.mcid}|${b.bookmark.name}|${b.bookmark.address}`);
}
```

- `mcid === 'ACCOMMODATION'`만 숙소로 본다(CAR·TRAVEL·ADDRESS 등은 제외). 주소가 `강원` 또는 `강원특별자치도`로 시작하므로 지역 필터는 접두 일치로 한다.
- 응답이 크므로(수천 건) 필요한 필드만 뽑아 반환한다.

### 2. 펜션·게스트하우스·캠핑 가격 (pcmap.place.naver.com)

URL: `https://pcmap.place.naver.com/accommodation/{sid}/room?checkin=YYYYMMDD&checkout=YYYYMMDD&guest=N`

- 날짜 파라미터는 **`checkin` / `checkout`(yyyymmdd) / `guest`**다. `startDate`/`endDate`/`adultCount`는 무시되어 날짜가 반영되지 않는다(화면에 "일정선택"이 비고 가격이 범위로 나옴). 달력에서 직접 선택하면 주소가 이 형태로 바뀌어 확인할 수 있다.
- 날짜가 반영되면 본문에 "선택하신 조건으로 검색한 결과입니다."가 나오고, 객실마다 `N원`(예약 가능) 또는 `예약마감`(가격 없음)이 표시된다. 가격이 한 개라도 있으면 그 날짜에 예약 가능하다.
- GraphQL(`pcmap-api.place.naver.com/graphql`의 `bookingDetails`)은 날짜가 아니라 계절 요금만 주므로 쓰지 않는다. 화면 텍스트를 읽는다.
- **같은 출처 iframe**을 만들어 `contentDocument.body.innerText`를 읽는다(탭 하나에서 여러 숙소를 순차 조회 가능). 탭의 현재 주소가 `pcmap.place.naver.com`이어야 한다(`navigate_page`로 아무 숙소 `room` URL을 연다).

```js
// 탭이 pcmap.place.naver.com 일 때. ITEMS는 [{sid,name}] 배열로 채워 넣는다.
async () => {
  window.__res = {}; window.__done = false;
  const one = async (sid) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:1200px;height:900px';
    f.src = `https://pcmap.place.naver.com/accommodation/${sid}/room?checkin=20261010&checkout=20261011&guest=2`;
    document.body.appendChild(f);
    await new Promise(r => { f.onload = r; setTimeout(r, 20000); });
    let t = '';
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try { t = f.contentDocument.body.innerText; } catch (e) { t = 'ERR'; }
      if (/선택하신 조건|예약마감|오류/.test(t)) break;
    }
    f.remove();
    const k = t.indexOf('선택하신 조건');
    window.__res[sid] = k >= 0
      ? { ok: true, rooms: t.slice(k + 14, t.indexOf('이용약관')).trim() }
      : { ok: false, hasRoomTab: /객실예약/.test(t), head: t.slice(0, 80) };
  };
  (async () => {
    for (const it of ITEMS) {
      try { await one(it.sid); } catch (e) { window.__res[it.sid] = { ok: false, err: String(e) }; }
      await new Promise(r => setTimeout(r, 6000 + Math.random() * 3000));   // 한 번에 1개, 6초 이상 간격
    }
    window.__done = true;
  })();
  return 'started';
}
```

- 스크립트는 `await` 없이 백그라운드로 돌리고(`waitForStableDom: false`), `ScheduleWakeup`/반복 호출로 `window.__done`을 확인한다. 결과 파싱은 줄 단위로 `^[\d,]{5,}원$`인 줄(앞 줄이 객실명)을 가격으로 본다.
- 결과 분류: 가격 줄 있음 → 예약 가능. 가격 없고 `예약마감` → 마감. `ok:false`이고 `hasRoomTab:false` → 객실 탭이 없는 호텔·리조트·캠핑 → 3번으로. `ok:false`이고 `hasRoomTab:true` → 로딩 누락 또는 408 → 천천히 재조회.

### 3. 호텔·리조트 가격 (hotels.naver.com)

URL: `https://hotels.naver.com/accommodation/search/detail/domestic/{sid}/rates?dAdultCnt=2&dCheckIn=YYYY-MM-DD&dCheckOut=YYYY-MM-DD`

- 탭을 `hotels.naver.com`의 아무 숙소 `rates` URL로 이동한 뒤, 2번과 같은 방식으로 iframe 순차 조회(간격 4.5~7초).
- 헤더의 `N원~`(또는 `N원\n전체 가격 비교하기`)가 해당 날짜 1박 최저가(세금 포함, 2인)다. 판정:
  - 본문에 **"예약 가능한 객실 없음" / "선택하신 일정에 예약 가능한 객실이 없습니다"**가 있으면 예약 불가. 이때 화면에 보이는 `N원~`은 **추천 호텔의 가격**이므로 무시한다(세이지우드 홍천 100,581원, 헤이 춘천 44,267원이 실제로 그랬다).
  - 가격이 있고 위 문구가 없으면 예약 가능.
  - 본문이 1,000자 안팎이고 가격이 없으면 호텔 페이지가 없는 캠핑·민박 등 → 네이버로는 확인 불가.

### 4. 정리

가격 낮은 순 표로 보고하고, 예약 링크를 함께 붙인다(위 두 URL 형식에 날짜 포함). 펜션/캠핑은 객실 최저가, 호텔은 세금 포함 1박 최저가이며 "시점에 따라 바뀜"을 표기한다. 예약 불가/확인 불가/조회 실패 목록도 따로 적는다. 결과는 사용자가 요청할 때만 `data/hotels.json`에 병합한다(`npm run ingest -- file.json`, `Hotel[]` 형식). 작업이 끝나면 `progress.md`를 갱신한다.

## 주의사항(실제로 겪은 문제)

1. **408 제한**: 동시에 2개씩 빠르게 조회하면 네이버가 `일시적 오류로 정보를 불러오지 못했습니다. (errorCode: 408)`을 돌려준다. 한 번에 1개, 6초 이상 간격으로 돌리고, 실패한 곳은 몇 분 쉬었다가 같은 속도로 재조회한다. 125곳 기준 동시 2개 1차 스캔은 약 13분이었다.
2. **`navigate_page`는 페이지의 JS 변수(`window.__res` 등)를 모두 지운다.** 스캔 중에는 탭을 이동하지 말고, 이동해야 하면 먼저 결과를 반환해 받아 둔다. 호텔 조회로 넘어가기 전에 1차 결과를 꼭 회수한다.
3. **`get_network_request`는 쿠키 헤더를 그대로 보여 준다.** 요청 본문이 필요하면 `navigate_page`의 `initScript`로 `window.fetch`를 감싸 본문만 `window.__log`에 쌓아 읽는다.
4. 달력 모달은 iframe 안에 있어 `document.querySelectorAll`로 못 찾는다. `take_snapshot`(`filePath`로 저장 후 grep)으로 uid를 얻어 `click`한다.
5. 큰 스냅샷은 파일로 저장해 필요한 줄만 읽는다(광고 iframe의 긴 URL 때문에 인라인 출력이 매우 길다).
6. 같은 숙소가 두 URL 중 한쪽에서만 가격이 나오는 경우가 많다(펜션=pcmap, 호텔·리조트=hotels). 한쪽이 비면 다른 쪽을 시도한다. 둘 다 안 나오면 전화·SNS 예약 등으로 보고 제외한다(야놀자 "숙박 가격 없으면 제외"와 같은 원칙).
7. 차단·CAPTCHA가 나오면 우회하지 않고 사용자에게 알린다. 스텔스 옵션·UA 위장 금지.

## 참고

- 기존 Playwright 경로와 API 상세: `.claude/skills/antigravity-naver-hotel/`, 프로젝트 `CLAUDE.md`의 "네이버 지도 즐겨찾기 메모".
