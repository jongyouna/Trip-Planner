"use client";

import { useAuth } from "./AuthProvider";

const buttonClass =
  "rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function AuthButton() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return <span className="text-xs text-zinc-500">로그인 확인 중…</span>;

  if (!user) {
    return (
      <button type="button" className={buttonClass} onClick={signIn}>
        Google로 로그인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-600 dark:text-zinc-400">{user.email}</span>
      <button type="button" className={buttonClass} onClick={signOut}>
        로그아웃
      </button>
    </div>
  );
}
