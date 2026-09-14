"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/firebase/client";
import styles from "./accounts.module.css";

export function AccountShell({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const router = useRouter();
  const currentAuth = auth;
  return <div className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/">SpanStories<span>.</span></Link>{signedIn && currentAuth ? <button className={`${styles.button} ${styles.secondary}`} onClick={async () => { await signOut(currentAuth); router.replace("/sign-in"); }} type="button">Cerrar sesión</button> : null}</header>{children}</div>;
}
