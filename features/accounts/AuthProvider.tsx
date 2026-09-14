"use client";

import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth, firebaseConfigured } from "@/lib/firebase/client";
import { getProfile } from "./account-service";
import type { UserProfile } from "./types";

type AuthState = { user: User | null; profile: UserProfile | null; loading: boolean; configured: boolean; refreshProfile: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  const refreshProfile = async () => {
    if (!auth?.currentUser) return setProfile(null);
    setProfile(await getProfile(auth.currentUser.uid));
  };

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      try { setProfile(nextUser ? await getProfile(nextUser.uid) : null); }
      finally { setLoading(false); }
    });
  }, []);

  const value = useMemo(() => ({ user, profile, loading, configured: firebaseConfigured, refreshProfile }), [user, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return value;
}
