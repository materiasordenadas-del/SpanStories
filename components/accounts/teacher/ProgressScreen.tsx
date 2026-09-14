"use client";

import Link from "next/link";
import { useMemo } from "react";
import { finishedCount, practiceAccuracy } from "@/features/accounts/progress-summary";
import type { PublishedStory } from "@/lib/adapters/teacher-lookup";
import { formatMoment, plural } from "./helpers";
import { Bar, MiniAvatar } from "./parts";
import { TeacherShell } from "./TeacherShell";
import t from "./teacher.module.css";
import { lastActivityOf, useTeacherRoster } from "./use-teacher-roster";

/** Progreso de todos: una fila por estudiante. */
export function TeacherProgressScreen({ stories }: { stories: readonly PublishedStory[] }) {
  const { loading, error, students, invites } = useTeacherRoster();
  const published = useMemo(() => new Set(stories.map((story) => story.key)), [stories]);

  return <TeacherShell>
    <main className={t.screen}>
      <div className={t.head}>
        <div>
          <h1 className={t.title}>Progreso</h1>
          <p className={t.lede}>Cómo va cada estudiante. Pulsa un nombre para ver su ficha completa.</p>
        </div>
      </div>
      {error ? <p className={t.error} role="alert">{error}</p> : null}
      {loading ? <p className={t.loading}>Cargando progreso…</p>
        : students.length === 0 ? error ? null : <section className={t.empty}>
          <h2>Aún no hay estudiantes</h2>
          <p>Cuando alguien use su invitación personal, verás aquí cómo va.</p>
          <Link className={`${t.btn} ${t.secondary}`} href="/teacher">Añadir estudiante</Link>
        </section>
          : <div className={t.tableWrap}><table>
            <thead><tr><th scope="col">Estudiante</th><th scope="col">Historias leídas</th><th scope="col">Aciertos en práctica</th><th scope="col">Palabras guardadas</th><th scope="col">Última actividad</th></tr></thead>
            <tbody>{students.map((student) => {
              const read = finishedCount(student.progress.finishedStories, published);
              const accuracy = practiceAccuracy(student.events);
              const last = lastActivityOf(student);
              const label = `${read} de ${plural(stories.length, "historia", "historias")}`;
              return <tr key={student.link.studentId}>
                <td><span className={t.personCell}><MiniAvatar seed={student.link.studentId} /><Link href={`/teacher/estudiantes/${student.link.studentId}`}>{student.link.studentName}</Link></span></td>
                <td className={t.meter}><Bar label={label} total={stories.length} value={read} /><p className={t.meterText}><b>{read}</b> de {plural(stories.length, "historia", "historias")}</p></td>
                <td className={t.num}>{accuracy === null ? <span className={t.muted}>Sin práctica</span> : `${accuracy} %`}</td>
                <td className={t.num}>{student.progress.savedWords.length}</td>
                <td>{last === null ? <span className={t.muted}>Sin actividad</span> : formatMoment(last)}</td>
              </tr>;
            })}</tbody>
          </table></div>}
      {!loading && invites.length > 0
        ? <p className={t.tableNote}>{plural(invites.length, "invitación sin usar", "invitaciones sin usar")}: aparecerán aquí cuando esas personas se unan. <Link className={t.link} href="/teacher">Ver en Estudiantes</Link></p>
        : null}
    </main>
  </TeacherShell>;
}
