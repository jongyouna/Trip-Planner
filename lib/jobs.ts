import { z } from "zod";

/**
 * 탐색 요청. 브라우저(SearchPanel)·워커(collector/worker.ts)·CLI가 같은 규칙으로 검증한다.
 * Firestore 문서: searchJobs/{uid} (요청·상태), searchResults/{uid} (워커가 쓰는 결과).
 */
export const MAX_NIGHTS = 30;
export const MAX_DAYS_AHEAD = 365;
export const MIN_PRICE = 10_000;
export const MAX_PRICE = 500_000;
/** 결과 문서 1MiB 제한을 넘지 않도록 가격 낮은 순으로 자르는 상한 */
export const MAX_RESULT_HOTELS = 300;
/** 이 시간 넘게 워커 heartbeat가 없으면 오프라인으로 본다. */
export const WORKER_OFFLINE_MS = 2 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD에 일수를 더한다 (UTC 기준 달력 계산). */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 한국 날짜(YYYY-MM-DD). 체크인 "오늘 이후" 판정 기준. */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function nightsBetween(checkin: string, checkout: string): number {
  return Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / DAY_MS);
}

export function makeSearchRequestSchema(today: string = todayKst()) {
  return z
    .object({
      region: z.string().trim().min(1, "지역을 입력하세요.").max(20, "지역은 20자 이하로 입력하세요."),
      checkin: z.iso.date("체크인 날짜를 입력하세요."),
      checkout: z.iso.date("체크아웃 날짜를 입력하세요."),
      maxPrice: z
        .number()
        .int()
        .min(MIN_PRICE, `최대 가격은 ${MIN_PRICE.toLocaleString("ko-KR")}원 이상이어야 합니다.`)
        .max(MAX_PRICE, `최대 가격은 ${MAX_PRICE.toLocaleString("ko-KR")}원 이하여야 합니다.`),
    })
    .superRefine((v, ctx) => {
      if (v.checkin < today) {
        ctx.addIssue({ code: "custom", path: ["checkin"], message: "체크인은 오늘 이후여야 합니다." });
      } else if (v.checkin > addDays(today, MAX_DAYS_AHEAD)) {
        ctx.addIssue({ code: "custom", path: ["checkin"], message: "체크인은 1년 이내여야 합니다." });
      }
      if (v.checkout <= v.checkin) {
        ctx.addIssue({ code: "custom", path: ["checkout"], message: "체크아웃은 체크인보다 뒤여야 합니다." });
      } else if (nightsBetween(v.checkin, v.checkout) > MAX_NIGHTS) {
        ctx.addIssue({ code: "custom", path: ["checkout"], message: `숙박은 ${MAX_NIGHTS}박 이하여야 합니다.` });
      }
    });
}
export type SearchRequest = z.infer<ReturnType<typeof makeSearchRequestSchema>>;

export const JOB_STATUSES = ["queued", "running", "done", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** 진행 중이면 결과가 바뀔 예정이라 새 요청을 받지 않는다. */
export const isActive = (s: JobStatus | undefined): boolean => s === "queued" || s === "running";

/** searchJobs/{uid}에서 화면이 읽는 필드(요청 + 워커가 채우는 상태). */
export const JobDocSchema = z.object({
  status: z.enum(JOB_STATUSES),
  region: z.string(),
  checkin: z.string(),
  checkout: z.string(),
  maxPrice: z.number(),
  email: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
});
export type JobDoc = z.infer<typeof JobDocSchema>;
