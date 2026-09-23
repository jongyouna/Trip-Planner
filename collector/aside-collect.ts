import fs from "node:fs";
import path from "node:path";
import { type BrowserContext, type Page, chromium } from "playwright";
import { PROFILE_DIR } from "./core";

interface BookmarkItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  url?: string;
}

interface PlaceResult {
  name: string;
  price: string;
  priceNote?: string;
  date: string;
  condition: string;
  url: string;
  address: string;
  reviewScore?: string;
  reviewCount?: string;
  blockedReason?: string;
}

const CHECKIN = "2026-10-05";
const CHECKOUT = "2026-10-06";
const ASIDE_RESULT_PATH = path.join(process.cwd(), "aside-result.md");

async function waitForLogin(context: BrowserContext, page: Page): Promise<boolean> {
  const cookies = await context.cookies("https://naver.com");
  const hasAut = cookies.some((c) => c.name === "NID_AUT");
  if (hasAut && !page.url().includes("nidlogin.login")) {
    console.log(">> 기존 로그인 세션이 유지되어 있습니다.");
    return true;
  }

  console.log("\n========================================================");
  console.log(">> 브라우저 창에서 네이버 로그인을 진행해주세요.");
  console.log(">> 로그인이 완료되면 자동으로 감지하여 다음 단계로 넘어갑니다.");
  console.log("========================================================\n");

  await page.goto("https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fmap.naver.com%2Fp%2Fbookmark", {
    waitUntil: "domcontentloaded",
  });

  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(1500);
    const curCookies = await context.cookies("https://naver.com");
    const aut = curCookies.some((c) => c.name === "NID_AUT");
    const currentUrl = page.url();

    if (aut && !currentUrl.includes("nidlogin.login")) {
      console.log(">> 네이버 로그인 완료를 감지했습니다!\n");
      return true;
    }
  }

  console.error("로그인 대기 시간 초과 (300초)");
  return false;
}

async function collectBookmarkItems(page: Page): Promise<BookmarkItem[]> {
  console.log(">> 네이버 지도 즐겨찾기(저장) 페이지로 이동합니다...");

  const itemsMap = new Map<string, BookmarkItem>();

  // Intercept bookmark and folder APIs
  page.on("response", async (res) => {
    const url = res.url();
    if (
      url.includes("bookmark") ||
      url.includes("folder") ||
      url.includes("save-pages") ||
      url.includes("myplace") ||
      url.includes("graphql")
    ) {
      try {
        const ct = res.headers()["content-type"] || "";
        if (ct.includes("json")) {
          const json = await res.json();
          extractFromApiJson(json, itemsMap);
        }
      } catch {}
    }
  });

  // Navigate to naver map bookmark
  await page.goto("https://map.naver.com/p/bookmark", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // If sidebar bookmark button is needed
  const saveSelectors = [
    "button[aria-label*='저장']",
    "button[aria-label*='MY']",
    "a[href*='bookmark']",
    "button:has-text('MY')",
    "button:has-text('저장')",
    "a:has-text('저장')",
  ];

  for (const sel of saveSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }
  }

  await page.waitForTimeout(3000);

  // Check if there are folder tabs or buttons to click (e.g. "숙소" folder)
  console.log(">> 즐겨찾기 폴더 탐색 중...");
  try {
    const folderButtons = await page.$$("button, a, div[role='button'], div[role='tab']");
    for (const fb of folderButtons) {
      const text = (await fb.textContent())?.trim() || "";
      if (text.includes("숙소") || text.includes("호텔") || text.includes("펜션") || text.includes("여행")) {
        console.log(`>> '${text}' 폴더/탭 클릭 시도`);
        await fb.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
  } catch {}

  // Scroll to load all items
  for (let s = 0; s < 5; s++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(1000);
  }

  // Also extract from DOM in case API interception missed anything
  try {
    const domItems = await page.evaluate(() => {
      const list: { id: string; name: string; category: string; address?: string; url?: string }[] = [];
      // Look for place items in bookmark list
      const elements = document.querySelectorAll("li, div[class*='item'], div[class*='place']");
      elements.forEach((el) => {
        const titleEl = el.querySelector("strong, span[class*='title'], span[class*='name']");
        const cateEl = el.querySelector("span[class*='category'], span[class*='cate']");
        const addrEl = el.querySelector("span[class*='address'], span[class*='addr']");
        const linkEl = el.querySelector("a[href*='/place/'], a[href*='entry/place']");

        if (titleEl && (cateEl || linkEl)) {
          const name = titleEl.textContent?.trim() || "";
          const category = cateEl?.textContent?.trim() || "";
          const address = addrEl?.textContent?.trim() || "";
          const href = linkEl?.getAttribute("href") || "";

          let id = "";
          const match = href.match(/place\/(\d+)/);
          if (match) id = match[1];

          if (name && (id || href)) {
            list.push({ id: id || name, name, category, address, url: href });
          }
        }
      });
      return list;
    });

    for (const item of domItems) {
      if (!itemsMap.has(item.id)) {
        itemsMap.set(item.id, item);
      }
    }
  } catch (err) {
    console.error("DOM 추출 중 오류:", err);
  }

  return Array.from(itemsMap.values());
}

function extractFromApiJson(json: any, itemsMap: Map<string, BookmarkItem>) {
  if (!json || typeof json !== "object") return;

  // recursive search for bookmark items
  function traverse(obj: any) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) traverse(item);
      return;
    }

    // Check if this object looks like a place bookmark
    const name = obj.name || obj.title || obj.placeName || obj.siteName;
    const id = obj.placeId || obj.sid || obj.id;
    const category = obj.category || obj.categoryName || obj.cateName || obj.type || "";
    const address = obj.address || obj.roadAddress || obj.commonAddress || "";

    if (name && id && typeof name === "string" && (typeof id === "string" || typeof id === "number")) {
      const idStr = String(id);
      // We want accommodation items or items saved
      if (!itemsMap.has(idStr)) {
        itemsMap.set(idStr, {
          id: idStr,
          name,
          category: typeof category === "string" ? category : "",
          address: typeof address === "string" ? address : "",
          url: `https://map.naver.com/p/entry/place/${idStr}`,
        });
      }
    }

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") {
        traverse(obj[key]);
      }
    }
  }

  traverse(json);
}

