"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PRACTICE_MODE_LABELS,
  activityText,
  answersOf,
  finishedCount,
  practiceTotals,
  repeatedMistakes,
  type PracticeModeKey,
  type PracticeTotals,
} from "@/features/accounts/progress-summary";
import { isTaskCompleted, taskContentLabel, taskKindLabel } from "@/features/accounts/task-progress";
import type { PublishedStory } from "@/lib/adapters/teacher-lookup";
import { formatMoment, formatOn, plural } from "./helpers";
import { AvatarFigure, ChartIcon, ChevronIcon, TaskIcon, avatarTint, tintStyle } from "./parts";
import { TeacherShell } from "./TeacherShell";
import t from "./teacher.module.css";
import { lastActivityOf, useTeacherRoster, type RosterStudent } from "./use-teacher-roster";
import { useTeacherTasks } from "./use-teacher-tasks";

export type StudentView = "progreso" | "tareas";

const MODES: readonly PracticeModeKey[] = ["tarjetas", "verbos"];

function PracticeRow({ mode, totals }: { mode: PracticeModeKey; totals: PracticeTotals }) {
  const answers = answersOf(totals);
  if (answers === 0) {
    return <div className={t.prac}><strong className={t.pracLabel}>{PRACTICE_MODE_LABELS[mode]}</strong><p className={t.muted}>Aún no ha practicado.</p></div>;
  }
  const width = (n: number) => ({ width: `${(n / answers) * 100}%` });
  return <div className={t.prac}>
    <strong className={t.pracLabel}>{PRACTICE_MODE_LABELS[mode]}<small>{plural(answers, "respuesta", "respuestas")}</small></strong>
    <div>
      <div aria-label={`${totals.correct} aciertos, ${totals.incorrect} fallos, ${totals.revealed} «No lo sé»`} className={t.stackBar} role="img">
        <i className={t.ok} style={width(totals.correct)} /><i className={t.bad} style={width(totals.incorrect)} /><i className={t.skip} style={width(totals.revealed)} />
      </div>
      <ul className={t.legend}>
        <li><i className={`${t.sw} ${t.ok}`} /><b>{totals.correct}</b> aciertos</li>
        <li><i className={`${t.sw} ${t.bad}`} /><b>{totals.incorrect}</b> fallos</li>
        <li><i className={`${t.sw} ${t.skip}`} /><b>{totals.revealed}</b> «No lo sé»</li>
      </ul>
    </div>
  </div>;
}

