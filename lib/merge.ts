import { type Hotel, hotelKey } from "./schema";

/** existing에 incoming을 병합한다. 키가 같으면 incoming이 이긴다. */
export function mergeHotels(existing: Hotel[], incoming: Hotel[]): Hotel[] {
  const byKey = new Map<string, Hotel>();
  for (const h of existing) byKey.set(hotelKey(h), h);
  for (const h of incoming) byKey.set(hotelKey(h), h);
  return [...byKey.values()];
}
