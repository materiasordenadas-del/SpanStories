"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createStudentInvite, deleteTeacherInvite, removeTeacherStudent } from "@/features/accounts/account-service";
import { useAuth } from "@/features/accounts/AuthProvider";
import { finishedCount } from "@/features/accounts/progress-summary";
import type { PublishedStory } from "@/lib/adapters/teacher-lookup";
import { copyText, formatOn, formatSince, inviteUrl, plural } from "./helpers";
import { AvatarFigure, MoreMenu, PendingFigure, PlusIcon, avatarTint, tintStyle } from "./parts";
import { TeacherShell } from "./TeacherShell";
import t from "./teacher.module.css";
import { lastActivityOf, useTeacherRoster } from "./use-teacher-roster";

export function TeacherStudentsScreen({ stories, freshCode }: { stories: readonly PublishedStory[]; freshCode: string | null }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const { loading, error, students, invites, removeInvite, removeStudent } = useTeacherRoster();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const published = useMemo(() => new Set(stories.map((story) => story.key)), [stories]);

  const add = async () => {
    if (!user || !profile) return;
    setAdding(true);
    setActionError("");
    try {
      const code = await createStudentInvite(user.uid, profile.displayName);
      router.push(`/teacher/invitaciones/${code}?nueva=1`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo crear la invitación.");
      setAdding(false);
    }
  };

  const copy = async (code: string) => {
    if (!(await copyText(inviteUrl(code)))) {
      router.push(`/teacher/invitaciones/${code}`);
      return;
    }
    setCopied(code);
    window.setTimeout(() => setCopied((current) => current === code ? null : current), 1600);
  };

  const remove = async (code: string) => {
    setActionError("");
    try {
      await deleteTeacherInvite(code);
      removeInvite(code);
    } catch {
      setActionError("No se pudo eliminar la invitación. Inténtalo de nuevo.");
    }
  };

  const unlink = async (studentId: string, name: string) => {
    if (!user || !window.confirm(`¿Quitar a ${name}? Dejará de ver tus tareas y ya no podrás consultar su progreso.`)) return;
    setActionError("");
    try {
      await removeTeacherStudent(user.uid, studentId);
      removeStudent(studentId);
    } catch {
      setActionError("No se pudo quitar al estudiante. Inténtalo de nuevo.");
    }
  };

  const addButton = <button className={`${t.btn} ${t.secondary}`} disabled={adding} onClick={() => void add()} type="button"><PlusIcon />{adding ? "Creando invitación…" : "Añadir estudiante"}</button>;
  const summary = plural(students.length, "estudiante", "estudiantes") + (invites.length > 0 ? ` y ${plural(invites.length, "invitación sin usar", "invitaciones sin usar")}` : "");

  return <TeacherShell>
    <main className={t.screen}>
      <div className={t.head}>
        <div>
          <h1 className={t.title}>Tus estudiantes</h1>
          <p className={t.lede}>{loading ? " " : summary}</p>
        </div>
        <div className={t.actions}>
          {addButton}
          <Link className={`${t.btn} ${t.primary}`} href="/teacher/tareas">Crear tarea</Link>
        </div>
      </div>
      {error || actionError ? <p className={t.error} role="alert">{error || actionError}</p> : null}
      {loading ? <p className={t.loading}>Cargando estudiantes…</p>
        : students.length === 0 && invites.length === 0
          ? error ? null : <section className={t.empty}>
            <h2>Añade a tu primer estudiante</h2>
            <p>Crearás un enlace personal para enviárselo. Cuando entre con su cuenta de estudiante, su nombre aparecerá en su tarjeta y podrás ver su progreso.</p>
            {addButton}
          </section>
          : <ul className={t.cards}>
            {students.map(({ link, progress, events }) => {
              const last = lastActivityOf({ link, progress, events });
              const href = `/teacher/estudiantes/${link.studentId}`;
              return <li className={t.card} key={link.studentId}>
                <Link className={t.cardLink} href={href}>
                  <span className={t.art} style={tintStyle(avatarTint(link.studentId))}><AvatarFigure seed={link.studentId} /></span>
                  <span className={t.kbody}>
                    <span className={t.kname}>{link.studentName}</span>
                    <span className={t.kmeta}>{finishedCount(progress.finishedStories, published)} de {plural(stories.length, "historia leída", "historias leídas")}</span>
                    <span className={t.kmeta}>{last === null ? "Sin actividad todavía" : `Última actividad: ${formatSince(last)}`}</span>
                  </span>
                </Link>
                <MoreMenu label={`Opciones de ${link.studentName}`}>{(close) => <>
                  <Link href={href} onClick={close}>Ver progreso</Link>
                  <Link href={`${href}?vista=tareas`} onClick={close}>Ver tareas</Link>
                  <button className={t.danger} onClick={() => { close(); void unlink(link.studentId, link.studentName); }} type="button">Quitar estudiante</button>
                </>}</MoreMenu>
              </li>;
            })}
            {invites.map((invite) => <li className={`${t.card} ${t.pending} ${invite.code === freshCode ? t.fresh : ""}`} key={invite.code}>
              <Link className={t.cardLink} href={`/teacher/invitaciones/${invite.code}`}>
                <span className={t.art} style={tintStyle("var(--empty-tint)")}><PendingFigure /><span className={t.namePill} /></span>
                <span className={t.kbody}>
                  <span className={t.kname}>Sin estudiante</span>
                  <span className={t.kmeta}>Invitación creada {formatOn(invite.createdAt?.toDate() ?? null)}</span>
                </span>
              </Link>
              <div className={t.cardFoot}>
                <button className={`${t.btn} ${t.secondary} ${t.small}`} onClick={() => void copy(invite.code)} type="button">{copied === invite.code ? "Enlace copiado" : "Copiar enlace"}</button>
              </div>
              <MoreMenu label="Opciones de la invitación">{(close) => <>
                <Link href={`/teacher/invitaciones/${invite.code}`} onClick={close}>Ver invitación</Link>
                <button onClick={() => { close(); void copy(invite.code); }} type="button">Copiar enlace</button>
                <button className={t.danger} onClick={() => { close(); void remove(invite.code); }} type="button">Eliminar invitación</button>
              </>}</MoreMenu>
            </li>)}
          </ul>}
    </main>
  </TeacherShell>;
}
