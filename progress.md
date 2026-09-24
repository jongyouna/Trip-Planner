# 진행 기록 (progress)

마지막 업데이트: 2026-09-24

## 목표
여행마다 야놀자·네이버 호텔·Trip.com 등에 흩어진 숙소를 따로 열어 보는 불편을 줄인다. 로컬 PC 브라우저로 지역·날짜·가격 조건에 맞는 숙소를 모아 `data/hotels.json`에 저장하고, 웹 대시보드로 본다. 수집 항목은 숙소명, 예약 가능 날짜, 주소, 가격, 리뷰 수, 리뷰 점수, 예약 링크.

## 현재 상태 한눈에

| 항목 | 상태 |
|---|---|
| 야놀자 수집기 | 동작 (포천, 2026-09-23~24, 5만원 이하 → 57곳, 주소 57/57) |
| 대시보드(Next.js 정적 export) | 동작, GitHub Pages 공개 |
| 공개 주소 | https://jongyouna.github.io/Trip-Planner/ |
| Trip.com 수집기 | 미구현 (아래 "막힌 점") |
| 네이버 어댑터 (`collector/sites/naver.ts`) | 구현 완료 (지도 즐겨찾기 '숙소' 폴더 + 지역 필터, `npm run collect -- --sites naver`) — **실제 수집 미검증** (테스트는 단위 테스트만, 실행은 로그인 세션 필요) |
| 네이버 호텔/지도 (수동, aside) | aside 브라우저 핸드오프로 강원도 고성 즐겨찾기 숙소 26곳 1회 수집 완료 (`aside-result.md`) — 이제 위 정식 어댑터로 대체 예정 |
| 지역 필터 | 야놀자는 미적용(다른 지역 숙소가 섞임). 네이버는 어댑터에 내장(주소에 `--region` 포함 여부) |
| 열 제목 클릭 정렬 | 구현 (`lib/sort.ts`, URL `sort`·`dir`) |
| 이메일/비밀번호 로그인 + 최저가 탐색 | 코드 구현·빌드 통과. 로그인 자체는 배포 사이트에서 provider 활성화 확인됨(2026-09-24). 탐색 job-queue는 **실환경 미검증** (Firestore 규칙 게시·서비스 계정 키·워커 실행 필요, `docs/firebase-setup.md`) |
| 테스트 | 단위 테스트 45개 통과, 타입체크·lint(신규 파일 기준) 통과 |

## 한 일 (시간순)

1. **프로젝트 규칙 정리**: 브라우저 검색은 크롬 데스크탑 내장 브라우저를 우선, 차단되면 크롬 클로드 플러그인(home pc)으로 재시도. 결과에는 예약 링크를 함께 표시.
2. **야놀자 수동 검색**: 브라우저 조작으로 포천 9/23 1박 5만원 이하 숙소를 찾음. 캘린더 "적용하기"가 자동 클릭으로 반영되지 않아 사용자가 직접 날짜를 바꿈. 이때 상세 링크에 날짜를 넣는 형식 확인.
3. **설계 검토**: `bujamap-vercel`의 네이버 부동산 수집 방식(Playwright 세션 안에서 내부 API 호출, 지터·재시도·서킷브레이커, 자택 IP 실행)을 참고. 스텔스 옵션은 가져오지 않음. API/MCP 연동 가능성과 Claude 브라우저 조작의 장단점을 조사해 계획서에 정리.
4. **새로 구현** (기존 Streamlit 스크립트는 삭제하고 Next.js로 새로 작성):
   - `lib/schema.ts`: zod 스키마 하나로 수집기·ingest·대시보드를 검증
   - `collector/`: Playwright 수집기(로컬 Chrome 영속 프로필), 병합 저장, 실행 로그, 수동 수집 JSON을 넣는 `ingest`
   - `components/HotelTable.tsx`, `app/page.tsx`: 필터·정렬 대시보드 (URL 쿼리로 필터 상태 공유)
