import {
  BlockedError,
  type SearchQuery,
  type SearchResult,
  type SiteAdapter,
  jitter,
  sleep,
  withRetry,
} from "../core";
import type { Hotel } from "../../lib/schema";

const BOOKMARK_PAGE = "https://map.naver.com/p/bookmark";
const BOOKMARK_API = "/p/api/bookmark";
/**
 * 숙소 사이 지연. 2초 간격·동시 2개로 돌리면 네이버가 `errorCode: 408`로 제한해서(2026-10-06 관찰)
 * 한 번에 1곳, 6초 기준으로 늦췄다(jitter 적용).
 */
const DETAIL_DELAY_MS = 6000;
const LOGIN_WAIT_MS = 120_000;
const LOGIN_POLL_MS = 1500;

const ACCOMMODATION_KEYWORDS = [
  "숙소",
  "호텔",
  "모텔",
  "펜션",
  "리조트",
  "게스트하우스",
  "민박",
  "풀빌라",
  "글램핑",
  "캠핑",
  "콘도",
  "스테이",
  "한옥",
  "hotel",
  "resort",
  "motel",
  "stay",
];


export interface BookmarkItem {
  id: string;
  name: string;
  mcid: string | null;
  address: string | null;
}

export interface PriceInfo {
  amount: number | null;
  note: string | null;
  url: string;
  reviewScore: number | null;
  reviewCount: number | null;
}

export type ParsedItem = { kind: "ok"; hotel: Hotel } | { kind: "filtered" };

/**
 * 상세/객실 페이지. 캘린더 조작 없이 날짜를 쿼리로 바로 넣는다. 파라미터는 `checkin`/`checkout`(YYYYMMDD)/`guest`다.
 * 예전 `startDate`/`endDate`는 날짜가 반영되지 않는다(2026-10-06 확인: "일정선택"이 비고 가격이 범위로 나옴).
 */
export function naverPlaceUrl(sid: string, checkin: string, checkout: string): string {
  const compact = (d: string) => d.replaceAll("-", "");
  return `https://pcmap.place.naver.com/accommodation/${sid}/room?checkin=${compact(checkin)}&checkout=${compact(checkout)}&guest=2`;
}

/** 체인 호텔/리조트는 네이버호텔 실시간 가격비교로 뜨는 경우가 있다(펜션 페이지에 가격이 없을 때 시도). */
export function naverHotelUrl(sid: string, checkin: string, checkout: string): string {
  return `https://hotels.naver.com/accommodation/search/detail/domestic/${sid}/rates?dAdultCnt=2&dCheckIn=${checkin}&dCheckOut=${checkout}`;
}

/** 객실 목록에서 가격만 한 줄을 차지하는 경우("179,000원"). 설명 문구 속 금액("최대 5,221원 적립")과 구분한다. */
const PRICE_LINE_RE = /^(\d{1,3}(?:,\d{3})+)원$/;
/** 네이버호텔이 해당 일정에 객실이 없을 때 쓰는 문구. 이때 화면의 `N원~`은 추천 호텔 가격이다. */
const NO_ROOMS_RE = /예약\s*가능한\s*객실\s*(?:이\s*)?없/;

const toWon = (s: string) => Number.parseInt(s.replace(/,/g, ""), 10);

/** 날짜가 반영된 객실 목록(pcmap `/room`)에만 나오는 문구. 호텔·리조트는 `/room`이 홈으로 리다이렉트돼 이 문구가 없다. */
const ROOM_RESULT_MARKER = "선택하신 조건";
/** 네이버호텔 헤더의 해당 일정 1박 최저가: "104,429원\n전체 가격 비교하기". */
const HOTEL_HEADER_PRICE_RE = /(\d{1,3}(?:,\d{3})+)원\s*\n\s*전체 가격 비교하기/;

