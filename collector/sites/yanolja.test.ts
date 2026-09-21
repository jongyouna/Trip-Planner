import { describe, expect, it } from "vitest";
import { HotelSchema } from "../../lib/schema";
import { toHotel, yanoljaUrl } from "./yanolja";

const q = { region: "포천", checkin: "2026-09-23", checkout: "2026-09-24", maxPrice: 50000 };
const at = "2026-09-21T03:00:00.000Z";

/** 실제 목록 API 응답에서 관찰한 productItem 구조 */
const item = (over: Record<string, unknown> = {}) => ({
  productItem: {
    id: "10044585",
    title: "포천 에이스 드라이브인 무인텔",
    review: { score: "4.6", count: "1,420" },
    prices: [
      { discountPrice: "27,000", infoText: "대실 4시간", priceBadgeInfo: { text: "회원가" } },
      { discountPrice: "33,000", infoText: "숙박 17:00~", priceBadgeInfo: { text: "회원가" } },
    ],
    serverLogMeta: { hasStayInventory: true },
    ...over,
  },
});

describe("yanolja toHotel", () => {
  it("숙박 가격을 골라 스키마에 맞는 Hotel로 변환한다", () => {
    const r = toHotel(item(), q, at);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(HotelSchema.safeParse(r.hotel).success).toBe(true);
    expect(r.hotel.price).toBe(33000);
    expect(r.hotel.reviewCount).toBe(1420);
    expect(r.hotel.priceNote).toBe("회원가, 숙박 17:00~");
    expect(r.hotel.url).toBe(yanoljaUrl("10044585", "2026-09-23", "2026-09-24"));
  });

  it("최대 가격을 넘으면 filtered", () => {
    const r = toHotel(item({ prices: [{ discountPrice: "99,000", infoText: "숙박 15:00~" }] }), q, at);
    expect(r.kind).toBe("filtered");
  });

  it("대실 가격만 있으면 filtered", () => {
    const r = toHotel(item({ prices: [{ discountPrice: "20,000", infoText: "대실 4시간" }] }), q, at);
    expect(r.kind).toBe("filtered");
  });

  it("대실이 예약마감이어도 숙박이 판매 중이면 수집한다", () => {
    const r = toHotel(
      item({
        prices: [
          { infoText: "대실", originPriceNote: "판매가 20,000", closedInformation: "예약마감" },
          { discountPrice: "40,000", infoText: "숙박 15:00~", priceBadgeInfo: { text: "회원가" } },
        ],
      }),
      q,
      at,
    );
    expect(r.kind === "ok" && r.hotel.price).toBe(40000);
  });

  it("숙박이 예약마감·문의면 filtered", () => {
    const r = toHotel(
      item({ prices: [{ infoText: "숙박", originPriceNote: "숙소에 문의", closedInformation: "예약마감" }] }),
      q,
      at,
    );
    expect(r.kind).toBe("filtered");
  });

  it("상품이 아닌 블록은 filtered", () => {
    expect(toHotel({}, q, at).kind).toBe("filtered");
  });

  it("응답 구조가 다르면 invalid", () => {
    expect(toHotel({ productItem: { id: 1 } }, q, at).kind).toBe("invalid");
    expect(toHotel(null, q, at).kind).toBe("invalid");
  });

  it("리뷰가 없어도 변환한다", () => {
    const r = toHotel(item({ review: null }), q, at);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.hotel.reviewScore).toBeNull();
      expect(r.hotel.reviewCount).toBeNull();
    }
  });

  it("재고 없음이면 available=false", () => {
    const r = toHotel(item({ serverLogMeta: { hasStayInventory: false } }), q, at);
    expect(r.kind === "ok" && r.hotel.available).toBe(false);
  });
});