5. **야놀자 어댑터 다듬기**:
   - 화면이 쓰는 내부 목록 API를 페이지 안에서 직접 호출. 본문에 날짜가 들어가므로 캘린더 조작이 필요 없음.
   - 요청 본문 필드가 하나라도 빠지면 400이 나서, 화면이 보내는 구조를 그대로 재현.
   - 대실이 예약마감이면 항목 전체를 버리던 버그를 수정 (숙박이 판매 중인 숙소가 누락됐음, 52곳 → 57곳).
   - 응답 구조가 기대와 다른 항목이 10%를 넘으면 경고.
   - 주소는 상세 페이지 판매자 정보의 "사업자주소"만 사용, 한 번 얻은 주소는 재사용.
6. **GitHub Pages 배포**: 정적 export 전환, `StaleBadge`(24시간 경과 경고)를 클라이언트로 분리, `noindex`, GitHub Actions 워크플로(테스트 → 빌드 → 배포). 리포를 public으로 전환하고 Pages를 활성화한 뒤 푸시. 배포 URL에서 57곳 표시, 필터 동작, 404 없음을 확인.

7. **로그인·탐색 버튼·정렬 (2026-09-22)**: 참조 리포(`buja-map-vercel`)의 Firebase Auth(Google 팝업) 방식을 따라 정적 Pages에서 로그인. 버튼은 Firestore `searchJobs/{uid}`에 요청을 쓰고, 자택 PC `npm run worker`가 감시·수집해 `searchResults/{uid}`에 결과를 쓴다(GitHub self-hosted runner는 public 리포 위험으로 채택 안 함). 허용 계정은 `jongyouna@gmail.com` 하나(규칙 + `lib/auth.ts` + 워커가 Firebase Auth로 재확인). 지역·체크인·체크아웃·최대가를 입력칸으로 받음. 표는 열 제목 클릭으로 오름/내림차순. 수집 실행부를 `collector/collect.ts`(`runCollect`)로 분리해 CLI·워커가 공유. Authorized domains에 `jongyouna.github.io`는 이미 등록돼 있음.
8. **네이버 지도 즐겨찾기 가격 비교 시도, aside 브라우저 핸드오프 설계 (2026-09-23)**: 크롬 데스크탑 내장 브라우저·크롬 클로드 플러그인(home pc) 둘 다로 `map.naver.com`/`pcmap.place.naver.com` 접속 시도, 둘 다 `"This site is not allowed due to safety restrictions"`로 차단 확인 (권한 요청 팝업도 안뜸, 사용자 쪽 설정으로 해제 불가한 하드코드 정책으로 보임). 대안으로 파일 기반 핸드오프 설계: 이 세션이 `aside-request.md`에 막힌 작업을 적으면, 그 사이트에 접근 가능한 별도 주체("aside 브라우저" — 사용자 본인 또는 다른 세션)가 처리 후 `aside-result.md`에 결과를 남기고, 이 세션이 다시 읽어 이어간다. 절차·템플릿은 `docs/aside-browser-handoff.md`. 두 파일은 검색 이력 포함 가능해 `.gitignore` 등록, 커밋 안 함.
9. **네이버 지도 즐겨찾기 고성 숙소 가격 수집 완료 (2026-09-23)**: 사용자가 로그인한 네이버 세션을 활용하여 네이버 지도 저장 폴더('숙소', 416건) 중 강원도 고성군 소재 숙소 26곳을 필터링. 각 숙소의 2026-10-05 ~ 2026-10-06 (1박) 최저 가격, 예약 링크, 주소, 리뷰 및 비고 정보를 수집하여 `aside-result.md`로 정리 및 저장 완료.
10. **Antigravity `antigravity-naver-hotel` 스킬 편입 (2026-09-23)**: 위 수집 과정을 Antigravity(별도 에이전트)가 스킬로 정리(`.agents/skills/antigravity-naver-hotel/`, 글로벌 `~/.gemini/config/skills/`에도 존재). 이 세션(Claude Code)에서 바로 쓰도록 `.claude/skills/antigravity-naver-hotel/`로 복사. 절차는 Playwright `launchPersistentContext` + `.browser-profile` 기반 내부 API 직접 호출(북마크 `GET /p/api/bookmark`, 폴더 `GET /save-pages/api/maps-bookmark/v3/folders`, 호텔 `hotels.naver.com/.../rates`, 펜션 `map.naver.com/p/entry/place/{sid}` → `#entryIframe`) — 이번에 막혔던 크롬 확장 경로와 무관해 차단 회피 아님. 스킬이 언급하는 `npm run aside-collect` 스크립트는 `package.json`에 아직 없음(다음 할 일).
11. **`collector/sites/naver.ts` 정식 어댑터 편입 (2026-09-23)**: 위 스킬·`collector/aside-collect.ts`(Antigravity가 만든 1회성 스크립트)의 검증된 로직을 야놀자와 같은 `SiteAdapter` 인터페이스로 포팅. `lib/schema.ts`에 `SITES`·`SITE_LABEL`에 `naver` 추가(대시보드 필터 드롭다운에 자동 반영), `collector/collect.ts`의 `ADAPTERS`에 등록. 지역 검색이 아니라 로그인 계정 즐겨찾기 '숙소' 폴더 중 주소에 `--region`이 들어간 항목만 수집, 가격은 `pcmap.place.naver.com/accommodation/{sid}/room` 우선·실패 시 `hotels.naver.com/.../rates` 재시도, 가격 확인 안 되면(전화·SNS 예약 등) 제외. 즐겨찾기 API 응답 스키마는 계정마다 다를 수 있어 `extractBookmarks`로 느슨하게(재귀적으로) 파싱 — 야놀자처럼 zod로 강하게 고정하지 않음(0건이면 오류로 드러남). 단위 테스트 14개 추가(`collector/sites/naver.test.ts`), 전체 45개 통과, 타입체크 통과. **실제 브라우저로 돌려보진 않음** — 셀렉터·엔드포인트가 실관측(aside 수집 결과 링크 형식)과 스킬 문서 기준이라 사이트가 다르면 첫 실행에서 깨질 수 있음. `npm run lint` 재실행 결과 신규 파일은 깨끗하나 기존 `collector/aside-collect.ts`에 `no-explicit-any` 오류 4건·미사용 변수 경고 1건 있음(이번 작업 범위 밖, 손대지 않음).
12. **모바일 가로 스크롤 수정 (2026-09-23)**: `components/HotelTable.tsx`가 `overflow-x-auto` + `table min-w-[720px]`라 모바일(360~430px)에서 가로 스크롤이 강제되던 문제. `sm:`(640px) 미만에서는 카드형 세로 목록(`sm:hidden`)으로, 그 이상에서는 기존 표(`hidden sm:block`)로 분기. 카드에는 열 제목 클릭 정렬이 없어 카드 리스트 위에 `sm:hidden` 정렬 select + 방향 토글 버튼 추가(기존 `f.sort`/`f.dir`/`setF` 재사용, 새 로직 없음). 타입체크·테스트(45개) 통과. **실기기/실브라우저 좁은 뷰포트로 눈으로 확인은 안 함** — 다음 배포 전 개발자도구 375px 뷰포트 확인 권장.
13. **`taste-skill` 전역 설치 (2026-09-24)**: Trip-Planner 코드와 무관, 환경 설정. `https://github.com/Leonxlnx/taste-skill`(프론트엔드 디자인 타이스트 스킬 13종)을 `~/.claude/settings.json`에 마켓플레이스로 등록(`extraKnownMarketplaces.taste-skill` + `enabledPlugins["taste-skill@taste-skill"]`) — 기존 caveman·consulting·mkt-study(agentfiles)와 같은 방식. 리포에 정식 `.claude-plugin/marketplace.json` 있어 수동 폴더 복사(`antigravity-naver-hotel` 방식) 대신 이 경로 사용. 설치된 13개: `taste-skill`(기본, `design-taste-frontend` v2, VARIANCE/MOTION/DENSITY 다이얼), `taste-skill-v1`(구버전 하위호환), `brandkit`(브랜드킷 이미지), `brutalist-skill`(`industrial-brutalist-ui`), `gpt-tasteskill`(`gpt-taste`, GSAP 모션), `image-to-code-skill`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `minimalist-skill`(`minimalist-ui`), `output-skill`(`full-output-enforcement`, 코드 생략 금지), `redesign-skill`, `soft-skill`(`high-end-visual-design`), `stitch-skill`(`stitch-design-taste`, Google Stitch용 DESIGN.md). 메인 skill·`skill.sh`만 원문 확인(정상, 악성 코드 없음), 나머지 12개는 같은 리포·구조 기준으로 판단. **새 세션부터 반영, 이 세션엔 아직 스킬 목록에 안 뜸** — 재시작 후 `taste-skill:<폴더명>`로 로드되는지 확인 필요.
14. **`redesign-skill`로 대시보드 시각 리디자인 (2026-09-24)**: `/clear` 이후 새 세션에서도 `taste-skill:redesign-skill`이 "Unknown skill" — 확인해 보니 `~/.claude/settings.json`엔 등록만 됐고 `~/.claude/plugins/marketplaces/`·`cache/`·`known_marketplaces.json`엔 `taste-skill`이 아예 없음(caveman·consultant·agentfiles는 있음). 즉 노트 13의 "새 세션부터 반영"은 틀렸고, 마켓플레이스 동기화는 Claude Code 자체 업데이트 루틴이 처리해서 이 세션 도구로는 강제할 수 없음(원인 미해결, 다음 할 일 7 참고). 우회: GitHub에서 `skills/redesign-skill/SKILL.md`(`name: redesign-existing-projects`) 원문을 직접 읽어 그 지침을 코드에 그대로 적용 — 플러그인 로드 여부와 결과는 동일. 대시보드가 마케팅 페이지가 아니라 데이터 대시보드라 스킬의 히어로·패럴렉스·캐러셀·프라이싱 테이블·배경사진 항목은 스킵하고, 타이포·색상(단일 액센트)·인터랙션 상태·컴포넌트 정리만 적용:
    - **버그 수정**: `app/globals.css`의 `body { font-family: Arial, Helvetica, sans-serif }`가 `layout.tsx`가 로드한 Geist를 덮어써서 실제로 한 번도 적용된 적 없었음 → `var(--font-sans)` 참조로 수정.
    - `app/globals.css`에 액센트 CSS 변수(`--accent`/`--accent-foreground`/`--accent-soft`, 라이트=teal-600, 다크=teal-400 계열) 추가, `@theme inline`에 등록해 `bg-accent`/`text-accent`/`border-accent` 유틸리티로 씀. 기존에 뒤섞여 있던 파란 링크(`text-blue-600`)·검정 버튼(`bg-zinc-900`)을 이 액센트로 통일. 앰버(경고)·빨강(에러)은 상태색이라 그대로 둠. 배경은 순수 `#ffffff` → `#fafafa`(zinc-50)로.
    - `lib/ui.ts` 신설: `HotelTable.tsx`·`SearchPanel.tsx`·`AuthButton.tsx`에 중복돼 있던 `inputClass`/버튼/링크/카드/패널 스타일 문자열을 한곳에 모음(로직 없음, 상수만).
    - `components/icons.tsx` 신설: 새 아이콘 라이브러리 추가 없이 정렬 화살표(▲▼ 이모지 → SVG 쉐브론)·예약 링크 외부링크 아이콘을 손으로 그린 인라인 SVG로.
    - 버튼/링크/테이블 행에 hover·active(`scale-[0.98]`)·`focus-visible:ring` 추가(포커스 링은 이전엔 전무 — 키보드 접근성 개선). 가격·리뷰수·날짜 등 숫자 칼럼에 `tabular-nums`.
    - 섹션 간 여백(`gap-4`→`gap-6`, 필터 그리드 `gap-3`→`gap-4`), 빈 상태 문구에 액센트 점 하나 추가.
    - 데이터 로직(`lib/*`, `collector/*`, nuqs 필터·정렬, Firebase auth)은 전혀 건드리지 않음. 새 UI 라이브러리·Tailwind 버전 변경 없음(`redesign-skill` 규칙대로 기존 스택 유지).
    - 검증: `npm run typecheck`·`npm test`(45개 통과)·`npm run lint`(클린)·`npm run build`(정적 export 통과) 전부 통과. Chrome으로 `npm run dev` 직접 열어 다크 모드 데스크톱 화면 확인(액센트·아이콘·hover 정상 렌더). **라이트 모드·375px 모바일 폭은 브라우저 자동화 도구 제약(리사이즈가 실제 뷰포트에 반영 안 됨)으로 눈으로 확인 못 함** — CSS 값 자체는 정의돼 있고 breakpoint 로직(`sm:hidden`/`hidden sm:block`)은 안 건드렸으니 노트 12에서 이미 확인된 그대로일 것으로 보이나, 배포 전 실기기/개발자도구로 재확인 권장.
    - 커밋은 안 함 — 작업 트리에만 반영, 사용자 확인 후 커밋 여부 결정.
