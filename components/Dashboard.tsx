"use client";

import { Suspense, useMemo, useState } from "react";
import { mergeHotels } from "@/lib/merge";
import type { Hotel } from "@/lib/schema";
import { HotelTable } from "./HotelTable";
import { SearchPanel } from "./SearchPanel";

/** 빌드 시점의 정적 데이터에, 로그인 사용자의 최근 탐색 결과를 얹어 표에 넘긴다. */
export function Dashboard({ hotels }: { hotels: Hotel[] }) {
  const [live, setLive] = useState<Hotel[]>([]);
  const merged = useMemo(() => mergeHotels(hotels, live), [hotels, live]);

  return (
    <>
      <SearchPanel onResults={setLive} />
      <Suspense>
        <HotelTable hotels={merged} />
      </Suspense>
    </>
  );
}
