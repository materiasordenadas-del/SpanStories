"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { PracticeMiss, PracticeModeKey, ProgressEvent } from "./progress-summary";

/**
 * Progreso del estudiante en su cuenta, para que sus profesores lo vean.
 * El progreso de la app sigue viviendo en este navegador; aquí se copia:
 *   studentProgress/{uid}            historias terminadas y palabras guardadas
 *   studentProgress/{uid}/events     historias terminadas y sesiones de práctica, con fecha
 */

const MAX_MISSES = 60;
const MAX_TEXT = 200;
const EVENTS_READ = 200;

let syncedStudentId: string | null = null;

/** Lo fija ProgressSync: solo una cuenta de estudiante con sesión iniciada guarda actividad. */
export function setSyncedStudent(uid: string | null) {
  syncedStudentId = uid;
}

export type StudentProgress = {
  readonly finishedStories: readonly string[];
  readonly savedWords: readonly string[];
  readonly lastActivityAt: Date | null;
  readonly updatedAt: Date | null;
};

export const EMPTY_PROGRESS: StudentProgress = { finishedStories: [], savedWords: [], lastActivityAt: null, updatedAt: null };

export async function saveProgressSnapshot(uid: string, snapshot: { finishedStories: readonly string[]; savedWords: readonly string[] }, isActivity: boolean) {
  if (!db) return;
  await setDoc(doc(db, "studentProgress", uid), {
    studentId: uid,
    finishedStories: [...snapshot.finishedStories],
    savedWords: [...snapshot.savedWords],
    updatedAt: serverTimestamp(),
    ...(isActivity ? { lastActivityAt: serverTimestamp() } : {}),
  }, { merge: true });
}

function recordEvent(data: Record<string, unknown>) {
  const store = db;
  const uid = syncedStudentId;
  if (!store || !uid) return;
  const batch = writeBatch(store);
  batch.set(doc(collection(store, "studentProgress", uid, "events")), { ...data, at: serverTimestamp() });
  batch.set(doc(store, "studentProgress", uid), { studentId: uid, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() }, { merge: true });
  // Sin conexión Firestore guarda el lote y lo envía al volver; un fallo nunca interrumpe la lectura ni la práctica.
  batch.commit().catch(() => {});
}

export function recordStoryFinished(story: string) {
  recordEvent({ kind: "story", story });
}

export function recordPracticeSession(input: {
  mode: PracticeModeKey;
  source?: "todos" | "historias" | "elegir";
  total: number;
  correct: number;
  incorrect: number;
  revealed: number;
  misses: readonly PracticeMiss[];
}) {
  const clip = (text: string) => text.slice(0, MAX_TEXT);
  recordEvent({
    kind: "practice",
    mode: input.mode,
    ...(input.source === undefined ? {} : { source: input.source }),
    total: input.total,
    correct: input.correct,
    incorrect: input.incorrect,
    revealed: input.revealed,
    misses: input.misses.slice(0, MAX_MISSES).map((miss) => ({ prompt: clip(miss.prompt), response: clip(miss.response), answer: clip(miss.answer), accentsOnly: miss.accentsOnly })),
  });
}

/* ── Lectura (profesor) ── */

function toDate(value: unknown): Date | null {
  return typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : null;
}

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const text = (value: unknown) => typeof value === "string" ? value : "";

function parseMiss(value: unknown): PracticeMiss[] {
  if (typeof value !== "object" || value === null) return [];
  const miss = value as Record<string, unknown>;
  return typeof miss.prompt === "string" && typeof miss.answer === "string"
    ? [{ prompt: miss.prompt, response: text(miss.response), answer: miss.answer, accentsOnly: miss.accentsOnly === true }]
    : [];
}

function parseEvent(id: string, data: DocumentData): ProgressEvent | null {
  const at = toDate(data.at);
  if (data.kind === "story" && typeof data.story === "string") return { id, kind: "story", story: data.story, at };
  if (data.kind === "practice" && (data.mode === "tarjetas" || data.mode === "verbos")) {
    return {
      id,
      kind: "practice",
      mode: data.mode,
      ...(data.source === "todos" || data.source === "historias" || data.source === "elegir" ? { source: data.source } : {}),
      total: count(data.total),
      correct: count(data.correct),
      incorrect: count(data.incorrect),
      revealed: count(data.revealed),
      misses: Array.isArray(data.misses) ? data.misses.flatMap(parseMiss) : [],
      at,
    };
  }
  return null;
}

/** Progreso y actividad reciente de un estudiante, del más reciente al más antiguo. */
export async function loadStudentProgress(uid: string): Promise<{ progress: StudentProgress; events: readonly ProgressEvent[] }> {
  if (!db) throw new Error("Firebase no está configurado.");
  const [snapshot, events] = await Promise.all([
    getDoc(doc(db, "studentProgress", uid)),
    getDocs(query(collection(db, "studentProgress", uid, "events"), orderBy("at", "desc"), limit(EVENTS_READ))),
  ]);
  const data = snapshot.data();
  return {
    progress: data === undefined ? EMPTY_PROGRESS : {
      finishedStories: strings(data.finishedStories),
      savedWords: strings(data.savedWords),
      lastActivityAt: toDate(data.lastActivityAt),
      updatedAt: toDate(data.updatedAt),
    },
    events: events.docs.flatMap((item) => parseEvent(item.id, item.data()) ?? []),
  };
}
