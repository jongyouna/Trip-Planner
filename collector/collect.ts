import { loadHotels } from "../lib/data";
import type { Hotel, Site } from "../lib/schema";
import {
  BlockedError,
  type RunLogEntry,
  type SearchQuery,
  type SiteAdapter,
  type SiteRunLog,
  appendRunLog,
  jitter,
  launchBrowser,
  persist,
  sleep,
} from "./core";
import { naver } from "./sites/naver";
import { yanolja } from "./sites/yanolja";

export const ADAPTERS: Partial<Record<Site, SiteAdapter>> = { yanolja, naver };

/** 리뷰 점수가 이 비율 넘게 비면 사이트 구조가 바뀐 것으로 보고 경고한다. */
const MISSING_SCORE_WARN_RATIO = 0.5;

export interface CollectOutcome {
  /** 이번 실행에서 수집해 data/hotels.json에 병합한 숙소 */
  hotels: Hotel[];
  results: SiteRunLog[];
}

/** 브라우저를 열어 사이트별 어댑터로 수집하고 data/hotels.json에 병합 저장한다. CLI와 워커가 함께 쓴다. */
export async function runCollect(
  query: SearchQuery,
  sites: Site[],
  opts: { fetchAddress: boolean; log: (msg: string) => void },
): Promise<CollectOutcome> {
  const { fetchAddress, log } = opts;
  const known = loadHotels().hotels;
  const startedAt = new Date().toISOString();
  const results: SiteRunLog[] = [];
  const collected: Hotel[] = [];

  const context = await launchBrowser();
  try {
    for (const [i, site] of sites.entries()) {
      if (i > 0) await sleep(jitter(2000));
      const adapter = ADAPTERS[site]!;
      const page = await context.newPage();
      try {
        const knownAddresses = new Map(
          known.filter((h) => h.site === site && h.address).map((h) => [h.siteHotelId, h.address as string]),
        );
        const { hotels, skipped } = await adapter.search(page, query, { knownAddresses, fetchAddress }, log);
        const missing = hotels.filter((h) => h.reviewScore === null).length;
        if (hotels.length > 0 && missing / hotels.length > MISSING_SCORE_WARN_RATIO) {
          log(`⚠ ${site}: 리뷰 점수 누락 ${missing}/${hotels.length}건 — 사이트 구조 변경 가능성`);
        }
        const total = persist(hotels);
        log(`${site}: ${hotels.length}건 저장 (전체 ${total}건, 제외 ${skipped})`);
        collected.push(...hotels);
        results.push({ site, status: "ok", collected: hotels.length, skipped });
      } catch (e) {
        const blocked = e instanceof BlockedError;
        const error = e instanceof Error ? e.message : String(e);
        log(`${blocked ? "차단됨" : "실패"} ${site}: ${error}`);
        results.push({ site, status: blocked ? "blocked" : "failed", collected: 0, skipped: 0, error });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    const entry: RunLogEntry = { startedAt, finishedAt: new Date().toISOString(), query, sites: results };
    appendRunLog(entry);
  }
  return { hotels: collected, results };
}
