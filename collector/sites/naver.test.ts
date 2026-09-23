import { describe, expect, it } from "vitest";
import { HotelSchema } from "../../lib/schema";
import {
  extractBookmarks,
  isAccommodationBookmark,
  naverHotelUrl,
  naverPlaceUrl,
  parsePriceKRW,
  toHotel,
} from "./naver";

const q = { region: "강원 고성", checkin: "2026-10-05", checkout: "2026-10-06", maxPrice: 200000 };
const at = "2026-09-23T11:48:00.000Z";

describe("naver parsePriceKRW", () => {
  it("가격 텍스트에서 숫자를 뽑는다", () => {
    expect(parsePriceKRW("객실 최저가 150,000원~ 안내")).toBe(150000);
  });

  it("천 단위 콤마 없는 큰 수는 매칭하지 않는다(사이트 표기 형식 그대로 신뢰)", () => {
    expect(parsePriceKRW("가격 안내 준비중")).toBeNull();
  });

  it("예약 마감이면 가격이 있어도 null", () => {
    expect(parsePriceKRW("40,000원 예약 마감")).toBeNull();
  });
});

describe("naver isAccommodationBookmark", () => {
  it("mcid가 ACCOMMODATION이면 숙소", () => {
    expect(isAccommodationBookmark({ name: "아무개", mcid: "ACCOMMODATION" })).toBe(true);
  });

  it("mcid가 다른 값이면 제외 (주차장 등)", () => {
    expect(isAccommodationBookmark({ name: "봉포해수욕장 공영 주차장", mcid: "CAR" })).toBe(false);
  });

  it("mcid가 없으면 이름 키워드로 판단", () => {
    expect(isAccommodationBookmark({ name: "고성 더샵펜션&게스트하우스", mcid: null })).toBe(true);
    expect(isAccommodationBookmark({ name: "화진포해수욕장 샤워장", mcid: null })).toBe(false);
  });
});

describe("naver extractBookmarks", () => {
  it("중첩된 응답 구조에서 name+sid 항목을 재귀적으로 뽑는다", () => {
    const json = {
      my: {
        bookmarkSync: {
          bookmarks: [
            {
              bookmark: {
                sid: "1117911953",
                name: "르네블루by워커힐",
                mcid: "ACCOMMODATION",
                address: "강원 고성군 죽왕면 심층수길 96",
              },
              folderMappings: [{ folderId: 35367544 }],
            },
          ],
        },
      },
    };
    const items = extractBookmarks(json);
    expect(items).toEqual([
      {
        id: "1117911953",
        name: "르네블루by워커힐",
        mcid: "ACCOMMODATION",
        address: "강원 고성군 죽왕면 심층수길 96",
      },
    ]);
  });

  it("같은 id는 한 번만 남긴다", () => {
    const json = [
      { sid: "1", name: "A", mcid: "ACCOMMODATION" },
      { sid: "1", name: "A(중복)", mcid: "ACCOMMODATION" },
    ];
    expect(extractBookmarks(json)).toHaveLength(1);
  });

  it("name/id 짝이 없으면 무시한다", () => {
    expect(extractBookmarks({ foo: { bar: "baz" } })).toEqual([]);
  });
});

describe("naver toHotel", () => {
  const item = { id: "1117911953", name: "르네블루by워커힐", mcid: "ACCOMMODATION", address: "강원 고성군 죽왕면 심층수길 96" };

  it("가격이 있으면 스키마에 맞는 Hotel로 변환한다", () => {
    const price = {
      amount: 182795,
      note: "회원가",
      url: naverHotelUrl(item.id, q.checkin, q.checkout),
      reviewScore: 4.8,
      reviewCount: 120,
    };
    const r = toHotel(item, price, q, at);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(HotelSchema.safeParse(r.hotel).success).toBe(true);
    expect(r.hotel.site).toBe("naver");
    expect(r.hotel.price).toBe(182795);
    expect(r.hotel.address).toBe(item.address);
  });

  it("가격을 확인 못했으면(전화·SNS 예약 등) filtered", () => {
    const price = { amount: null, note: null, url: naverPlaceUrl(item.id, q.checkin, q.checkout), reviewScore: null, reviewCount: null };
    expect(toHotel(item, price, q, at).kind).toBe("filtered");
  });

  it("최대 가격을 넘으면 filtered", () => {
    const price = { amount: 999999, note: null, url: naverPlaceUrl(item.id, q.checkin, q.checkout), reviewScore: null, reviewCount: null };
    expect(toHotel(item, price, q, at).kind).toBe("filtered");
  });
});

describe("naver URL helpers", () => {
  it("펜션/객실 상세 링크에 날짜가 들어간다", () => {
    expect(naverPlaceUrl("123", "2026-10-05", "2026-10-06")).toBe(
      "https://pcmap.place.naver.com/accommodation/123/room?startDate=2026-10-05&endDate=2026-10-06",
    );
  });

  it("네이버호텔 가격비교 링크에 인원·날짜가 들어간다", () => {
    expect(naverHotelUrl("123", "2026-10-05", "2026-10-06")).toBe(
      "https://hotels.naver.com/accommodation/search/detail/domestic/123/rates?dAdultCnt=2&dCheckIn=2026-10-05&dCheckOut=2026-10-06",
    );
  });
});
