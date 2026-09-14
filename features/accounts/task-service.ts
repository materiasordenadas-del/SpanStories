"use client";

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { TaskAssignee, TeacherTask, TeacherTaskContent, TeacherTaskKind, TeacherStudent } from "./types";

function firestore() {
  if (!db) throw new Error("Firebase no está configurado. Revisa las variables NEXT_PUBLIC_FIREBASE_*.");
  return db;
}

const TASK_LENGTHS = [5, 10, 20, 30] as const;
export type TaskLength = typeof TASK_LENGTHS[number];

export const isTaskLength = (value: number): value is TaskLength => TASK_LENGTHS.includes(value as TaskLength);

type RawTask = Omit<TeacherTask, "id" | "content"> & { readonly content: Record<string, unknown> };

function parseContent(kind: TeacherTaskKind, raw: Record<string, unknown>): TeacherTaskContent | null {
  if (kind === "story" && typeof raw.storyKey === "string") return { kind, storyKey: raw.storyKey };
  if (kind === "flashcards" && typeof raw.minimumCards === "number" && isTaskLength(raw.minimumCards)) return { kind, minimumCards: raw.minimumCards };
  if (kind === "verbs" && (raw.source === "todos" || raw.source === "historias") && typeof raw.minimumQuestions === "number" && isTaskLength(raw.minimumQuestions)) {
    return { kind, source: raw.source, minimumQuestions: raw.minimumQuestions };
  }
  return null;
}

function serializeContent(content: TeacherTaskContent): Record<string, unknown> {
  if (content.kind === "story") return { storyKey: content.storyKey };
  if (content.kind === "flashcards") return { minimumCards: content.minimumCards };
  return { source: content.source, minimumQuestions: content.minimumQuestions };
}

function parseTask(id: string, value: unknown): TeacherTask | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as RawTask;
  if ((raw.kind !== "story" && raw.kind !== "flashcards" && raw.kind !== "verbs") || typeof raw.teacherId !== "string" || typeof raw.title !== "string" || typeof raw.content !== "object" || raw.content === null) return null;
  if (!raw.startsAt || !raw.dueAt) return null;
  const base = { id, teacherId: raw.teacherId, title: raw.title, startsAt: raw.startsAt, dueAt: raw.dueAt, createdAt: raw.createdAt ?? null };
  if (raw.kind === "story") {
    const content = parseContent("story", raw.content);
    return content?.kind === "story" ? { ...base, kind: "story", content } : null;
  }
  if (raw.kind === "flashcards") {
    const content = parseContent("flashcards", raw.content);
    return content?.kind === "flashcards" ? { ...base, kind: "flashcards", content } : null;
  }
  const content = parseContent("verbs", raw.content);
  return content?.kind === "verbs" ? { ...base, kind: "verbs", content } : null;
}

function parseAssignee(value: unknown): TaskAssignee | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TaskAssignee>;
  return typeof raw.studentId === "string" && typeof raw.studentName === "string"
    ? { studentId: raw.studentId, studentName: raw.studentName, assignedAt: raw.assignedAt ?? null }
    : null;
}

export async function createTeacherTask(input: {
  readonly teacherId: string;
  readonly kind: TeacherTaskKind;
  readonly title: string;
  readonly content: TeacherTaskContent;
  readonly startsAt: Date;
  readonly dueAt: Date;
  readonly students: readonly TeacherStudent[];
}): Promise<string> {
  const store = firestore();
  const taskRef = doc(collection(store, "teacherTasks"));
  const batch = writeBatch(store);
  batch.set(taskRef, {
    teacherId: input.teacherId,
    kind: input.kind,
    title: input.title.trim(),
    content: serializeContent(input.content),
    startsAt: input.startsAt,
    dueAt: input.dueAt,
    createdAt: serverTimestamp(),
  });
  for (const student of input.students) {
    batch.set(doc(taskRef, "assignees", student.studentId), {
      studentId: student.studentId,
      studentName: student.studentName,
      assignedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return taskRef.id;
}

export async function listTeacherTasks(teacherId: string): Promise<readonly TeacherTask[]> {
  const snapshot = await getDocs(query(collection(firestore(), "teacherTasks"), where("teacherId", "==", teacherId)));
  return snapshot.docs.flatMap((item) => {
    const task = parseTask(item.id, item.data());
    return task === null ? [] : [task];
  });
}

export async function listTaskAssignees(taskId: string): Promise<readonly TaskAssignee[]> {
  const snapshot = await getDocs(collection(firestore(), "teacherTasks", taskId, "assignees"));
  return snapshot.docs.flatMap((item) => {
    const assignee = parseAssignee(item.data());
    return assignee === null ? [] : [assignee];
  });
}

/** Tareas asignadas a una cuenta de estudiante, con su contenido. */
export async function listStudentTasks(studentId: string): Promise<readonly TeacherTask[]> {
  const store = firestore();
  const assignments = await getDocs(query(collectionGroup(store, "assignees"), where("studentId", "==", studentId)));
  const taskIds = assignments.docs.map((item) => item.ref.parent.parent?.id).filter((id): id is string => id !== undefined);
  const results = await Promise.all(taskIds.map(async (id) => {
    const snapshot = await getDoc(doc(store, "teacherTasks", id));
    return snapshot.exists() ? parseTask(id, snapshot.data()) : null;
  }));
  return results.flatMap((task) => task === null ? [] : [task]);
}