15. **Google 로그인 → 이메일/비밀번호 로그인 전환 (2026-09-24)**: 사용자 요청. 목적은 "Firestore 등 외부 설정 최소화"였는데, 확인해 보니 Firestore 규칙·서비스 계정 키·자택 PC 워커는 "최저가 탐색" job-queue(`searchJobs`/`searchResults`)용이라 로그인 방식과 무관 — 바꿔도 그대로 필요함을 사용자에게 확인받고, "로그인 방식만 교체"로 스코프 확정(실제로 없어지는 건 Google Cloud OAuth 동의 화면 설정과 팝업 관련 이슈뿐).
    - `components/AuthProvider.tsx`: `signInWithPopup(GoogleAuthProvider)` → `signInWithEmailAndPassword`. `signIn()` 시그니처가 `signIn(email, password)`로 바뀜.
    - `components/AuthButton.tsx`: 원클릭 버튼 → 헤더에 이메일·비밀번호 인라인 폼(제출 시 로딩 disable, 에러는 폼 아래 표시). 로그인된 상태 UI는 그대로.
    - `components/SearchPanel.tsx`: 자체 로그인 버튼 제거, "상단에서 로그인하세요" 안내 문구만 남김(로그인 폼을 한 곳에만 두기 위함). `authError` 관련 코드도 정리.
    - `lib/auth.ts`: `authErrorMessage`를 이메일/비밀번호 에러 코드(`invalid-credential`/`wrong-password`/`user-not-found`/`invalid-email`/`too-many-requests`) 기준으로 재작성, 팝업 전용 `SILENT_CODES`·`unauthorized-domain` 케이스 제거. 반환 타입이 `string | null` → `string`(더 이상 무시할 팝업 취소 케이스가 없음).
    - `docs/firebase-setup.md`: 1회 설정에 "이메일/비밀번호 제공자 켜기" + "Authentication > Users에서 계정 수동 생성"(허용 이메일은 `ALLOWED_EMAILS`와 동일해야 함, 앱 안에 회원가입 화면 없음) 단계 추가, Google 제공자 관련 문구 제거.
    - `ALLOWED_EMAILS` 권한 검사, Firestore 규칙, 서비스 계정 키, `collector/worker.ts`는 그대로.
    - 검증: typecheck·lint(변경 파일 기준 클린, `aside-collect.ts` 기존 오류는 무관)·테스트 45개(로그인 오류 메시지 테스트 케이스 갱신)·정적 export 빌드 전부 통과. Chrome으로 `npm run dev` 열어 실제 잘못된 자격 증명 제출 → "이메일 또는 비밀번호가 올바르지 않습니다" 에러가 실제 Firebase 응답으로 뜨는 것까지 확인(=SDK 호출 자체는 정상 동작).
    - 커밋·푸시·배포 완료. 이후 사용자가 Firebase 콘솔에서 이메일/비밀번호 제공자를 켰다고 확인 — 배포 사이트(`https://jongyouna.github.io/Trip-Planner/`)에서 존재하지 않는 이메일로 로그인 시도해 에러가 `auth/operation-not-allowed`(제공자 꺼짐)가 아니라 "이메일 또는 비밀번호가 올바르지 않습니다"(제공자 켜짐 + invalid-credential)로 뜨는 것으로 간접 확인(실제 비밀번호는 입력 금지 규칙상 대신 로그인해 보지 않음 — 본인 계정 로그인 자체는 사용자가 직접 확인해야 함).