function minPriceLine(text: string): number | null {
  const prices = text
    .split("\n")
    .map((l) => l.trim().match(PRICE_LINE_RE))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => toWon(m[1]))
    .filter((n) => n > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * 객실 페이지(pcmap `/room`)에서 그 날짜의 1박 최저가. 제외 대상이면 null.
 * - 날짜가 반영된 목록("선택하신 조건…")이 아니면 null: 홈으로 리다이렉트된 페이지의 쿠폰·광고 금액을 가격으로 읽지 않는다.
 * - 가격만 있는 줄 중 최저가. 일부 객실만 "예약마감"이어도 나머지 객실이 팔리면 예약 가능하다.
 */
export function parseRoomPagePrice(text: string): number | null {
  const k = text.indexOf(ROOM_RESULT_MARKER);
  if (k < 0) return null;
  const end = text.indexOf("이용약관", k);
  return minPriceLine(text.slice(k, end < 0 ? undefined : end));
}

/**
 * 네이버호텔 `/rates` 본문에서 그 날짜의 1박 최저가(세금 포함). 제외 대상이면 null.
 * - "예약 가능한 객실 없음"이면 null(화면의 `N원~`은 추천 호텔 가격).
 * - 객실 줄이 아니라 헤더 가격을 쓴다: 본문엔 다른 날짜 가격 등 가격 줄이 더 있어 최저값이 어긋난다.
 */
export function parseHotelPagePrice(text: string): number | null {
  if (NO_ROOMS_RE.test(text)) return null;
  const m = text.match(HOTEL_HEADER_PRICE_RE);
  if (!m) return null;
  const n = toWon(m[1]);
  return n > 0 ? n : null;
}

/**
 * `mcid`(네이버 place 카테고리 코드)가 있으면 그걸로, 없으면 이름 키워드로 숙소 여부를 판단한다.
 * `ACCOMMODATION` 외 다른 mcid가 명시돼 있으면 주차장·편의시설 등으로 보고 제외한다.
 */
export function isAccommodationBookmark(item: Pick<BookmarkItem, "name" | "mcid">): boolean {
  if (item.mcid) return item.mcid === "ACCOMMODATION";
  const text = item.name.toLowerCase();
  return ACCOMMODATION_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * 즐겨찾기 동기화 응답(`GET /p/api/bookmark`)에서 장소 항목을 재귀적으로 뽑는다.
 * 정확한 폴더·필드 구조가 계정/버전마다 달라질 수 있어 스키마를 강하게 고정하지 않고,
 * `name`+`sid`(또는 `id`) 짝이 보이면 항목으로 본다. 항목이 하나도 안 잡히면 API 구조가
 * 바뀐 것이므로 `fetchBookmarks`에서 오류로 드러난다.
 */
export function extractBookmarks(json: unknown): BookmarkItem[] {
  const out = new Map<string, BookmarkItem>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.placeName;
    const id = o.sid ?? o.placeId ?? o.id;
    if (typeof name === "string" && name.trim() && (typeof id === "string" || typeof id === "number")) {
      const idStr = String(id);
      if (!out.has(idStr)) {
        const mcid = typeof o.mcid === "string" ? o.mcid : null;
        const address =
          typeof o.address === "string" ? o.address : typeof o.roadAddress === "string" ? o.roadAddress : null;
        out.set(idStr, { id: idStr, name, mcid, address });
      }
    }
    for (const v of Object.values(o)) visit(v);
  };
  visit(json);
  return [...out.values()];
}

/** 가격이 확인 안 되면(전화·SNS 예약, 공공캠핑 전용 시스템, 예약 마감 등) 제외한다 — CLAUDE.md 결과 보고 규칙과 동일 원칙. */
export function toHotel(item: BookmarkItem, price: PriceInfo, q: SearchQuery, collectedAt: string): ParsedItem {
  if (price.amount === null) return { kind: "filtered" };
  if (price.amount > q.maxPrice) return { kind: "filtered" };
  const hotel: Hotel = {
    site: "naver",
    siteHotelId: item.id,
    name: item.name,
    region: q.region,
    address: item.address,
    checkin: q.checkin,
    checkout: q.checkout,
    price: price.amount,
    priceNote: price.note,
    reviewScore: price.reviewScore,
    reviewScoreMax: 5,
    reviewCount: price.reviewCount,
    url: price.url,
    available: true,
    collectedAt,
  };
  return { kind: "ok", hotel };
}

/** 로그인 세션(`.browser-profile/`)이 없으면 브라우저 창(headless: false)에서 사용자가 직접 로그인할 때까지 기다린다. */
async function ensureLoggedIn(page: import("playwright").Page, log: (msg: string) => void): Promise<void> {
  const resp = await page.goto(BOOKMARK_PAGE, { waitUntil: "domcontentloaded" }).catch(() => null);
  if (resp && (resp.status() === 403 || resp.status() === 429)) {
    throw new BlockedError(`네이버 지도 접근 ${resp.status()}`);
  }

  const hasLogin = async () => {
    const cookies = await page.context().cookies("https://naver.com");
    return cookies.some((c) => c.name === "NID_AUT");
  };
  if (await hasLogin()) return;

  log("네이버 로그인이 안 되어 있음 — 열린 브라우저 창에서 직접 로그인해주세요 (최대 2분 대기).");
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(LOGIN_POLL_MS);
    if (await hasLogin()) {
      log("네이버 로그인 확인됨.");
      return;
    }
  }
  throw new Error("네이버 로그인 대기 시간 초과. 로그인 후 다시 실행해주세요.");
}

