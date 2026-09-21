"use client";

import {
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useMemo } from "react";
import { type Hotel, SITES, SITE_LABEL, score10 } from "@/lib/schema";

const SORTS = ["price", "score", "reviews"] as const;

const filterParsers = {
  maxPrice: parseAsInteger.withDefault(50000),
  minScore: parseAsFloat.withDefault(0),
  minReviews: parseAsInteger.withDefault(0),
  site: parseAsStringLiteral(["all", ...SITES] as const).withDefault("all"),
  region: parseAsString.withDefault(""),
  checkin: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(SORTS).withDefault("price"),
};

const won = new Intl.NumberFormat("ko-KR");

const inputClass =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function HotelTable({ hotels }: { hotels: Hotel[] }) {
  const [f, setF] = useQueryStates(filterParsers);

  const regions = useMemo(() => [...new Set(hotels.map((h) => h.region))].sort(), [hotels]);
  const checkins = useMemo(() => [...new Set(hotels.map((h) => h.checkin))].sort(), [hotels]);

  const rows = useMemo(() => {
    const filtered = hotels.filter(
      (h) =>
        h.available &&
        h.price <= f.maxPrice &&
        (f.site === "all" || h.site === f.site) &&
        (f.region === "" || h.region === f.region) &&
        (f.checkin === "" || h.checkin === f.checkin) &&
        (score10(h) ?? 0) >= f.minScore &&
        (h.reviewCount ?? 0) >= f.minReviews,
    );
    return filtered.sort((a, b) => {
      if (f.sort === "score") return (score10(b) ?? -1) - (score10(a) ?? -1);
      if (f.sort === "reviews") return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
      return a.price - b.price;
    });
  }, [hotels, f]);

  const lowest = rows.length > 0 ? Math.min(...rows.map((h) => h.price)) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <label className="text-xs">
          최대 가격(원)
          <input
            type="number"
            step={1000}
            min={0}
            className={inputClass}
            value={f.maxPrice}
            onChange={(e) => setF({ maxPrice: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs">
          최소 평점(10점)
          <input
            type="number"
            step={0.5}
            min={0}
            max={10}
            className={inputClass}
            value={f.minScore}
            onChange={(e) => setF({ minScore: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs">
          최소 리뷰 수
          <input
            type="number"
            step={10}
            min={0}
            className={inputClass}
            value={f.minReviews}
            onChange={(e) => setF({ minReviews: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs">
          사이트
          <select
            className={inputClass}
            value={f.site}
            onChange={(e) => setF({ site: e.target.value as (typeof SITES)[number] | "all" })}
          >
            <option value="all">전체</option>
            {SITES.map((s) => (
              <option key={s} value={s}>
                {SITE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          지역
          <select className={inputClass} value={f.region} onChange={(e) => setF({ region: e.target.value })}>
            <option value="">전체</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          체크인
          <select className={inputClass} value={f.checkin} onChange={(e) => setF({ checkin: e.target.value })}>
            <option value="">전체</option>
            {checkins.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          정렬
          <select
            className={inputClass}
            value={f.sort}
            onChange={(e) => setF({ sort: e.target.value as (typeof SORTS)[number] })}
          >
            <option value="price">가격 낮은 순</option>
            <option value="score">평점 높은 순</option>
            <option value="reviews">리뷰 많은 순</option>
          </select>
        </label>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        조건 충족 <strong>{rows.length}</strong>곳
        {lowest !== null && (
          <>
            {" "}
            · 최저가 <strong>{won.format(lowest)}원</strong>
          </>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
              <th className="py-2 pr-3">숙소명</th>
              <th className="py-2 pr-3">사이트</th>
              <th className="py-2 pr-3">날짜</th>
              <th className="py-2 pr-3">주소</th>
              <th className="py-2 pr-3 text-right">가격</th>
              <th className="py-2 pr-3 text-right">평점</th>
              <th className="py-2 pr-3 text-right">리뷰</th>
              <th className="py-2">예약</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr
                key={`${h.site}:${h.siteHotelId}:${h.checkin}`}
                className="border-b border-zinc-200 dark:border-zinc-800"
              >
                <td className="py-2 pr-3 font-medium">{h.name}</td>
                <td className="py-2 pr-3">{SITE_LABEL[h.site]}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {h.checkin.slice(5)} ~ {h.checkout.slice(5)}
                </td>
                <td className="py-2 pr-3">{h.address ?? "-"}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {won.format(h.price)}원
                  {h.priceNote && <div className="text-xs text-zinc-500">{h.priceNote}</div>}
                </td>
                <td className="py-2 pr-3 text-right">
                  {h.reviewScore === null ? "-" : `${h.reviewScore}/${h.reviewScoreMax}`}
                </td>
                <td className="py-2 pr-3 text-right">
                  {h.reviewCount === null ? "-" : won.format(h.reviewCount)}
                </td>
                <td className="py-2">
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    예약 페이지
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-500">
                  조건에 맞는 숙소가 없습니다. 필터를 조정해 보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