function ProgressPanel({ student, stories, words }: { student: RosterStudent; stories: readonly PublishedStory[]; words: Readonly<Record<string, string>> }) {
  const { link, progress, events } = student;
  const first = link.studentName.split(" ")[0];
  const titles = new Map(stories.map((story) => [story.key, story.title]));
  const read = finishedCount(progress.finishedStories, new Set(titles.keys()));
  const totals = practiceTotals(events);
  const sessions = totals.tarjetas.sessions + totals.verbos.sessions;
  const mistakes = repeatedMistakes(events);
  const saved = progress.savedWords.flatMap((key) => words[key] === undefined ? [] : [{ key, word: words[key] }]);
  const unpublished = progress.savedWords.length - saved.length;
  const joinedAt = link.joinedAt?.toDate() ?? null;
  const activity = [
    ...events.slice(0, 8).map((event) => ({ id: event.id, at: event.at, text: activityText(event, (key) => titles.get(key)) })),
    { id: "joined", at: joinedAt, text: "Se unió con su invitación personal" },
  ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));

  return <section aria-labelledby="ficha-progreso" className={t.mainCol}>
    <div className={t.mainHead}><h1 className={t.h1s} id="ficha-progreso">Progreso</h1></div>
    {progress.updatedAt === null && events.length === 0
      ? <p className={t.notice}>{first} aún no ha usado SpanStories con su cuenta. Lo que lea y practique aparecerá aquí.</p>
      : null}
    <div className={t.summary}>
      <div><strong>{read} de {stories.length}</strong><span>historias leídas ({stories.length === 1 ? "hay 1 publicada" : `hay ${stories.length} publicadas`})</span></div>
      <div><strong>{progress.savedWords.length}</strong><span>{progress.savedWords.length === 1 ? "palabra guardada" : "palabras guardadas"}</span></div>
      <div><strong>{sessions}</strong><span>{sessions === 1 ? "sesión de práctica" : "sesiones de práctica"}</span></div>
    </div>

    <h2 className={t.secTitle}>Práctica</h2>
    <div className={t.box}>{MODES.map((mode) => <PracticeRow key={mode} mode={mode} totals={totals[mode]} />)}</div>

    <h2 className={t.secTitle}>Lo que más falla</h2>
    {mistakes.length === 0
      ? <p className={t.hint}>{sessions > 0 ? "No tiene fallos en sus prácticas." : "Aparecerá cuando practique."}</p>
      : <div className={t.tableWrap}><table className={t.compact}>
        <thead><tr><th scope="col">Práctica</th><th scope="col">Pregunta</th><th scope="col">Escribió</th><th scope="col">Respuesta correcta</th><th scope="col">Veces</th></tr></thead>
        <tbody>{mistakes.map((mistake, index) => <tr key={index}>
          <td>{mistake.mode === "tarjetas" ? "Tarjetas" : "Verbos"}</td>
          <td lang={mistake.mode === "tarjetas" ? "en" : "es"}>{mistake.prompt}</td>
          <td>
            {mistake.response === "" ? <span className={t.muted}>«No lo sé»</span> : <span className={t.wrong} lang="es">{mistake.response}</span>}
            {mistake.accentsOnly ? <span className={t.sub}><span className={`${t.pill} ${t.todo}`}>Solo la tilde</span></span> : null}
          </td>
          <td><strong lang="es">{mistake.answer}</strong></td>
          <td className={t.num}>{mistake.times}</td>
        </tr>)}</tbody>
      </table></div>}

    <h2 className={t.secTitle}>Palabras guardadas</h2>
    {progress.savedWords.length === 0
      ? <p className={t.hint}>Todavía no ha guardado palabras.</p>
      : <>
        {saved.length > 0 ? <div className={t.chips} lang="es">{saved.map((item) => <span className={t.chip} key={item.key}>{item.word}</span>)}</div> : null}
        <p className={t.hintAfter}>Palabras que {first} guardó para repasar{unpublished > 0 ? `; ${plural(unpublished, "ya no está publicada", "ya no están publicadas")}` : ""}. Guardar no es saber: no es una nota.</p>
      </>}

    <h2 className={t.secTitle}>Última actividad</h2>
    <ol className={`${t.box} ${t.activity}`}>
      {activity.map((item) => <li key={item.id}><time dateTime={item.at?.toISOString()}>{item.at === null ? "Ahora" : formatMoment(item.at)}</time><span>{item.text}</span></li>)}
    </ol>
  </section>;
}