16. **탐색 권한 이메일 변경: `jongyouna@gmail.com` → `jongyouna@naver.com` (2026-09-24)**: `lib/auth.ts`의 `ALLOWED_EMAILS`, `lib/jobs.test.ts`의 관련 테스트, `docs/firebase-setup.md`의 안내 문구를 새 이메일로 교체. `docs/firebase-setup.md`에 적혀 있듯 이메일이 같아야 하는 세 곳 중 이 리포가 관리하는 두 곳(`ALLOWED_EMAILS`, 문서)만 고쳤고, 나머지 두 가지는 이 리포 밖 — **사용자가 직접 해야 함**: (1) `buja-map-vercel/firestore.rules`의 `isRootAdmin()` 정의를 `jongyouna@naver.com` 기준으로 갱신하고 콘솔에 재게시, (2) Firebase Authentication > Users에서 `jongyouna@naver.com` 계정을 새로 만들거나 기존 `jongyouna@gmail.com` 계정 이메일을 변경(둘 다 두면 예전 계정으로는 이제 권한 화면 검사만 통과 못 하고 로그인 자체는 되니, 안 쓰는 계정은 정리 권장). 검증: typecheck·테스트 45개(갱신된 케이스 포함) 통과. 커밋·푸시는 사용자 확인 후.

