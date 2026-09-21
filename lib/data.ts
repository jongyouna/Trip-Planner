import fs from "node:fs";
import path from "node:path";
import { type HotelsFile, HotelsFileSchema } from "./schema";

export const HOTELS_PATH = path.join(process.cwd(), "data", "hotels.json");

export function emptyFile(): HotelsFile {
  return { version: 1, updatedAt: new Date(0).toISOString(), hotels: [] };
}

/** data/hotels.json을 읽고 검증한다. 파일이 없으면 빈 데이터, 형식이 틀리면 예외. */
export function loadHotels(filePath: string = HOTELS_PATH): HotelsFile {
  if (!fs.existsSync(filePath)) return emptyFile();
  return HotelsFileSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function saveHotels(file: HotelsFile, filePath: string = HOTELS_PATH): void {
  const validated = HotelsFileSchema.parse(file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(validated, null, 2) + "\n", "utf8");
}
