import { describe, expect, it } from "vitest";
import { HotelSchema } from "../../lib/schema";
import {
  extractBookmarks,
  isAccommodationBookmark,
  naverHotelUrl,
  naverPlaceUrl,
  parseHotelPagePrice,
  parseRoomPagePrice,
  toHotel,
} from "./naver";

const q = { region: "강원 고성", checkin: "2026-10-05", checkout: "2026-10-06", maxPrice: 200000 };
const at = "2026-09-23T11:48:00.000Z";

// 아래 텍스트는 2026-10-06 실제 페이지(10/10 1박 2명)의 형태를 줄여 옮긴 것.
describe("naver parseRoomPagePrice (pcmap /room)", () => {
  const withMarker = (...rows: string[]) => ["선택하신 조건으로 검색한 결과입니다.", ...rows, "이용약관"].join("\n");

  it("객실 목록은 가격만 있는 줄 중 최저가를 쓴다 (첫 금액이 아님)", () => {
    const text = withMarker(
      "나폴리 &밀라노(2&3층랜덤) 기준2인요금",
      "189,000원",
      "네이버페이",
      "로베소카(2&3층랜덤) 기준2인요금",
      "179,000원",
      "최대 1,790원 적립",
    );
    expect(parseRoomPagePrice(text)).toBe(179000);
  });

  it("일부 객실만 예약마감이어도 나머지 객실 가격이 있으면 예약 가능", () => {
    const text = withMarker("로베소카 기준2인요금", "179,000원", "예약마감", "12호 피렌체(기준2인요금)");
    expect(parseRoomPagePrice(text)).toBe(179000);
  });

  it("모든 객실이 예약마감이면 null", () => {
    expect(parseRoomPagePrice(withMarker("예약마감", "12호 피렌체(기준2인요금)"))).toBeNull();
  });

  it("날짜가 반영된 목록이 아니면(홈으로 리다이렉트된 호텔·리조트) 쿠폰 금액이 있어도 null", () => {
    expect(parseRoomPagePrice("세이지우드 홍천\n쿠폰\n5,000원\n이용약관")).toBeNull();
  });

  it("설명 문구 속 금액(적립금)은 가격으로 보지 않는다", () => {
    expect(parseRoomPagePrice(withMarker("스탠다드 트윈", "78,400원", "네이버페이", "최대 784원 적립"))).toBe(78400);
  });
});

describe("naver parseHotelPagePrice (hotels.naver.com /rates)", () => {
  it("헤더의 해당 일정 최저가를 쓴다 (본문의 다른 가격 줄이 더 낮아도)", () => {
    const text = [
      "10.10.-10.11. (1박)",
      "439,884원",
      "전체 가격 비교하기",
      "439,884원~",
      "10.10.토-10.11.일, 1박2명",
      "1박 최저가 추이",
      "147,585원",
      "스탠다드 더블룸",
      "439,884원",
    ].join("\n");
    expect(parseHotelPagePrice(text)).toBe(439884);
  });

  it("'예약 가능한 객실 없음'이면 추천 호텔 가격이 보여도 null", () => {
    const text = [
      "예약 가능한 객실 없음",
      "선택하신 일정에 예약 가능한 객실이 없습니다.",
      "이 호텔을 본 다른 사람이 함께 찾는 호텔이에요!",
      "소노벨 비발디파크",
      "100,581원~",
    ].join("\n");
    expect(parseHotelPagePrice(text)).toBeNull();
  });

  it("헤더 가격이 없으면 null", () => {
    expect(parseHotelPagePrice("가격 안내 준비중")).toBeNull();
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
  it("펜션/객실 상세 링크에 날짜(checkin/checkout, YYYYMMDD)와 인원이 들어간다", () => {
    expect(naverPlaceUrl("123", "2026-10-05", "2026-10-06")).toBe(
      "https://pcmap.place.naver.com/accommodation/123/room?checkin=20261005&checkout=20261006&guest=2",
    );
  });

  it("네이버호텔 가격비교 링크에 인원·날짜가 들어간다", () => {
    expect(naverHotelUrl("123", "2026-10-05", "2026-10-06")).toBe(
      "https://hotels.naver.com/accommodation/search/detail/domestic/123/rates?dAdultCnt=2&dCheckIn=2026-10-05&dCheckOut=2026-10-06",
    );
  });
});
