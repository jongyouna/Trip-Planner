// 사용법: npm run worker
// 웹 대시보드의 "최저가 탐색" 요청(Firestore searchJobs/{uid})을 자택 PC에서 받아 수집한다.
// 필요: GOOGLE_APPLICATION_CREDENTIALS = Firebase 서비스 계정 키 JSON 경로 (리포 밖에 보관, 커밋 금지).
// 설정 절차는 docs/firebase-setup.md 참고.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, type Firestore, getFirestore } from "firebase-admin/firestore";
import { isAllowedEmail } from "../lib/auth";
import { MAX_RESULT_HOTELS, makeSearchRequestSchema } from "../lib/jobs";
import { runCollect } from "./collect";
import { jitter, sleep } from "./core";

const PROJECT_ID = "buja-map-b52eb";
const HEARTBEAT_MS = 30_000;
/** 요청 사이 최소 간격. 개인용·저빈도 원칙. */
const COOLDOWN_MS = 5_000;

const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString("ko-KR")}] ${msg}`);

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db: Firestore = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const jobRef = (uid: string) => db.collection("searchJobs").doc(uid);
const workerRef = db.collection("config").doc("worker");

async function heartbeat(online = true) {
  const lastSeen = online ? new Date().toISOString() : new Date(0).toISOString();
  await workerRef.set({ lastSeen }, { merge: true }).catch((e) => log(`heartbeat 실패: ${e}`));
}

/** queued → running 으로 원자적으로 바꾼다. 그사이 사용자가 요청을 덮어썼다면 트랜잭션이 재시도한다. */
async function claim(uid: string): Promise<Record<string, unknown> | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef(uid));
    if (!snap.exists || snap.data()?.status !== "queued") return null;
    tx.update(jobRef(uid), {
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: FieldValue.delete(),
      error: FieldValue.delete(),
    });
    return snap.data() as Record<string, unknown>;
  });
}

async function fail(uid: string, message: string) {
  log(`실패 ${uid}: ${message}`);
  await jobRef(uid).update({
    status: "error",
    finishedAt: new Date().toISOString(),
    error: message.slice(0, 200),
  });
}

async function handle(uid: string) {
  const data = await claim(uid);
  if (!data) return;

  // 규칙(isRootAdmin)이 1차로 막지만, 문서의 email 필드는 클라이언트가 쓴 값이라 믿지 않고
  // Firebase Auth에서 계정 이메일을 직접 확인한다.
  const account = await getAuth().getUser(uid).catch(() => null);
  if (!account || !account.emailVerified || !isAllowedEmail(account.email)) {
    return fail(uid, "허용되지 않은 계정입니다.");
  }

  const parsed = makeSearchRequestSchema().safeParse(data);
  if (!parsed.success) return fail(uid, parsed.error.issues[0]?.message ?? "잘못된 요청입니다.");
  const query = parsed.data;

  log(`탐색 시작: ${query.region} ${query.checkin}~${query.checkout} ≤${query.maxPrice}원`);
  try {
    const { hotels, results } = await runCollect(query, ["yanolja"], { fetchAddress: true, log });
    const problem = results.find((r) => r.status !== "ok");
    if (problem) {
      // 차단(BlockedError)은 우회하지 않고 그대로 실패로 알린다.
      return fail(uid, problem.status === "blocked" ? `사이트가 접근을 막았습니다: ${problem.error}` : (problem.error ?? "수집 실패"));
    }
    const sorted = [...hotels].sort((a, b) => a.price - b.price);
    const shown = sorted.slice(0, MAX_RESULT_HOTELS);
    const finishedAt = new Date().toISOString();
    await db.collection("searchResults").doc(uid).set({
      query,
      hotels: shown,
      total: sorted.length,
      truncated: sorted.length > shown.length,
      finishedAt,
    });
    await jobRef(uid).update({ status: "done", finishedAt });
    log(`탐색 완료: ${sorted.length}곳`);
  } catch (e) {
    await fail(uid, e instanceof Error ? e.message : String(e));
  }
}

// 한 번에 1건씩 순차 처리한다 (브라우저 프로필 하나를 공유하므로 동시 실행 금지).
const pending: string[] = [];
let draining = false;

function enqueue(uid: string) {
  if (!pending.includes(uid)) pending.push(uid);
  void drain();
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.length > 0) {
      const uid = pending.shift()!;
      await handle(uid).catch((e) => log(`처리 오류 ${uid}: ${e}`));
      if (pending.length > 0) await sleep(jitter(COOLDOWN_MS));
    }
  } finally {
    draining = false;
  }
}

async function main() {
  // 이전 실행이 비정상 종료돼 running으로 남은 요청을 정리한다.
  const stale = await db.collection("searchJobs").where("status", "==", "running").get();
  for (const d of stale.docs) await fail(d.id, "워커가 재시작되어 중단됐습니다. 다시 요청하세요.");

  await heartbeat();
  const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS);

  db.collection("searchJobs")
    .where("status", "==", "queued")
    .onSnapshot(
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "removed") enqueue(change.doc.id);
        }
      },
      (e) => {
        console.error(`구독 오류: ${e.message}`);
        process.exit(1);
      },
    );
  log("워커 시작. 요청을 기다립니다. (종료: Ctrl+C)");

  const stop = async () => {
    clearInterval(timer);
    await heartbeat(false);
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