function TasksPanel({ student, stories, tasks }: { student: RosterStudent; stories: readonly PublishedStory[]; tasks: ReturnType<typeof useTeacherTasks>["tasks"] }) {
  const titles = new Map(stories.map((story) => [story.key, story.title]));
  const assigned = tasks.filter((item) => item.assignees.some((assignee) => assignee.studentId === student.link.studentId));
  return <section aria-labelledby="ficha-tareas" className={t.mainCol}>
    <div className={t.mainHead}>
      <h1 className={t.h1s} id="ficha-tareas">Tareas</h1>
      <Link className={`${t.btn} ${t.primary}`} href="/teacher/tareas">Crear tarea</Link>
    </div>
    {assigned.length === 0 ? <section className={t.empty}>
      <h2>Todavía no hay tareas</h2>
      <p>Asigna a {student.link.studentName.split(" ")[0]} una historia, tarjetas de palabras o verbos, con fecha de entrega.</p>
    </section> : <div className={t.tableWrap}><table className={t.compact}><thead><tr><th scope="col">Tarea</th><th scope="col">Contenido</th><th scope="col">Entrega</th><th scope="col">Resultado</th></tr></thead><tbody>{assigned.map(({ task }) => {
      const completed = isTaskCompleted(task, student.progress, student.events);
      return <tr key={task.id}><td><strong>{task.title}</strong><span className={t.sub}>{taskKindLabel(task)}</span></td><td>{taskContentLabel(task, (key) => titles.get(key))}</td><td>{formatOn(task.dueAt.toDate())}</td><td><span className={`${t.pill} ${completed ? t.todo : t.late}`}>{completed ? "Completada" : "Pendiente"}</span></td></tr>;
    })}</tbody></table></div>}
  </section>;
}

/** Ficha de un estudiante: su progreso y sus tareas. */
export function TeacherStudentScreen({ studentId, view, stories, words }: {
  studentId: string;
  view: StudentView;
  stories: readonly PublishedStory[];
  words: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const { loading, error, students } = useTeacherRoster();
  const { tasks } = useTeacherTasks();
  const student = students.find((item) => item.link.studentId === studentId);

  if (loading || student === undefined) {
    return <TeacherShell><main className={t.screen}>
      {loading ? <p className={t.loading}>Cargando ficha…</p> : <>
        {error ? <p className={t.error} role="alert">{error}</p> : null}
        <h1 className={t.title}>Estudiante no disponible</h1>
        <p className={t.lede}>No está entre tus estudiantes.</p>
        <p><Link className={`${t.btn} ${t.secondary}`} href="/teacher">Volver a tus estudiantes</Link></p>
      </>}
    </main></TeacherShell>;
  }

  const base = `/teacher/estudiantes/${studentId}`;
  const last = lastActivityOf(student);
  const taskCount = tasks.filter((item) => item.assignees.some((assignee) => assignee.studentId === studentId)).length;

  return <TeacherShell>
    <main className={t.layout}>
      <aside aria-label="Estudiante" className={t.side}>
        <div className={t.person}>
          <span className={t.avatarLg} style={tintStyle(avatarTint(studentId))}><AvatarFigure seed={studentId} /></span>
          <div className={t.pick}>
            <select aria-label="Cambiar de estudiante" onChange={(event) => router.push(`/teacher/estudiantes/${event.target.value}${view === "tareas" ? "?vista=tareas" : ""}`)} value={studentId}>
              {students.map((item) => <option key={item.link.studentId} value={item.link.studentId}>{item.link.studentName}</option>)}
            </select>
            <ChevronIcon />
          </div>
        </div>
        <nav aria-label="Secciones de la ficha" className={t.sideNav}>
          <Link aria-current={view === "progreso" ? "page" : undefined} href={base}><ChartIcon />Progreso</Link>
          <Link aria-current={view === "tareas" ? "page" : undefined} href={`${base}?vista=tareas`}><TaskIcon />Tareas<span className={t.n}>{taskCount}</span></Link>
        </nav>
        <dl className={t.facts}>
          <div><dt>Se unió</dt><dd>{capitalize(formatOn(student.link.joinedAt?.toDate() ?? null))}</dd></div>
          <div><dt>Última actividad</dt><dd>{last === null ? "Sin actividad todavía" : formatMoment(last)}</dd></div>
        </dl>
        <Link className={`${t.btn} ${t.secondary} ${t.small} ${t.sideTask}`} href="/teacher/tareas">Crear tarea</Link>
      </aside>
      {view === "tareas" ? <TasksPanel stories={stories} student={student} tasks={tasks} /> : <ProgressPanel stories={stories} student={student} words={words} />}
    </main>
  </TeacherShell>;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
