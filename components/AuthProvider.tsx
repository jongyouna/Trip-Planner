"use client";

import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authErrorMessage } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  /** 로그인 상태를 아직 모르는 동안 true */
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(getFirebase().auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebase().auth, email, password);
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code));
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebase().auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
