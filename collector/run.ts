// 사용법: npm run collect -- --region 포천 --checkin 2026-09-23 --checkout 2026-09-24 --max-price 50000 --sites yanolja [--no-address]
import { parseArgs } from "node:util";
import { loadHotels } from "../lib/data";
import { SITES, type Site } from "../lib/schema";
import {
  BlockedError,
  type RunLogEntry,
  type SearchQuery,
  type SiteAdapter,
  type SiteRunLog,
  appendRunLog,
  launchBrowser,
  persist,
  sleep,
  jitter,
} from "./core";
import { yanolja } from "./sites/yanolja";

const ADAPTERS: Partial<Record<Site, SiteAdapter>> = { yanolja };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 리뷰 점수가 이 비율 넘게 비면 사이트 구조가 바뀐 것으로 보고 경고한다. */
const MISSING_SCORE_WARN_RATIO = 0.5;

function parseQuery(): { query: SearchQuery; sites: Site[]; fetchAddress: boolean } {
  const { values } = parseArgs({
    options: {
      region: { type: "string" },
      checkin: { type: "string" },
      checkout: { type: "string" },
      "max-price": { type: "string", default: "50000" },
      sites: { type: "string", default: "yanolja" },
      "no-address": { type: "boolean", default: false },
    },
  });
  const { region, checkin, checkout } = values;
  if (!region || !checkin || !checkout || !DATE_RE.test(checkin) || !DATE_RE.test(checkout)) {
    throw new Error("필수 옵션: --region <지역> --checkin YYYY-MM-DD --checkout YYYY-MM-DD");
  }
  const maxPrice = Number(values["max-price"]);
  if (!Number.isInteger(maxPrice) || maxPrice <= 0) throw new Error("--max-price는 양의 정수여야 합니다.");

  const sites = (values.sites ?? "yanolja").split(",").map((s) => s.trim());
  for (const s of sites) {
    if (!(SITES as readonly string[]).includes(s)) throw new Error(`알 수 없는 사이트: ${s}`);
    if (!ADAPTERS[s as Site]) throw new Error(`아직 구현되지 않은 사이트: ${s}`);
  }
  return {
    query: { region, checkin, checkout, maxPrice },
    sites: sites as Site[],
    fetchAddress: !values["no-address"],
  };
}

async function main() {
  const { query, sites, fetchAddress } = parseQuery();
  const known = loadHotels().hotels;
  const startedAt = new Date().toISOString();
  const results: SiteRunLog[] = [];
  const log = (msg: string) => console.log(msg);

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
  if (results.some((r) => r.status !== "ok")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
