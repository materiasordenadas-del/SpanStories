"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createTeacherTask, isTaskLength } from "@/features/accounts/task-service";
import { isTaskCompleted, taskContentLabel, taskKindLabel } from "@/features/accounts/task-progress";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { TeacherTaskContent, TeacherTaskKind } from "@/features/accounts/types";
import type { PublishedStory } from "@/lib/adapters/teacher-lookup";
import { formatOn, plural } from "./helpers";
import { TeacherShell } from "./TeacherShell";
import t from "./teacher.module.css";
import { useTeacherRoster } from "./use-teacher-roster";
import { useTeacherTasks } from "./use-teacher-tasks";

const LENGTHS = [5, 10, 20, 30] as const;

const inputDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function taskStatus(startsAt: Date, dueAt: Date) {
  const now = new Date();
  if (startsAt > now) return "Programada";
  if (dueAt < now) return "Fecha vencida";
  return "En curso";
}

function TaskForm({ stories, onClose, onCreated }: { stories: readonly PublishedStory[]; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const { loading, students } = useTeacherRoster();
  const [kind, setKind] = useState<TeacherTaskKind>("story");
  const [title, setTitle] = useState("");
  const [storyKey, setStoryKey] = useState(stories[0]?.key ?? "");
  const [length, setLength] = useState<number>(10);
  const [verbSource, setVerbSource] = useState<"todos" | "historias">("todos");
  const [startsAt, setStartsAt] = useState(() => inputDate(new Date()));
  const [dueAt, setDueAt] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return inputDate(nextWeek);
  });
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const studentIds = selected ?? new Set(students.map(({ link }) => link.studentId));

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current ?? students.map(({ link }) => link.studentId));
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const content = (): TeacherTaskContent | null => {
    if (kind === "story") return storyKey === "" ? null : { kind, storyKey };
    if (!isTaskLength(length)) return null;
    return kind === "flashcards" ? { kind, minimumCards: length } : { kind, source: verbSource, minimumQuestions: length };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const start = new Date(startsAt);
    const due = new Date(dueAt);
    const taskContent = content();
    const assignees = students.filter(({ link }) => studentIds.has(link.studentId)).map(({ link }) => link);
    if (!user || title.trim().length === 0) return setError("Escribe un título para la tarea.");
    if (taskContent === null) return setError("Elige el contenido de la tarea.");
    if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime()) || due < start) return setError("La fecha de entrega debe ser posterior a la de inicio.");
    if (assignees.length === 0) return setError("Elige al menos un estudiante.");
    setSaving(true);
    setError("");
    try {
      await createTeacherTask({ teacherId: user.uid, kind, title, content: taskContent, startsAt: start, dueAt: due, students: assignees });
      onCreated();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la tarea.");
      setSaving(false);
    }
  };

  return <section aria-labelledby="crear-tarea" className={t.taskForm}>
    <div className={t.mainHead}><div><h2 className={t.h1s} id="crear-tarea">Crear tarea</h2><p className={t.hintAfter}>La finalización se calcula con el progreso sincronizado; el estudiante no puede marcarla manualmente.</p></div><button className={`${t.btn} ${t.secondary} ${t.small}`} onClick={onClose} type="button">Cancelar</button></div>
    <form onSubmit={(event) => void submit(event)}>
      <div className={t.taskFields}>
        <label className={t.taskField}>Título<input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Por ejemplo, lectura de la semana" required value={title} /></label>
        <label className={t.taskField}>Tipo<select onChange={(event) => setKind(event.target.value as TeacherTaskKind)} value={kind}><option value="story">Historia</option><option value="flashcards">Tarjetas</option><option value="verbs">Verbos</option></select></label>
        {kind === "story" ? <label className={t.taskField}>Historia<select onChange={(event) => setStoryKey(event.target.value)} value={storyKey}>{stories.map((story) => <option key={story.key} value={story.key}>{story.title}</option>)}</select></label> : null}
        {kind === "flashcards" ? <label className={t.taskField}>Contenido<select onChange={(event) => setLength(Number(event.target.value))} value={length}>{LENGTHS.map((value) => <option key={value} value={value}>{value} palabras guardadas</option>)}</select></label> : null}
        {kind === "verbs" ? <><label className={t.taskField}>Contenido<select onChange={(event) => setVerbSource(event.target.value as "todos" | "historias")} value={verbSource}><option value="todos">Verbos A1</option><option value="historias">Verbos guardados</option></select></label><label className={t.taskField}>Preguntas<select onChange={(event) => setLength(Number(event.target.value))} value={length}>{LENGTHS.map((value) => <option key={value} value={value}>{value} preguntas</option>)}</select></label></> : null}
        <label className={t.taskField}>Disponible desde<input onChange={(event) => setStartsAt(event.target.value)} required type="datetime-local" value={startsAt} /></label>
        <label className={t.taskField}>Fecha de entrega<input onChange={(event) => setDueAt(event.target.value)} required type="datetime-local" value={dueAt} /></label>
      </div>
      <fieldset className={t.assignees} disabled={loading}><legend>Estudiantes</legend><div className={t.assigneeTools}><button className={t.link} onClick={() => setSelected(new Set(students.map(({ link }) => link.studentId)))} type="button">Todos</button><button className={t.link} onClick={() => setSelected(new Set())} type="button">Ninguno</button></div>{students.length === 0 ? <p className={t.hint}>Necesitas al menos un estudiante antes de crear una tarea.</p> : <div className={t.assigneeList}>{students.map(({ link }) => <label key={link.studentId}><input checked={studentIds.has(link.studentId)} onChange={() => toggle(link.studentId)} type="checkbox" />{link.studentName}</label>)}</div>}</fieldset>
      {error === "" ? null : <p className={t.error} role="alert">{error}</p>}
      <button className={`${t.btn} ${t.primary}`} disabled={saving || loading || students.length === 0} type="submit">{saving ? "Creando…" : "Crear tarea"}</button>
    </form>
  </section>;
}

