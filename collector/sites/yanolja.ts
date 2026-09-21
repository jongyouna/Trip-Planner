import { z } from "zod";
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

const LIST_API = "/discovery/api/list/universal-search/v2/list";
const MAX_PAGES = 40;
const PAGE_DELAY_MS = 800;
/** 구조가 기대와 다른 항목이 이 비율을 넘으면 경고한다. */
const INVALID_WARN_RATIO = 0.1;
const ADDRESS_DELAY_MS = 600;

/** 우리가 쓰는 필드만 검증한다. 사이트가 필드를 바꾸면 여기서 항목 단위로 걸러진다. */
const ItemSchema = z.object({
  productItem: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    review: z.object({ score: z.string(), count: z.string() }).nullish(),
    prices: z.array(
      z.object({
        /** 예약마감·문의 항목에는 없다 */
        discountPrice: z.string().optional(),
        infoText: z.string(),
        priceBadgeInfo: z.object({ text: z.string() }).nullish(),
      }),
    ),
    serverLogMeta: z.object({ hasStayInventory: z.boolean().optional() }).nullish(),
  }),
});

const ResponseSchema = z.object({
  items: z.array(z.unknown()),
  paging: z.object({ isLast: z.boolean() }),
});

const SellerInfoSchema = z.array(
  z.object({
    result: z.object({
      data: z.object({
        json: z.array(z.object({ tableComponent: z.array(z.object({ title: z.string(), bodys: z.array(z.string()) })).optional() })),
      }),
    }),
  }),
);

const toInt = (s: string) => Number.parseInt(s.replace(/[^\d]/g, ""), 10);

/** 상세 링크. 날짜가 URL에 들어가는 형식(CLAUDE.md 참고). */
export function yanoljaUrl(id: string, checkin: string, checkout: string): string {
  return `https://nol.yanolja.com/stay/domestic/${id}?adultCount=2&checkInDate=${checkin}&checkOutDate=${checkout}`;
}

/** 사이트가 화면에서 보내는 요청 본문 그대로(관찰한 구조). 필드가 빠지면 400이 난다. */
export function requestBody(q: SearchQuery, page: number) {
  return {
    keyword: q.region,
    filter: {
      codeFilter: {
        reservationTypeCodes: [],
        starRatingCodes: [],
        accommodationCategoryCodes: [],
        amenitiesCodes: [],
        accommodationLocationCodes: [],
        maxRentHourCodes: [],
        accommodationPromotionCodes: [],
        leisureLocationCodes: [],
        leisureCategoryCodes: [],
        leisureBrandCodes: [],
        leisurePromotionCodes: [],
        entertainmentCategoryCodes: [],
        entertainmentRegionCodes: [],
        saleStatusCodes: [],
        entertainmentPropertyCodes: [],
        entertainmentTopingPaidMemberDiscount: false,
        entertainmentFutureShowDateCount: 0,
        nolWorldDomesticStay: { starRatingCodes: [], facilityCodes: [] },
      },
      rangeFilter: { priceRange: { from: 0, to: q.maxPrice }, entertainmentShowDateRanges: [] },
      productStatusFilter: { availableOnly: false },
      quickFilters: [],
      useDynamicFilter: false,
      globalAccommodationCodeFilter: { rateAmenityCodes: [], propertyBadgeCodes: [], propertyAmenityCodes: [] },
    },
    category: "PRODUCT_CATEGORY_KOREA_ACCOMMODATION",
    sort: "SORT_DEFAULT",
    localAccommodation: { checkInDate: q.checkin, checkOutDate: q.checkout, capacityAdults: 2, childrenAges: [] },
    globalAccommodation: { checkInDate: q.checkin, checkOutDate: q.checkout, rooms: [{ capacityAdults: 2, childrenAges: [] }] },
    disableSpellCorrection: false,
    page,
  };
}

export type ParsedItem = { kind: "ok"; hotel: Hotel } | { kind: "invalid" } | { kind: "filtered" };

/** 목록 응답 1건을 변환한다. invalid=응답 구조가 기대와 다름(사이트 변경 신호), filtered=숙박 가격 없음·조건 밖. */
export function toHotel(raw: unknown, q: SearchQuery, collectedAt: string): ParsedItem {
  // 상품이 아닌 블록(빈 객체 등)은 조건 밖으로 본다.
  if (typeof raw === "object" && raw !== null && !("productItem" in raw)) return { kind: "filtered" };
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid" };
  const p = parsed.data.productItem;
  const stay = p.prices.find((x) => x.infoText.startsWith("숙박"));
  // 숙박이 없거나 예약마감·문의(가격 없음)면 예약할 수 없으므로 제외한다.
  if (!stay?.discountPrice) return { kind: "filtered" };
  const price = toInt(stay.discountPrice);
  if (!Number.isFinite(price) || price <= 0) return { kind: "invalid" };
  if (price > q.maxPrice) return { kind: "filtered" };

  const score = p.review ? Number.parseFloat(p.review.score) : Number.NaN;
  const count = p.review ? toInt(p.review.count) : Number.NaN;
  const badge = stay.priceBadgeInfo?.text;

  const hotel: Hotel = {
    site: "yanolja",
    siteHotelId: p.id,
    name: p.title,
    region: q.region,
    address: null,
    checkin: q.checkin,
    checkout: q.checkout,
    price,
    priceNote: [badge, stay.infoText].filter(Boolean).join(", "),
    reviewScore: Number.isFinite(score) ? score : null,
    reviewScoreMax: 5,
    reviewCount: Number.isFinite(count) ? count : null,
    url: yanoljaUrl(p.id, q.checkin, q.checkout),
    available: p.serverLogMeta?.hasStayInventory !== false,
    collectedAt,
  };
  return { kind: "ok", hotel };
}

