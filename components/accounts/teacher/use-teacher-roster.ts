"use client";

import { useCallback, useEffect, useState } from "react";
import { listTeacherInvites, listTeacherStudents } from "@/features/accounts/account-service";
import { useAuth } from "@/features/accounts/AuthProvider";
import { EMPTY_PROGRESS, loadStudentProgress, type StudentProgress } from "@/features/accounts/progress-service";
import type { ProgressEvent } from "@/features/accounts/progress-summary";
import type { TeacherInvite, TeacherStudent } from "@/features/accounts/types";

export type RosterStudent = { readonly link: TeacherStudent; readonly progress: StudentProgress; readonly events: readonly ProgressEvent[] };

type Roster = {
  readonly loading: boolean;
  readonly error: string;
  readonly students: readonly RosterStudent[];
  /** Invitaciones sin usar: tarjetas vacías hasta que alguien entra con su cuenta. */
  readonly invites: readonly TeacherInvite[];
};

const createdMillis = (invite: TeacherInvite) => invite.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

/** Estudiantes del profesor con su progreso sincronizado, e invitaciones sin usar. */
export function useTeacherRoster() {
  const { user } = useAuth();
  const [roster, setRoster] = useState<Roster>({ loading: true, error: "", students: [], invites: [] });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [links, invites] = await Promise.all([listTeacherStudents(user.uid), listTeacherInvites(user.uid)]);
        const students = await Promise.all(links.map(async (link) => {
          // Si su progreso no se puede leer, la persona sigue en la lista, sin datos.
          const loaded = await loadStudentProgress(link.studentId).catch(() => ({ progress: EMPTY_PROGRESS, events: [] }));
          return { link, ...loaded };
        }));
        if (cancelled) return;
        setRoster({
          loading: false,
          error: "",
          students: students.sort((a, b) => a.link.studentName.localeCompare(b.link.studentName, "es")),
          invites: invites.filter((invite) => invite.active).sort((a, b) => createdMillis(a) - createdMillis(b)),
        });
      } catch {
        if (!cancelled) setRoster({ loading: false, error: "No pudimos cargar tus estudiantes. Revisa la conexión e inténtalo de nuevo.", students: [], invites: [] });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user]);

  const removeInvite = useCallback((code: string) => {
    setRoster((current) => ({ ...current, invites: current.invites.filter((invite) => invite.code !== code) }));
  }, []);

  const removeStudent = useCallback((studentId: string) => {
    setRoster((current) => ({ ...current, students: current.students.filter((student) => student.link.studentId !== studentId) }));
  }, []);

  return { ...roster, removeInvite, removeStudent };
}

export function lastActivityOf(student: RosterStudent): Date | null {
  const times = [student.progress.lastActivityAt, student.events[0]?.at ?? null].flatMap((date) => date === null ? [] : [date.getTime()]);
  return times.length === 0 ? null : new Date(Math.max(...times));
}
