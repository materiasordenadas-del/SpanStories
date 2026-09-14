"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createStudentInvite, deleteTeacherInvite, getTeacherInvite } from "@/features/accounts/account-service";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { TeacherInvite } from "@/features/accounts/types";
import { copyText, formatOn, inviteUrl } from "./helpers";
import { TeacherFlowShell } from "./TeacherShell";
import t from "./teacher.module.css";

/** Invitación personal: enlace y código para una sola persona. */
export function TeacherInviteScreen({ code, isNew }: { code: string; isNew: boolean }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [invite, setInvite] = useState<TeacherInvite | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [flash, setFlash] = useState<"link" | "code" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getTeacherInvite(code).then((found) => { if (!cancelled) setInvite(found); }, () => { if (!cancelled) setInvite(null); });
    return () => { cancelled = true; };
  }, [code]);

  const own = invite && user && invite.teacherId === user.uid ? invite : null;

  const copy = async (what: "link" | "code") => {
    const done = await copyText(what === "link" ? inviteUrl(code) : code);
    setStatus(done ? (what === "link" ? "Enlace copiado." : "Código copiado.") : "No se pudo copiar. Selecciónalo y cópialo a mano.");
    if (!done) return;
    setFlash(what);
    window.setTimeout(() => setFlash((current) => current === what ? null : current), 1600);
  };

  const addAnother = async () => {
    if (!user || !profile) return;
    setBusy(true);
    setError("");
    try {
      router.push(`/teacher/invitaciones/${await createStudentInvite(user.uid, profile.displayName)}?nueva=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la invitación.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteTeacherInvite(code);
      router.push("/teacher");
    } catch {
      setError("No se pudo eliminar la invitación. Inténtalo de nuevo.");
      setBusy(false);
    }
  };

  let content;
  if (invite === undefined) {
    content = <p className={t.loading}>Cargando invitación…</p>;
  } else if (own === null) {
    content = <>
      <h1 className={t.title}>Invitación no disponible</h1>
      <p className={t.lede}>No existe o no es una de tus invitaciones.</p>
      <div className={t.flowNext}><Link className={`${t.btn} ${t.primary} ${t.big}`} href="/teacher">Volver a tus estudiantes</Link></div>
    </>;
  } else if (!own.active) {
    content = <>
      <h1 className={t.title}>Invitación usada</h1>
      <p className={t.lede}>Ya la usó un estudiante: su nombre aparece en su tarjeta.</p>
      <div className={t.flowNext}>
        {own.usedBy ? <Link className={`${t.btn} ${t.primary} ${t.big}`} href={`/teacher/estudiantes/${own.usedBy}`}>Ver su ficha</Link> : null}
        <Link className={`${t.btn} ${t.secondary} ${t.big}`} href="/teacher">Volver a tus estudiantes</Link>
      </div>
    </>;
  } else {
    content = <>
      <h1 className={t.title}>{isNew ? "Invita a un estudiante" : "Invitación sin usar"}</h1>
      <p className={t.lede}>{isNew
        ? "Este enlace es personal: sirve para una sola persona. Cuando entre con su cuenta de estudiante, su nombre aparecerá en la tarjeta."
        : `Creada ${formatOn(own.createdAt?.toDate() ?? null)}. Nadie la ha usado todavía, por eso su tarjeta sigue vacía.`}</p>
      <div className={t.share}>
        <section aria-labelledby="enlace-personal" className={t.shareBlock}>
          <h2 id="enlace-personal">Enlace personal</h2>
          <div className={t.linkBox}><span>/join/{code}</span><button className={`${t.btn} ${t.secondary} ${t.small}`} onClick={() => void copy("link")} type="button">{flash === "link" ? "Copiado" : "Copiar enlace"}</button></div>
          <p className={t.hint}>Envíaselo solo a esa persona: el enlace deja de funcionar cuando alguien lo usa.</p>
        </section>
        <section aria-labelledby="codigo-personal" className={t.shareBlock}>
          <h2 id="codigo-personal">O el código</h2>
          <p aria-label={[...code].join(" ")} className={t.plate}>{[...code].map((letter, index) => <span aria-hidden="true" key={index}>{letter}</span>)}</p>
          <div><button className={`${t.btn} ${t.secondary} ${t.small}`} onClick={() => void copy("code")} type="button">{flash === "code" ? "Copiado" : "Copiar código"}</button></div>
          <p className={t.hint}>Puede escribirlo desde su cuenta de estudiante si no abre el enlace.</p>
        </section>
      </div>
      <p aria-live="polite" className={t.status}>{status}</p>
      {error ? <p className={t.error} role="alert">{error}</p> : null}
      <div className={t.flowNext}>
        <Link className={`${t.btn} ${t.primary} ${t.big}`} href={isNew ? `/teacher?nueva=${code}` : "/teacher"}>Volver a tus estudiantes</Link>
        {isNew ? <button className={`${t.btn} ${t.secondary} ${t.big}`} disabled={busy} onClick={() => void addAnother()} type="button">Añadir otro estudiante</button> : null}
        <button className={`${t.link} ${t.danger}`} disabled={busy} onClick={() => void remove()} type="button">Eliminar invitación</button>
      </div>
    </>;
  }

  return <TeacherFlowShell><main className={t.screen}><div className={t.flowCol}>{content}</div></main></TeacherFlowShell>;
}
