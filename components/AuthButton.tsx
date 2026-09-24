"use client";

import { secondaryButtonClass } from "@/lib/ui";
import { useAuth } from "./AuthProvider";

export function AuthButton() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return <span className="text-xs text-zinc-500">로그인 확인 중…</span>;

  if (!user) {
    return (
      <button type="button" className={secondaryButtonClass} onClick={signIn}>
        Google로 로그인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-600 dark:text-zinc-400">{user.email}</span>
      <button type="button" className={secondaryButtonClass} onClick={signOut}>
        로그아웃
      </button>
    </div>
  );
}