## 확인된 사실

- 야놀자 목록: `POST /discovery/api/list/universal-search/v2/list`. `priceRange` 필터는 서버에서 적용되지 않는 것으로 보여 가격 조건은 응답을 받은 뒤 코드에서 거른다.
- 야놀자 주소: `GET /stay/api/trpc/stay.properties.getSellerInfo`의 "사업자주소". 체인 본사 주소일 수 있어 실제 숙소 위치와 다를 수 있다. 대표자명·연락처·이메일은 읽지도 저장하지도 않는다.
- 야놀자 상세 링크: `https://nol.yanolja.com/stay/domestic/{숙소ID}?adultCount=2&checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD`
- 가격은 대부분 "회원가"이고 시점에 따라 바뀐다 (위드 무인텔: 9/20 확인 40,000원 → 9/21 수집 39,000원).
- Trip.com 목록 URL에는 도시·날짜가 들어간다 (`cityId=72363`이 포천).

## API/MCP 연동 조사 결과

| 대상 | 결과 |
|---|---|
| 야놀자 | 공개 가격 조회 API 못 찾음 (제휴는 숙소 사업자용) |
| 여기어때 | 마케팅 파트너(제휴 링크)만 확인, 가격 조회 API 아님 |
| Trip.com / Agoda | 어필리에이트 API 존재, 파트너 승인 필요 (조건 미확인) |
| 네이버 호텔 | 공개 API 못 찾음, 확장에서 접근 차단 |
| 한국관광공사 TourAPI | 숙박 기본정보만 제공, 가격·예약 없음 (주소·좌표 보강용 후보) |
| 카카오 PlayMCP | KakaoMap(장소검색·길찾기)만 연결, 숙박 가격 없음 |