function isAccommodation(item: BookmarkItem): boolean {
  const text = `${item.name} ${item.category}`.toLowerCase();
  const keywords = [
    "숙소",
    "호텔",
    "모텔",
    "펜션",
    "리조트",
    "게스트하우스",
    "민박",
    "풀빌라",
    "글램핑",
    "캠핑",
    "콘도",
    "스테이",
    "stay",
    "hotel",
    "resort",
    "motel",
  ];
  return keywords.some((kw) => text.includes(kw));
}

async function fetchPlacePricing(context: BrowserContext, item: BookmarkItem): Promise<PlaceResult> {
  const page = await context.newPage();
  console.log(`\n>> [${item.name}] 가격 및 상세 정보 조회 중...`);

  // Target accommodation room/booking URL
  const bookingUrl = `https://pcmap.place.naver.com/accommodation/${item.id}/room?startDate=${CHECKIN}&endDate=${CHECKOUT}`;
  const homeUrl = `https://pcmap.place.naver.com/accommodation/${item.id}/home`;

  let price = "확인 불가";
  let priceNote: string | undefined;
  let reviewScore: string | undefined;
  let reviewCount: string | undefined;
  let address = item.address || "";
  let finalUrl = bookingUrl;
  let blockedReason: string | undefined;

  try {
    // Intercept GraphQL responses for prices and details
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("graphql") || url.includes("accommodation") || url.includes("booking")) {
        try {
          const ct = res.headers()["content-type"] || "";
          if (ct.includes("json")) {
            const data = await res.json();
            // check for room price list
            const str = JSON.stringify(data);
            if (str.includes("price") || str.includes("discountPrice")) {
              // Extract prices from GraphQL response
              extractPriceFromGraphQL(data, (p, note) => {
                if (price === "확인 불가" || (p && p < price)) {
                  price = p;
                  if (note) priceNote = note;
                }
              });
            }
          }
        } catch {}
      }
    });

    await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // If redirected to home or room tab not selected, wait a bit
    const curUrl = page.url();
    finalUrl = curUrl;

    // Check page title and address
    try {
      const addrEl = await page.$("span.LDgIH, span[class*='address'], span.IH98W");
      if (addrEl) {
        const text = (await addrEl.textContent())?.trim();
        if (text) address = text;
      }

      // Review score & count
      const scoreEl = await page.$("span.PXDMr, span[class*='score'], em[class*='score']");
      if (scoreEl) {
        reviewScore = (await scoreEl.textContent())?.trim();
      }

      const countEl = await page.$("span.place_section_count, a[href*='review'] em");
      if (countEl) {
        reviewCount = (await countEl.textContent())?.trim();
      }
    } catch {}

    // Extract price from DOM if not found from API
    if (price === "확인 불가") {
      try {
        const domPrice = await page.evaluate(() => {
          // Look for price elements
          const priceEls = document.querySelectorAll(
            "em[class*='price'], strong[class*='price'], span[class*='price'], span.awpzT, span.b3p90"
          );
          const found: string[] = [];
          priceEls.forEach((el) => {
            const txt = el.textContent?.trim() || "";
            if (/\d+[,0-9]*원/.test(txt)) {
              found.push(txt);
            }
          });
          return found;
        });

        if (domPrice.length > 0) {
          price = domPrice[0];
        } else {
          // Check if sold out
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (bodyText.includes("예약 마감") || bodyText.includes("예약이 마감되었습니다")) {
            price = "예약 마감";
          }
        }
      } catch {}
    }

    // Check if member price note
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => "");
    if (pageText.includes("네이버페이") || pageText.includes("회원") || pageText.includes("Npay")) {
      priceNote = "네이버페이/회원 혜택 적용 가능";
    }
  } catch (err: any) {
    console.error(`[${item.name}] 정보 조회 실패:`, err.message);
    blockedReason = err.message;
  } finally {
    await page.close().catch(() => {});
  }

  console.log(`>> 결과: ${item.name} | ${price} | ${address}`);

  return {
    name: item.name,
    price,
    priceNote,
    date: `${CHECKIN} ~ ${CHECKOUT}`,
    condition: "1박 (기본 인원)",
    url: finalUrl,
    address,
    reviewScore,
    reviewCount,
    blockedReason,
  };
}