async function fetchBookmarks(page: import("playwright").Page): Promise<BookmarkItem[]> {
  const res = await page.evaluate(async (api) => {
    const r = await fetch(api, { credentials: "include" });
    return { status: r.status, text: await r.text() };
  }, BOOKMARK_API);
  if (res.status === 403 || res.status === 429) throw new BlockedError(`네이버 즐겨찾기 API ${res.status}`);
  if (res.status !== 200) throw new Error(`네이버 즐겨찾기 API ${res.status}: ${res.text.slice(0, 200)}`);
  const items = extractBookmarks(JSON.parse(res.text));
  if (items.length === 0) throw new Error("네이버 즐겨찾기 API 응답에서 항목을 하나도 못 읽음 — 구조 변경 가능성, 어댑터 점검 필요");
  return items.filter(isAccommodationBookmark);
}

async function scanPriceOnCurrentPage(
  page: import("playwright").Page,
  parse: (text: string) => number | null,
): Promise<{ amount: number | null; note: string | null }> {
  const bodyText: string = await page.evaluate(() => document.body.innerText).catch(() => "");
  const amount = parse(bodyText);
  let note: string | null = null;
  if (amount !== null) {
    if (/회원가|회원\s*할인/.test(bodyText)) note = "회원가";
    if (/네이버페이|Npay/.test(bodyText)) note = note ? `${note}, 네이버페이 가능` : "네이버페이 가능";
  }
  return { amount, note };
}

async function fetchPriceInfo(
  page: import("playwright").Page,
  item: BookmarkItem,
  checkin: string,
  checkout: string,
): Promise<PriceInfo> {
  const placeUrl = naverPlaceUrl(item.id, checkin, checkout);
  const resp = await page.goto(placeUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
  if (resp && (resp.status() === 403 || resp.status() === 429)) throw new BlockedError(`네이버 플레이스 ${resp.status()}`);
  await page.waitForTimeout(2500);

  let { amount, note } = await scanPriceOnCurrentPage(page, parseRoomPagePrice);
  let url = placeUrl;

  // 펜션 페이지에 가격이 없으면(체인 호텔·리조트 등) 네이버호텔 가격비교를 시도한다.
  if (amount === null) {
    const hotelUrl = naverHotelUrl(item.id, checkin, checkout);
    const hResp = await page.goto(hotelUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    if (hResp && (hResp.status() === 403 || hResp.status() === 429)) throw new BlockedError(`네이버호텔 ${hResp.status()}`);
    if (hResp && hResp.status() === 200) {
      await page.waitForTimeout(2500);
      const scanned = await scanPriceOnCurrentPage(page, parseHotelPagePrice);
      if (scanned.amount !== null) {
        amount = scanned.amount;
        note = scanned.note;
        url = hotelUrl;
      }
    }
  }

  let reviewScore: number | null = null;
  let reviewCount: number | null = null;
  try {
    const scoreText = await page.locator("span[class*='score'], em[class*='score']").first().textContent({ timeout: 1000 });
    if (scoreText) {
      const s = Number.parseFloat(scoreText.replace(/[^\d.]/g, ""));
      if (Number.isFinite(s)) reviewScore = s;
    }
  } catch {}
  try {
    const countText = await page
      .locator("a[href*='review'] em, span[class*='review'] em")
      .first()
      .textContent({ timeout: 1000 });
    if (countText) {
      const c = Number.parseInt(countText.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(c)) reviewCount = c;
    }
  } catch {}

  return { amount, note, url, reviewScore, reviewCount };
}

export const naver: SiteAdapter = {
  site: "naver",
  // opts(knownAddresses/fetchAddress)는 안 쓴다 — 주소는 즐겨찾기 항목에 이미 들어 있다.
  async search(page, q, _opts, log): Promise<SearchResult> {
    await ensureLoggedIn(page, log);

    const bookmarks = await withRetry(() => fetchBookmarks(page));
    log(`네이버 즐겨찾기 숙소 ${bookmarks.length}건`);

    const targets = q.region ? bookmarks.filter((b) => b.address?.includes(q.region)) : bookmarks;
    log(`지역(${q.region}) 필터 후 ${targets.length}건`);

    const collectedAt = new Date().toISOString();
    const hotels: Hotel[] = [];
    let skipped = 0;

    for (const [i, item] of targets.entries()) {
      if (i > 0) await sleep(jitter(DETAIL_DELAY_MS));
      try {
        const price = await withRetry(() => fetchPriceInfo(page, item, q.checkin, q.checkout), 2);
        const r = toHotel(item, price, q, collectedAt);
        if (r.kind === "ok") hotels.push(r.hotel);
        else skipped += 1;
      } catch (e) {
        if (e instanceof BlockedError) throw e;
        log(`가격 조회 실패 ${item.name}: ${e instanceof Error ? e.message : e}`);
        skipped += 1;
      }
    }

    log(`네이버: ${hotels.length}건 수집 (제외/확인불가 ${skipped})`);
    return { hotels, skipped };
  },
};