결론: 국내 숙박 가격은 공식 API가 사실상 없어 브라우저 수집이 현실적이다. 야놀자·여기어때 사이 API 크롤링 유죄 판결 보도가 검색에 나왔으나 원문은 확인하지 못했다. 개인용·저빈도 원칙을 유지하고 사이트 약관을 확인한다.

## Claude 브라우저 조작 장단점 (이번에 겪은 것)

- 장점: 스크립트 없이 바로 시작, 새 사이트 탐색이 유연, 로그인된 실제 Chrome 사용, 화면을 보고 예외에 대응.
- 단점: 탭 그룹 끊김, 스크린샷 타임아웃, 작은 뷰포트로 목록 스크롤 실패, 캘린더 "적용하기" 미반영, 느림, 대화가 있어야 실행(무인 반복 불가), 사이트별 차단, `javascript_tool`의 쿠키·쿼리 문자열 차단.
- 분담: 탐색·예외 처리는 Claude 브라우저, 반복 수집은 Playwright 스크립트.

## 막힌 점 / 알려진 문제

- **Trip.com**: 처음 10건은 서버 렌더링된 화면에서 읽히지만, 스크롤해서 다음 페이지를 불러오면 목록이 "결과 0개"로 리셋됨. 자동화 Chrome에서 관찰된 현상이며 차단인지 로딩 문제인지 확인되지 않아 우회하지 않고 멈췄다.
- **지역 오염**: 키워드 검색이 이름이 비슷한 다른 지역 숙소까지 가져온다 (예: 경북 성주의 "성주 소풍 무인텔"). 현재 공개 데이터에도 포함돼 있다.
- **비공식 API**: 야놀자 내부 API는 바뀌면 깨질 수 있다.
- **lint**: 배포 직전 최종 코드로는 다시 실행하지 못했다 (PC 메모리·디스크 부하). 이전 실행에서는 오류 없음.
- **공개 범위**: 리포와 `data/hotels.json`이 모두 공개돼 있다. `noindex`는 검색 노출만 줄인다.

