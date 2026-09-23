import { type Hotel, score10 } from "./schema";

export const SORT_KEYS = ["name", "site", "date", "address", "price", "score", "reviews"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

/** 다른 열로 처음 바꿀 때의 방향: 숫자 "좋은 쪽"이 위로 오도록 점수·리뷰는 내림차순. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  site: "asc",
  date: "asc",
  address: "asc",
  price: "asc",
  score: "desc",
  reviews: "desc",
};

/** 같은 열을 다시 누르면 방향을 뒤집고, 다른 열이면 그 열의 기본 방향으로 시작한다. */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey,
): { key: SortKey; dir: SortDir } {
  if (current.key === clicked) return { key: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key: clicked, dir: DEFAULT_DIR[clicked] };
}

function sortValue(h: Hotel, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return h.name;
    case "site":
      return h.site;
    case "date":
      return `${h.checkin}~${h.checkout}`;
    case "address":
      return h.address;
    case "price":
      return h.price;
    case "score":
      return score10(h);
    case "reviews":
      return h.reviewCount;
  }
}

/** 값이 없는 항목(null)은 방향과 관계없이 항상 뒤로 보낸다. 같은 값은 입력 순서를 유지한다. */
export function sortHotels(hotels: readonly Hotel[], key: SortKey, dir: SortDir): Hotel[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...hotels].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
    return String(va).localeCompare(String(vb), "ko") * sign;
  });
}
