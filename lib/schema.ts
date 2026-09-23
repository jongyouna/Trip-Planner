import { z } from "zod";

export const SITES = ["yanolja", "tripcom", "naver"] as const;
export type Site = (typeof SITES)[number];

export const SITE_LABEL: Record<Site, string> = {
  yanolja: "야놀자",
  tripcom: "Trip.com",
  naver: "네이버",
};

/** 수집기·수동 수집(ingest)·대시보드가 모두 이 스키마 하나로 검증한다. */
export const HotelSchema = z.object({
  site: z.enum(SITES),
  siteHotelId: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  address: z.string().nullable(),
  checkin: z.iso.date(),
  checkout: z.iso.date(),
  /** 1박 총액(원) */
  price: z.number().int().positive(),
  /** 회원가 등 가격 조건 메모 */
  priceNote: z.string().nullable(),
  reviewScore: z.number().min(0).max(10).nullable(),
  /** 사이트별 점수 만점(야놀자 5, Trip.com 10) */
  reviewScoreMax: z.union([z.literal(5), z.literal(10)]),
  reviewCount: z.number().int().nonnegative().nullable(),
  url: z.url(),
  available: z.boolean(),
  collectedAt: z.iso.datetime(),
});
export type Hotel = z.infer<typeof HotelSchema>;

export const HotelsFileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  hotels: z.array(HotelSchema),
});
export type HotelsFile = z.infer<typeof HotelsFileSchema>;

/** 병합 키: 같은 사이트·숙소·날짜는 최신 수집분으로 덮어쓴다. */
export function hotelKey(h: Pick<Hotel, "site" | "siteHotelId" | "checkin" | "checkout">): string {
  return `${h.site}:${h.siteHotelId}:${h.checkin}:${h.checkout}`;
}

/** 만점이 다른 사이트를 비교할 수 있게 10점 만점으로 환산한다. */
export function score10(h: Pick<Hotel, "reviewScore" | "reviewScoreMax">): number | null {
  if (h.reviewScore === null) return null;
  return Math.round((h.reviewScore * 10) / h.reviewScoreMax * 10) / 10;
}