## 다음 할 일

0. 로그인·탐색 실환경 검증: `buja-map-vercel/firestore.rules`에 `searchJobs`·`searchResults` 블록 병합·게시, 서비스 계정 키 발급(리포 밖 보관), `npm run worker` 실행 후 웹에서 탐색. 다박(2박 이상) 검색 시 야놀자 `discountPrice`가 1박 기준인지 합계인지 확인(`price`는 "1박 총액" 의미).
1. 지역 필터: 주소에 지역명이 포함된 숙소만 남기고 재수집 후 푸시.
2. Trip.com 다음 페이지 문제 원인 확인 (사용자 Chrome에서 직접 열어 동작 비교 등). 막히면 야놀자만 유지.
3. 다른 날짜·지역 수집 (같은 사이트·숙소·날짜는 덮어쓰고 날짜가 다르면 별개 항목으로 누적).
4. 필요하면 TourAPI·KakaoMap으로 주소·좌표 보강.
5. `npm run collect -- --sites naver`로 실제 실행 검증 (로그인 세션·셀렉터·엔드포인트가 실사이트와 맞는지). 깨지면 `collector/sites/naver.ts`의 `fetchBookmarks`/`fetchPriceInfo` 점검.
6. `collector/aside-collect.ts`의 lint 오류(no-explicit-any 4건) 정리하거나, naver 어댑터로 완전히 대체됐으면 파일 삭제 검토.
7. (Trip-Planner 코드 무관, 환경) `taste-skill` 마켓플레이스가 `~/.claude/settings.json`엔 등록됐지만 실제 캐시·동기화가 안 되는 문제 원인 파악 — Claude Code 업데이트/재시작으로 해결되는지, 아니면 수동 `marketplace add`가 필요한지 확인.
8. 이번 리디자인 라이트 모드·375px 모바일 화면 실제로 눈으로 확인(개발자도구 또는 실기기) — 브라우저 자동화로는 확인 못 함(위 14번 참고).
9. (완료 확인됨, 2026-09-24) Firebase 이메일/비밀번호 제공자 활성화 — 배포 사이트에서 간접 확인.
10. `jongyouna@naver.com`으로 실제 로그인되는지 사용자가 직접 확인(계정이 그 이메일로 있는지, 위 16번 두 가지 리포 밖 작업 포함) — 비밀번호 대행 입력 금지 규칙상 이 세션에서는 확인 불가.
11. `buja-map-vercel/firestore.rules`의 `isRootAdmin()`을 `jongyouna@naver.com` 기준으로 갱신·재게시(위 16번, 이 리포 밖).

## 운영 메모

- 데이터 갱신: 로컬에서 `npm run collect ...` → `git add data/hotels.json && git commit && git push` → Actions가 자동 재배포. 수집은 로그인 세션과 자택 IP가 필요해 Actions에서 돌리지 않는다.
- 이번 작업 중 겪은 일: 파일 복사 중 로컬 `.git`이 덮어써졌지만 원격에서 다시 받아 복구했다 (원격 이력 영향 없음). 빌드 중 PC 메모리 부족으로 백그라운드 작업이 두 차례 자동 중단됐다 (빌드 전 WSL·Chrome 종료 권장).
