"use client";

import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isAllowedEmail } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  type JobDoc,
  JobDocSchema,
  WORKER_OFFLINE_MS,
  addDays,
  isActive,
  makeSearchRequestSchema,
  todayKst,
} from "@/lib/jobs";
import { type Hotel, HotelSchema } from "@/lib/schema";
import { useAuth } from "./AuthProvider";

const inputClass =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ResultsMeta {
  finishedAt: string | null;
  truncated: boolean;
  total: number;
}

const STATUS_TEXT: Record<JobDoc["status"], string> = {
  queued: "대기 중 — 자택 PC 워커가 가져가길 기다립니다.",
  running: "수집 중… 몇 분 걸릴 수 있습니다.",
  done: "완료",
  error: "실패",
};

const TICK_MS = 15_000;

function subscribeTick(cb: () => void) {
  const id = setInterval(cb, TICK_MS);
  return () => clearInterval(id);
}

/**
 * 오늘(KST)과 현재 시각을 15초 단위로 준다. 서버 prerender 값은 빈 값이라, 빌드 시점 날짜가
 * 화면에 박혀 hydration 경고가 나는 일이 없다.
 */
function useClock(): { today: string; now: number } {
  const now = useSyncExternalStore(
    subscribeTick,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  );
  return { now, today: now === 0 ? "" : todayKst(new Date(now)) };
}

export function SearchPanel({ onResults }: { onResults: (hotels: Hotel[]) => void }) {
  const { user, loading, error: authError, signIn } = useAuth();
  const allowed = !!user && user.emailVerified && isAllowedEmail(user.email);
  const uid = user?.uid;

  const { today, now } = useClock();

  const [region, setRegion] = useState("");
  // null = 사용자가 아직 안 건드림 → 오늘 기준 기본값(체크인 내일, 체크아웃 체크인+1)을 보여 준다.
  const [checkinInput, setCheckin] = useState<string | null>(null);
  const [checkoutInput, setCheckout] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState(50000);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [job, setJob] = useState<JobDoc | null>(null);
  const [meta, setMeta] = useState<ResultsMeta | null>(null);
  const [workerSeen, setWorkerSeen] = useState<number | null>(null);

  const checkin = checkinInput ?? (today ? addDays(today, 1) : "");
  const checkout = checkoutInput ?? (ISO_DATE.test(checkin) ? addDays(checkin, 1) : "");

  useEffect(() => {
    if (!allowed || !uid) return;
    const { db } = getFirebase();
    const unsubJob = onSnapshot(doc(db, "searchJobs", uid), (snap) => {
      const parsed = snap.exists() ? JobDocSchema.safeParse(snap.data()) : null;
      setJob(parsed?.success ? parsed.data : null);
    });
    const unsubResults = onSnapshot(doc(db, "searchResults", uid), (snap) => {
      const data = snap.data();
      if (!data || !Array.isArray(data.hotels)) return;
      // 스키마를 통과한 항목만 쓴다 (수집기·ingest와 같은 기준).
      const hotels = data.hotels.flatMap((h: unknown) => {
        const r = HotelSchema.safeParse(h);
        return r.success ? [r.data] : [];
      });
      onResults(hotels);
      setMeta({
        finishedAt: typeof data.finishedAt === "string" ? data.finishedAt : null,
        truncated: data.truncated === true,
        total: typeof data.total === "number" ? data.total : hotels.length,
      });
    });
    const unsubWorker = onSnapshot(doc(db, "config", "worker"), (snap) => {
      const seen = snap.data()?.lastSeen;
      setWorkerSeen(typeof seen === "string" ? Date.parse(seen) : null);
    });
    return () => {
      unsubJob();
      unsubResults();
      unsubWorker();
      // 로그아웃·계정 전환 시 이전 사용자의 상태와 결과를 비운다.
      setJob(null);
      setMeta(null);
      setWorkerSeen(null);
      onResults([]);
    };
    // onResults는 부모가 안정적인 setState를 넘기므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, uid]);

  function onCheckinChange(value: string) {
    setCheckin(value);
    // 체크아웃이 체크인보다 뒤가 아니게 되면 다음 날로 맞춘다. 뒤에 있으면 사용자 입력을 건드리지 않는다.
    if (ISO_DATE.test(value) && (!ISO_DATE.test(checkout) || checkout <= value)) {
      setCheckout(addDays(value, 1));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !allowed) return;
    const parsed = makeSearchRequestSchema().safeParse({ region, checkin, checkout, maxPrice });
    if (!parsed.success) {
      setFormErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    setFormErrors([]);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await setDoc(doc(getFirebase().db, "searchJobs", user.uid), {
        ...parsed.data,
        status: "queued",
        requestedAt: serverTimestamp(),
        email: user.email,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSubmitError(
        code === "permission-denied"
          ? "요청이 거부됐습니다. 진행 중인 탐색이 있거나 권한이 없습니다."
          : "요청을 보내지 못했습니다. 잠시 후 다시 시도하세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const workerOffline = workerSeen === null || now - workerSeen > WORKER_OFFLINE_MS;
  const busy = submitting || isActive(job?.status);

  return (
    <section className="flex flex-col gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">최저가 탐색</h2>

      {loading && <p className="text-xs text-zinc-500">로그인 확인 중…</p>}

      {!loading && !user && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          로그인한 사용자만 탐색할 수 있습니다.{" "}
          <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={signIn}>
            Google로 로그인
          </button>
          {authError && <span className="ml-2 text-red-600 dark:text-red-400">{authError}</span>}
        </p>
      )}

      {!loading && user && !allowed && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {user.email} 계정은 탐색 권한이 없습니다. 허용된 계정으로 로그인하세요.
        </p>
      )}

      {allowed && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">
              지역
              <input
                className={inputClass}
                value={region}
                maxLength={20}
                placeholder="예: 포천"
                onChange={(e) => setRegion(e.target.value)}
              />
            </label>
            <label className="text-xs">
              체크인
              <input
                type="date"
                className={inputClass}
                value={checkin}
                min={today || undefined}
                onChange={(e) => onCheckinChange(e.target.value)}
              />
            </label>
            <label className="text-xs">
              체크아웃
              <input
                type="date"
                className={inputClass}
                value={checkout}
                min={ISO_DATE.test(checkin) ? addDays(checkin, 1) : undefined}
                onChange={(e) => setCheckout(e.target.value)}
              />
            </label>
            <label className="text-xs">
              최대 가격(원)
              <input
                type="number"
                className={inputClass}
                step={1000}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          {formErrors.length > 0 && (
            <ul className="text-xs text-red-600 dark:text-red-400" role="alert">
              {formErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "탐색 중…" : "최저가 탐색"}
            </button>
            {job && (
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {job.region} · {job.checkin} ~ {job.checkout} · {STATUS_TEXT[job.status]}
                {job.status === "error" && job.error ? ` (${job.error})` : ""}
              </span>
            )}
          </div>

          {submitError && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {submitError}
            </p>
          )}
          {now > 0 && workerOffline && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              자택 PC 워커가 꺼져 있는 것 같습니다. 요청은 대기열에 남고, PC에서 <code>npm run worker</code>를
              실행하면 처리됩니다.
            </p>
          )}
          {meta && (
            <p className="text-xs text-zinc-500">
              마지막 탐색 결과 {meta.total}곳
              {meta.truncated ? " (가격 낮은 순 일부만 표시)" : ""}
              {meta.finishedAt &&
                ` · ${new Date(meta.finishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
