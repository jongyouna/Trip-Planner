"use client";

import { useState } from "react";
import { inputClass, secondaryButtonClass } from "@/lib/ui";
import { useAuth } from "./AuthProvider";

export function AuthButton() {
  const { user, loading, error, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  }

  if (loading) return <span className="text-xs text-zinc-500">로그인 확인 중…</span>;

  if (!user) {
    return (
      <form onSubmit={onSubmit} className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <input
          type="email"
          required
          autoComplete="username"
          placeholder="이메일"
          className={`${inputClass} w-36`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="비밀번호"
          className={`${inputClass} w-28`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={submitting} className={secondaryButtonClass}>
          {submitting ? "확인 중…" : "로그인"}
        </button>
        {error && <span className="w-full text-right text-red-600 dark:text-red-400">{error}</span>}
      </form>
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
