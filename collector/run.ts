// 사용법: npm run collect -- --region 포천 --checkin 2026-09-23 --checkout 2026-09-24 --max-price 50000 --sites yanolja [--no-address]
import { parseArgs } from "node:util";
import { SITES, type Site } from "../lib/schema";
import { ADAPTERS, runCollect } from "./collect";
import type { SearchQuery } from "./core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const { results } = await runCollect(query, sites, { fetchAddress, log: (msg) => console.log(msg) });
  if (results.some((r) => r.status !== "ok")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