/**
 * 판매자 정보(tRPC)의 "사업자주소"만 꺼낸다. 대표자명·연락처·이메일 등은 읽지도 저장하지도 않는다.
 * 사업자주소는 체인 본사 주소일 수 있어 숙소 실제 주소와 다를 수 있다.
 */
export function parseSellerAddress(json: unknown): string | null {
  const parsed = SellerInfoSchema.safeParse(json);
  if (!parsed.success) return null;
  const rows = parsed.data[0]?.result.data.json.flatMap((b) => b.tableComponent ?? []) ?? [];
  const addr = rows.find((r) => r.title === "사업자주소")?.bodys[0]?.trim();
  return addr ? addr : null;
}

async function fetchAddress(page: import("playwright").Page, id: string): Promise<string | null> {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { stayId: Number(id) } } }));
  const res = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { status: r.status, text: await r.text() };
  }, `/stay/api/trpc/stay.properties.getSellerInfo?batch=1&input=${input}`);
  if (res.status === 403 || res.status === 429) throw new BlockedError(`야놀자 상세 API ${res.status}`);
  if (res.status !== 200) throw new Error(`야놀자 상세 API ${res.status}`);
  return parseSellerAddress(JSON.parse(res.text));
}

async function fetchPage(page: import("playwright").Page, q: SearchQuery, pageNo: number) {
  const res = await page.evaluate(
    async ({ api, body }) => {
      const r = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, text: await r.text() };
    },
    { api: LIST_API, body: requestBody(q, pageNo) },
  );
  if (res.status === 403 || res.status === 429) throw new BlockedError(`야놀자 목록 API ${res.status}`);
  if (res.status !== 200) throw new Error(`야놀자 목록 API ${res.status}: ${res.text.slice(0, 200)}`);
  return ResponseSchema.parse(JSON.parse(res.text));
}

export const yanolja: SiteAdapter = {
  site: "yanolja",
  async search(page, q, opts, log): Promise<SearchResult> {
    // 같은 출처에서 fetch해야 하므로 먼저 사이트를 연다.
    await page.goto(
      `https://nol.yanolja.com/discovery/list/search/PRODUCT_CATEGORY_KOREA_ACCOMMODATION?q=${encodeURIComponent(q.region)}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(2000);

    const collectedAt = new Date().toISOString();
    const hotels: Hotel[] = [];
    let skipped = 0;
    let invalid = 0;
    let seen = 0;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const data = await withRetry(() => fetchPage(page, q, pageNo));
      for (const raw of data.items) {
        seen += 1;
        const r = toHotel(raw, q, collectedAt);
        if (r.kind === "ok") hotels.push(r.hotel);
        else {
          skipped += 1;
          if (r.kind === "invalid") invalid += 1;
        }
      }
      log(`야놀자 ${pageNo}페이지: 누적 ${hotels.length}건 (제외 ${skipped})`);
      if (data.paging.isLast) break;
      await sleep(jitter(PAGE_DELAY_MS));
    }
    if (opts.fetchAddress) {
      let fetched = 0;
      for (const h of hotels) {
        const known = opts.knownAddresses.get(h.siteHotelId);
        if (known) {
          h.address = known;
          continue;
        }
        try {
          h.address = await withRetry(() => fetchAddress(page, h.siteHotelId), 2);
        } catch (e) {
          if (e instanceof BlockedError) throw e;
          log(`주소 조회 실패 ${h.name}: ${e instanceof Error ? e.message : e}`);
        }
        fetched += 1;
        await sleep(jitter(ADDRESS_DELAY_MS));
      }
      log(`야놀자 주소 조회 ${fetched}건, 캐시 사용 ${hotels.length - fetched}건, 주소 없음 ${hotels.filter((h) => !h.address).length}건`);
    }

    if (seen > 0 && invalid / seen > INVALID_WARN_RATIO) {
      log(`⚠ 야놀자: 응답 구조가 다른 항목 ${invalid}/${seen}건 — 사이트 변경 가능성, 어댑터 점검 필요`);
    }
    return { hotels, skipped };
  },
};
