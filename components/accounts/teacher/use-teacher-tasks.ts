"use client";

import { useCallback, useEffect, useState } from "react";
import { listTaskAssignees, listTeacherTasks } from "@/features/accounts/task-service";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { TaskAssignee, TeacherTask } from "@/features/accounts/types";

export type TeacherTaskWithAssignees = { readonly task: TeacherTask; readonly assignees: readonly TaskAssignee[] };

type TaskState = { readonly loading: boolean; readonly error: string; readonly tasks: readonly TeacherTaskWithAssignees[] };

const INITIAL: TaskState = { loading: true, error: "", tasks: [] };

/** Tareas propias y sus destinatarios. Nunca consulta tareas de otros profesores. */
export function useTeacherTasks() {
  const { user } = useAuth();
  const [state, setState] = useState<TaskState>(INITIAL);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const tasks = await listTeacherTasks(user.uid);
        const withAssignees = await Promise.all(tasks.map(async (task) => ({ task, assignees: await listTaskAssignees(task.id) })));
        if (!cancelled) setState({ loading: false, error: "", tasks: withAssignees.sort((a, b) => b.task.dueAt.toMillis() - a.task.dueAt.toMillis()) });
      } catch {
        if (!cancelled) setState({ loading: false, error: "No pudimos cargar las tareas. Revisa la conexión e inténtalo de nuevo.", tasks: [] });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [revision, user]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, reload };
}