function extractPriceFromGraphQL(obj: any, onFound: (price: string, note?: string) => void) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) extractPriceFromGraphQL(item, onFound);
    return;
  }

  if (obj.price || obj.discountPrice || obj.minPrice) {
    const raw = obj.discountPrice || obj.price || obj.minPrice;
    if (typeof raw === "number" && raw > 0) {
      onFound(`${raw.toLocaleString()}원`, obj.isMemberPrice ? "회원가" : undefined);
    } else if (typeof raw === "string" && /\d+/.test(raw)) {
      onFound(raw, obj.isMemberPrice ? "회원가" : undefined);
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      extractPriceFromGraphQL(obj[key], onFound);
    }
  }
}

async function main() {
  console.log("==================================================");
  console.log("네이버 지도 즐겨찾기 숙소 수집기 시작");
  console.log("체크인:", CHECKIN, "/ 체크아웃:", CHECKOUT);
  console.log("==================================================");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 950 },
  });

  const page = await context.newPage();

  // 1. Wait for login
  const ok = await waitForLogin(context, page);
  if (!ok) {
    await context.close();
    process.exit(1);
  }

  // 2. Collect bookmark items
  const allBookmarks = await collectBookmarkItems(page);
  console.log(`\n>> 총 ${allBookmarks.length}건의 즐겨찾기 항목을 발견했습니다.`);

  // 3. Filter accommodations
  let accommodations = allBookmarks.filter(isAccommodation);

  if (accommodations.length === 0 && allBookmarks.length > 0) {
    console.log(">> 카테고리 필터 결과 숙소가 분리되지 않아 전체 목록에서 조회를 시도합니다.");
    accommodations = allBookmarks;
  }

  console.log(`>> 수집 대상 숙소: ${accommodations.length}건`);
  for (const acc of accommodations) {
    console.log(`   - [${acc.category || "장소"}] ${acc.name} (ID: ${acc.id})`);
  }

  if (accommodations.length === 0) {
    console.log(">> 수집할 숙소를 찾지 못했습니다. 즐겨찾기 폴더를 확인해주세요.");
    await context.close();
    return;
  }

  // 4. Fetch details & pricing for each accommodation
  const results: PlaceResult[] = [];
  for (const acc of accommodations) {
    const res = await fetchPlacePricing(context, acc);
    results.push(res);
    await page.waitForTimeout(1000);
  }

  await context.close();

  // 5. Generate aside-result.md
  console.log("\n>> aside-result.md 파일 작성을 시작합니다...");

  const now = new Date();
  const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00").slice(0, 19);

  let md = `# Aside Browser Result\n\n`;
  md += `- status: ${results.some((r) => r.blockedReason) ? "partial" : "done"}\n`;
  md += `- completed: ${kstTime}\n`;
  md += `- request_ref: aside-request.md (created 2026-09-23T00:00)\n\n`;
  md += `## 결과\n\n`;
  md += `| 숙소명 | 가격 | 날짜 | 조건 | 링크 | 주소 | 비고 |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  const blocked: { name: string; reason: string }[] = [];

  for (const r of results) {
    if (r.blockedReason) {
      blocked.push({ name: r.name, reason: r.blockedReason });
    }
    const note = [r.priceNote, r.reviewScore ? `평점 ${r.reviewScore}` : null, r.reviewCount ? `리뷰 ${r.reviewCount}` : null]
      .filter(Boolean)
      .join(", ");
    md += `| ${r.name} | ${r.price} | ${r.date} | ${r.condition} | [예약/상세 링크](${r.url}) | ${r.address || "-"} | ${note || "-"} |\n`;
  }

  md += `\n## 막힌 항목 (있으면)\n`;
  if (blocked.length === 0) {
    md += `- 없음\n`;
  } else {
    for (const b of blocked) {
      md += `- ${b.name}: ${b.reason}\n`;
    }
  }

  fs.writeFileSync(ASIDE_RESULT_PATH, md, "utf8");
  console.log(`\n======================================================`);
  console.log(`성공적으로 저장되었습니다: ${ASIDE_RESULT_PATH}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("실행 오류:", err);
  process.exit(1);
});
