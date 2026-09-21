import fs from "node:fs";
import path from "node:path";
import { type BrowserContext, type Page, chromium } from "playwright";
import { emptyFile, loadHotels, saveHotels } from "../lib/data";
import { mergeHotels } from "../lib/merge";
import type { Hotel, Site } from "../lib/schema";

export interface SearchQuery {
  region: string;
  checkin: string;
  checkout: string;
  maxPrice: number;
}

export interface SearchResult {
  hotels: Hotel[];
  /** 스키마 검증·가격 조건 등으로 버린 항목 수 */
  skipped: number;
}

export interface SearchOptions {
  /** 이미 알고 있는 주소(siteHotelId → 주소). 재수집 시 상세 페이지 요청을 줄인다. */
  knownAddresses: Map<string, string>;
  /** false면 상세 페이지 주소 조회를 건너뛴다. */
  fetchAddress: boolean;
}

export interface SiteAdapter {
  site: Site;
  search(page: Page, query: SearchQuery, opts: SearchOptions, log: (msg: string) => void): Promise<SearchResult>;
}

/** 사이트가 접근을 막았다(403/429/CAPTCHA 등). 재시도·우회하지 않고 즉시 중단한다. */
export class BlockedError extends Error {}

export const PROFILE_DIR = path.join(process.cwd(), ".browser-profile");
const RUN_LOG_PATH = path.join(process.cwd(), "data", "run-log.json");

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** base ~ base*(1+ratio) ms 사이의 지연 */
export const jitter = (base: number, ratio = 0.5) => base + Math.random() * base * ratio;

/** 일반 오류는 attempts회까지 재시도, BlockedError는 즉시 던진다. 마지막 오류를 던진다. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1500): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BlockedError) throw e;
      lastError = e;
      if (i < attempts) await sleep(jitter(baseDelayMs * i));
    }
  }
  throw lastError;
}

/** 로컬 Chrome을 영속 프로필로 연다. 로그인 상태(회원가)가 유지된다. 스텔스 옵션은 쓰지 않는다. */
export async function launchBrowser(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 1000 },
  });
}

export interface SiteRunLog {
  site: Site;
  status: "ok" | "blocked" | "failed";
  collected: number;
  skipped: number;
  error?: string;
}

export interface RunLogEntry {
  startedAt: string;
  finishedAt: string;
  query: SearchQuery;
  sites: SiteRunLog[];
}

export function appendRunLog(entry: RunLogEntry, filePath: string = RUN_LOG_PATH): void {
  let entries: RunLogEntry[] = [];
  try {
    entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {}
  entries.push(entry);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entries.slice(-50), null, 2) + "\n", "utf8");
}

/** 수집 결과를 data/hotels.json에 병합 저장한다. */
export function persist(incoming: Hotel[]): number {
  const current = loadHotels();
  const merged = mergeHotels(current.hotels, incoming);
  saveHotels({ ...emptyFile(), updatedAt: new Date().toISOString(), hotels: merged });
  return merged.length;
}