/** Creador y tabla de tareas: una cuenta de profesor solo ve las suyas. */
export function TeacherTasksScreen({ stories }: { stories: readonly PublishedStory[] }) {
  const [creating, setCreating] = useState(false);
  const { students, loading: rosterLoading } = useTeacherRoster();
  const { tasks, loading, error, reload } = useTeacherTasks();
  const storyTitles = useMemo(() => new Map(stories.map((story) => [story.key, story.title])), [stories]);
  const byStudent = useMemo(() => new Map(students.map((student) => [student.link.studentId, student])), [students]);

  return <TeacherShell><main className={t.screen}>
    <div className={t.head}><div><h1 className={t.title}>Tareas</h1><p className={t.lede}>Asigna una historia o una práctica y consulta cuántas personas la completaron.</p></div><div className={t.actions}>{creating ? null : <button className={`${t.btn} ${t.primary}`} disabled={rosterLoading} onClick={() => setCreating(true)} type="button">Crear tarea</button>}</div></div>
    {creating ? <TaskForm onClose={() => setCreating(false)} onCreated={reload} stories={stories} /> : null}
    {error ? <p className={t.error} role="alert">{error}</p> : null}
    {loading ? <p className={t.loading}>Cargando tareas…</p> : tasks.length === 0 && !creating ? <section className={t.empty}><h2>Todavía no hay tareas</h2><p>Elige una actividad, sus fechas y a quién se la asignas. La aplicación calculará los resultados con el progreso registrado.</p>{rosterLoading ? null : <button className={`${t.btn} ${t.primary}`} onClick={() => setCreating(true)} type="button">Crear la primera tarea</button>}</section> : tasks.length === 0 ? null : <div className={t.tableWrap}><table><thead><tr><th scope="col">Tarea</th><th scope="col">Contenido</th><th scope="col">Fechas</th><th scope="col">Completaron</th><th scope="col">Estado</th></tr></thead><tbody>{tasks.map(({ task, assignees }) => {
      const completed = assignees.filter((assignee) => {
        const student = byStudent.get(assignee.studentId);
        return student !== undefined && isTaskCompleted(task, student.progress, student.events);
      }).length;
      const status = taskStatus(task.startsAt.toDate(), task.dueAt.toDate());
      return <tr key={task.id}><td><strong>{task.title}</strong><span className={t.sub}>{taskKindLabel(task)}</span></td><td>{taskContentLabel(task, (key) => storyTitles.get(key))}</td><td>{formatOn(task.startsAt.toDate())}<br /><span className={t.muted}>Entrega: {formatOn(task.dueAt.toDate())}</span></td><td className={t.num}><strong>{completed} de {assignees.length}</strong><span className={t.sub}>{plural(assignees.length, "estudiante", "estudiantes")}</span></td><td><span className={`${t.pill} ${status === "Fecha vencida" ? t.late : t.todo}`}>{status}</span></td></tr>;
    })}</tbody></table></div>}
  </main></TeacherShell>;
}
