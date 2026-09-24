"use client";

import { useSyncExternalStore } from "react";
import { hoursSince } from "@/lib/time";

const STALE_HOURS = 24;
const subscribe = () => () => {};

/** 정적 배포라 "얼마나 오래됐는지"는 빌드가 아니라 보는 시점의 브라우저 시간으로 계산한다. */
export function StaleBadge({ updatedAt }: { updatedAt: string }) {
  const stale = useSyncExternalStore(
    subscribe,
    () => hoursSince(updatedAt) > STALE_HOURS,
    () => false,
  );
  if (!stale) return null;
  return (
    <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
      {STALE_HOURS}시간 넘음 · 가격이 달라졌을 수 있음
    </span>
  );
}
