import { describe, expect, it } from "vitest";
import type { Hotel } from "./schema";
import { nextSort, sortHotels } from "./sort";

const mk = (id: string, over: Partial<Hotel> = {}): Hotel => ({
  site: "yanolja",
  siteHotelId: id,
  name: `호텔${id}`,
  region: "포천",
  address: null,
  checkin: "2026-09-23",
  checkout: "2026-09-24",
  price: 40000,
  priceNote: null,
  reviewScore: 4,
  reviewScoreMax: 5,
  reviewCount: 10,
  url: `https://nol.yanolja.com/stay/domestic/${id}`,
  available: true,
  collectedAt: "2026-09-21T03:00:00.000Z",
  ...over,
});

const ids = (hs: Hotel[]) => hs.map((h) => h.siteHotelId);

describe("sortHotels", () => {
  const hotels = [
    mk("a", { price: 30000, reviewCount: 5 }),
    mk("b", { price: 50000, reviewCount: null, reviewScore: null }),
    mk("c", { price: 10000, reviewCount: 50 }),
  ];

  it("가격 오름차순·내림차순", () => {
    expect(ids(sortHotels(hotels, "price", "asc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortHotels(hotels, "price", "desc"))).toEqual(["b", "a", "c"]);
  });

  it("값 없음(null)은 방향과 관계없이 항상 뒤", () => {
    expect(ids(sortHotels(hotels, "reviews", "asc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortHotels(hotels, "reviews", "desc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortHotels(hotels, "score", "desc")).at(-1)).toBe("b");
    expect(ids(sortHotels(hotels, "score", "asc")).at(-1)).toBe("b");
  });

  it("점수는 만점이 다른 사이트를 10점 기준으로 비교한다", () => {
    const list = [
      mk("y", { reviewScore: 4, reviewScoreMax: 5 }), // 8.0
      mk("t", { site: "tripcom", reviewScore: 8.4, reviewScoreMax: 10 }), // 8.4
    ];
    expect(ids(sortHotels(list, "score", "desc"))).toEqual(["t", "y"]);
  });

  it("문자열은 한글 순서로 정렬한다", () => {
    const list = [mk("1", { name: "나 호텔" }), mk("2", { name: "가 호텔" })];
    expect(ids(sortHotels(list, "name", "asc"))).toEqual(["2", "1"]);
  });

  it("같은 값은 입력 순서를 유지하고 원본을 바꾸지 않는다", () => {
    const list = [mk("x"), mk("y"), mk("z")];
    expect(ids(sortHotels(list, "price", "desc"))).toEqual(["x", "y", "z"]);
    expect(ids(list)).toEqual(["x", "y", "z"]);
  });
});

describe("nextSort", () => {
  it("같은 열을 누르면 방향이 바뀐다", () => {
    expect(nextSort({ key: "price", dir: "asc" }, "price")).toEqual({ key: "price", dir: "desc" });
    expect(nextSort({ key: "price", dir: "desc" }, "price")).toEqual({ key: "price", dir: "asc" });
  });

  it("다른 열은 그 열의 기본 방향으로 시작한다", () => {
    expect(nextSort({ key: "price", dir: "desc" }, "score")).toEqual({ key: "score", dir: "desc" });
    expect(nextSort({ key: "score", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });
});
