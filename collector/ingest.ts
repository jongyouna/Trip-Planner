// Claude 브라우저 조작 등으로 손수 모은 JSON을 검증하고 data/hotels.json에 병합한다.
// 사용법: npm run ingest -- path/to/hotels.json   (형식: Hotel[] 또는 { hotels: Hotel[] })
import fs from "node:fs";
import { z } from "zod";
import { HotelSchema } from "../lib/schema";
import { persist } from "./core";

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("사용법: npm run ingest -- <json 파일>");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(raw) ? raw : raw?.hotels;
  const hotels = z.array(HotelSchema).parse(list);
  const total = persist(hotels);
  console.log(`${hotels.length}건 병합 완료 (전체 ${total}건)`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
