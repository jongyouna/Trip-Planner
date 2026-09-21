import { describe, expect, it } from "vitest";
import { loadHotels } from "./data";
import { mergeHotels } from "./merge";
import { type Hotel, HotelSchema, hotelKey, score10 } from "./schema";

const base: Hotel = {
  site: "yanolja",
  siteHotelId: "1",
  name: "테스트 호텔",
  region: "포천",
  address: null,
  checkin: "2026-09-23",
  checkout: "2026-09-24",
  price: 40000,
  priceNote: null,
  reviewScore: 4.5,
  reviewScoreMax: 5,
  reviewCount: 10,
  url: "https://nol.yanolja.com/stay/domestic/1",
  available: true,
  collectedAt: "2026-09-21T03:00:00.000Z",
};

describe("schema", () => {
  it("유효한 숙소를 통과시킨다", () => {
    expect(HotelSchema.safeParse(base).success).toBe(true);
  });

  it("필수 필드 누락·잘못된 값은 거부한다", () => {
    expect(HotelSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
    expect(HotelSchema.safeParse({ ...base, url: "not-a-url" }).success).toBe(false);
    expect(HotelSchema.safeParse({ ...base, checkin: "9/23" }).success).toBe(false);
  });

  it("점수를 10점 만점으로 환산한다", () => {
    expect(score10(base)).toBe(9);
    expect(score10({ reviewScore: 8.4, reviewScoreMax: 10 })).toBe(8.4);
    expect(score10({ reviewScore: null, reviewScoreMax: 5 })).toBeNull();
  });
});

describe("mergeHotels", () => {
  it("같은 키는 새 값으로 덮어쓰고 다른 키는 유지한다", () => {
    const other: Hotel = { ...base, siteHotelId: "2" };
    const updated: Hotel = { ...base, price: 35000 };
    const merged = mergeHotels([base, other], [updated]);
    expect(merged).toHaveLength(2);
    expect(merged.find((h) => hotelKey(h) === hotelKey(base))?.price).toBe(35000);
  });

  it("날짜가 다르면 별개 항목이다", () => {
    const nextDay: Hotel = { ...base, checkin: "2026-09-24", checkout: "2026-09-25" };
    expect(mergeHotels([base], [nextDay])).toHaveLength(2);
  });
});

describe("data/hotels.json", () => {
  it("저장된 시드 데이터가 스키마를 통과한다", () => {
    const file = loadHotels();
    expect(file.hotels.length).toBeGreaterThan(0);
  });
});
