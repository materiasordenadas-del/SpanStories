"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import styles from "@/components/accounts/accounts.module.css";
import { listStudentTeachers, normalizeCode } from "@/features/accounts/account-service";
import { listStudentTasks } from "@/features/accounts/task-service";
import { taskContentLabel, taskKindLabel } from "@/features/accounts/task-progress";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { TeacherStudent, TeacherTask } from "@/features/accounts/types";

function taskHref(task: TeacherTask): string {
  if (task.kind === "story") {
    const [island, story] = task.content.storyKey.split("/");
    return `/islas/${island}/${story}`;
  }
  if (task.kind === "flashcards") return "/progreso/practica/flashcards";
  return `/progreso/practica/verbos?origen=${task.content.source}`;
}

const dateText = (date: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);

function StudentPageContent() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [teachers, setTeachers] = useState<TeacherStudent[]>([]);
  const [tasks, setTasks] = useState<TeacherTask[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [teacherResult, taskResult] = await Promise.allSettled([
        listStudentTeachers(user.uid),
        listStudentTasks(user.uid),
      ]);
      setTeachers(teacherResult.status === "fulfilled" ? teacherResult.value : []);
      setTasks(taskResult.status === "fulfilled" ? [...taskResult.value].sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis()) : []);
      setLoading(false);
    };
    void load();
  }, [user]);

  return <main className={styles.main}>
    <div className={styles.toolbar}><div><p className={styles.eyebrow}>Cuenta estudiante</p><h1 className={styles.title}>Hola, {profile?.displayName}</h1></div><Link className={`${styles.button} ${styles.secondary}`} href="/niveles">Ir a las historias</Link></div>
    <section><h2>Usar una invitación</h2><form className={styles.row} onSubmit={(event) => { event.preventDefault(); const value = normalizeCode(code); if (value) router.push(`/join/${value}`); }}><label className={styles.field}>Código de invitación<input className={styles.input} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="X7F4KD" value={code} /></label><button className={styles.button} type="submit">Usar código</button></form></section>
    <section className={styles.studentSection}><h2>Mis tareas</h2>{loading ? <p>Cargando…</p> : tasks.length === 0 ? <p className={styles.empty}>No tienes tareas asignadas ahora.</p> : <div className={styles.classGrid}>{tasks.map((task) => {
      const available = task.startsAt.toDate() <= new Date();
      return <article className={styles.taskCard} key={task.id}><p className={styles.eyebrow}>{taskKindLabel(task)}</p><h3>{task.title}</h3><p>{taskContentLabel(task)}</p><p className={styles.taskMeta}>{available ? `Entrega: ${dateText(task.dueAt.toDate())}` : `Disponible: ${dateText(task.startsAt.toDate())}`}</p>{available ? <Link className={`${styles.button} ${styles.secondary}`} href={taskHref(task)}>Abrir tarea</Link> : null}</article>;
    })}</div>}</section>
    <section className={styles.studentSection}><h2>Mis profesores</h2>{loading ? <p>Cargando…</p> : teachers.length ? <><div className={styles.classGrid}>{teachers.map((item) => <div className={styles.classCard} key={item.teacherId}><h3>{item.teacherName}</h3><span>Desde el {item.joinedAt?.toDate?.().toLocaleDateString("es") ?? "hoy"}</span></div>)}</div><p className={styles.user}>Tus profesores ven las historias que terminas, tus palabras guardadas y tus resultados de práctica.</p></> : <p className={styles.empty}>Todavía no tienes profesor. Si te envía un enlace o un código, úsalo aquí.</p>}</section>
  </main>;
}

export default function StudentPage() {
  return <ProtectedAccount role="student"><StudentPageContent /></ProtectedAccount>;
}
