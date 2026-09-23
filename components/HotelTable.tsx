"use client";

import {
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useMemo } from "react";
import { type Hotel, SITES, SITE_LABEL, hotelKey, score10 } from "@/lib/schema";
import { SORT_DIRS, SORT_KEYS, type SortKey, nextSort, sortHotels } from "@/lib/sort";

const filterParsers = {
  maxPrice: parseAsInteger.withDefault(50000),
  minScore: parseAsFloat.withDefault(0),
  minReviews: parseAsInteger.withDefault(0),
  site: parseAsStringLiteral(["all", ...SITES] as const).withDefault("all"),
  region: parseAsString.withDefault(""),
  checkin: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(SORT_KEYS).withDefault("price"),
  dir: parseAsStringLiteral(SORT_DIRS).withDefault("asc"),
};

const COLUMNS: { key: SortKey | null; label: string; right?: boolean }[] = [
  { key: "name", label: "숙소명" },
  { key: "site", label: "사이트" },
  { key: "date", label: "날짜" },
  { key: "address", label: "주소" },
  { key: "price", label: "가격", right: true },
  { key: "score", label: "평점", right: true },
  { key: "reviews", label: "리뷰", right: true },
  { key: null, label: "예약" },
];

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
    return sortHotels(filtered, f.sort, f.dir);
  }, [hotels, f]);

  const lowest = rows.length > 0 ? Math.min(...rows.map((h) => h.price)) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              {COLUMNS.map((c) => {
                const active = c.key !== null && c.key === f.sort;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    className={`py-2 pr-3 ${c.right ? "text-right" : ""}`}
                    aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : c.key ? "none" : undefined}
                  >
                    {c.key === null ? (
                      c.label
                    ) : (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${
                          active ? "font-bold text-zinc-900 dark:text-zinc-100" : ""
                        }`}
                        onClick={() => {
                          const next = nextSort({ key: f.sort, dir: f.dir }, c.key!);
                          setF({ sort: next.key, dir: next.dir });
                        }}
                      >
                        {c.label}
                        <span aria-hidden className="w-3 text-[10px]">
                          {active ? (f.dir === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr
                key={hotelKey(h)}
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
