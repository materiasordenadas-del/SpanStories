"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { AccountRole } from "@/features/accounts/types";
import { AccountShell } from "./AccountShell";
import styles from "./accounts.module.css";

/** `bare`: la página trae su propia cabecera (área del profesor) y no se envuelve en la de cuenta. */
export function ProtectedAccount({ role, children, bare = false }: { role: AccountRole; children: ReactNode; bare?: boolean }) {
  const { user, profile, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (loading || !configured) return;
    if (!user) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (!profile) router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
    else if (profile.role !== role) router.replace(profile.role === "teacher" ? "/teacher" : "/student");
  }, [configured, loading, pathname, profile, role, router, user]);
  if (!configured) return <AccountShell><main className={`${styles.main} ${styles.narrow}`}><h1>Firebase pendiente</h1><p>Configura las variables indicadas en <code>.env.example</code>.</p></main></AccountShell>;
  if (loading || !user || !profile || profile.role !== role) return <AccountShell><main className={styles.loading}>Cargando cuenta…</main></AccountShell>;
  return bare ? <>{children}</> : <AccountShell signedIn>{children}</AccountShell>;
}
