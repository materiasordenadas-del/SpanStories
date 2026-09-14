"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/features/accounts/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { MenuIcon } from "./parts";
import t from "./teacher.module.css";

const SECTIONS = [
  { href: "/teacher", label: "Estudiantes", current: (path: string) => path === "/teacher" || path.startsWith("/teacher/estudiantes") },
  { href: "/teacher/tareas", label: "Tareas", current: (path: string) => path.startsWith("/teacher/tareas") },
  { href: "/teacher/progreso", label: "Progreso", current: (path: string) => path.startsWith("/teacher/progreso") },
];

function Brand() {
  return <Link aria-label="SpanStories, tus estudiantes" className={t.brand} href="/teacher">SpanStories<span>.</span></Link>;
}

/** Cabecera propia del profesor: solo existe en /teacher. La cuenta de estudiante nunca la ve. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const exit = async () => {
    if (!auth) return;
    await signOut(auth);
    router.replace("/sign-in");
  };

  return <div className={t.page}>
    <header className={t.tbar}>
      <Brand />
      <nav aria-label="Menú del profesor" className={t.tnav} data-open={open} id="menu-profesor">
        {SECTIONS.map((section) => <Link aria-current={section.current(pathname) ? "page" : undefined} href={section.href} key={section.href} onClick={() => setOpen(false)}>{section.label}</Link>)}
        <button className={t.navOut} onClick={() => void exit()} type="button">Cerrar sesión</button>
      </nav>
      <div className={t.who}>
        <span className={t.role}>Cuenta de profesor</span>
        <span className={t.name}>{profile?.displayName}</span>
        <button className={`${t.btn} ${t.secondary} ${t.small}`} onClick={() => void exit()} type="button">Cerrar sesión</button>
      </div>
      <button aria-controls="menu-profesor" aria-expanded={open} className={t.menuBtn} onClick={() => setOpen(!open)} type="button"><MenuIcon />Menú</button>
    </header>
    {children}
  </div>;
}

/** Cabecera mínima de un paso concreto (invitar): solo la marca y la vuelta. */
export function TeacherFlowShell({ children }: { children: ReactNode }) {
  return <div className={t.page}>
    <header className={t.flowbar}>
      <Brand />
      <Link className={t.link} href="/teacher">Volver a tus estudiantes</Link>
    </header>
    {children}
  </div>;
}
