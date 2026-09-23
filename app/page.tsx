import { AuthButton } from "@/components/AuthButton";
import { Dashboard } from "@/components/Dashboard";
import { StaleBadge } from "@/components/StaleBadge";
import { loadHotels } from "@/lib/data";

export default function Home() {
  // 정적 export: 빌드 시점의 data/hotels.json이 그대로 페이지가 된다.
  const { hotels, updatedAt } = loadHotels();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">가성비 숙소 대시보드</h1>
        <AuthButton />
      </header>
      <p className="text-xs text-zinc-500">
        마지막 수집 {new Date(updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
        <StaleBadge updatedAt={updatedAt} />
      </p>
      <Dashboard hotels={hotels} />
    </main>
  );
}
