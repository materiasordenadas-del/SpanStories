"use client";

import { useCallback, useSyncExternalStore } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/features/accounts/AuthProvider";
import { getSyncedStudentId } from "@/features/accounts/progress-service";
import { auth, db } from "@/lib/firebase/client";

/**
 * Memoria de lectura: retomar la última historia y marcar historias terminadas.
 * No sustituye a los learner events: el progreso pedagógico sigue siendo de features/.
 * Las palabras guardadas no viven aquí: son PracticeItems de features/practice.
 *
 * Por cuenta (`user:{uid}` o `guest`), igual que features/practice: localStorage es la
 * caché de lectura, y para una cuenta de estudiante con sesión iniciada `studentProgress/{uid}`
 * en Firestore es la fuente de verdad (finishedStories, lastStory), sincronizada con el mismo
 * patrón hidratar-una-vez + escritura con debounce que features/practice/repository/firestore-*.
 */
export type StoryRef = { readonly island: string; readonly story: string; readonly title: string };
export type ReadingMemory = {
  readonly lastStory: StoryRef | null;
  readonly finished: readonly string[];
};

export const READING_MEMORY_STORAGE_KEY = "spanstories.reading-memory:v1";
const EMPTY: ReadingMemory = { lastStory: null, finished: [] };
const WRITE_DEBOUNCE_MS = 800;

export const storyKey = (island: string, story: string) => `${island.padStart(2, "0")}/${story.padStart(2, "0")}`;
export const storyHref = (ref: Pick<StoryRef, "island" | "story">) => `/islas/${ref.island.padStart(2, "0")}/${ref.story.padStart(2, "0")}`;

const isString = (value: unknown): value is string => typeof value === "string";

// localStorage es editable por cualquiera: solo se aceptan formas conocidas.
// Un `savedWords` antiguo (identidad por forma o lema) se ignora y desaparece con la siguiente escritura.
function parse(raw: string | null): ReadingMemory {
  if (raw === null) return EMPTY;
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) return EMPTY;
  const { lastStory, finished } = data as Record<string, unknown>;
  const story = lastStory as Partial<StoryRef> | null | undefined;
  return {
    lastStory: story && isString(story.island) && isString(story.story) && isString(story.title) ? { island: story.island, story: story.story, title: story.title } : null,
    finished: Array.isArray(finished) ? finished.filter(isString) : [],
  };
}

function storageKeyFor(owner: string): string {
  return owner === "guest" ? READING_MEMORY_STORAGE_KEY : `${READING_MEMORY_STORAGE_KEY}:${encodeURIComponent(owner)}`;
}

type Store = { cache: ReadingMemory | null; hydrated: Promise<void> | null; writeTimer: ReturnType<typeof setTimeout> | null };
const stores = new Map<string, Store>();
const listeners = new Set<() => void>();
function storeFor(owner: string): Store {
  if (!stores.has(owner)) stores.set(owner, { cache: null, hydrated: null, writeTimer: null });
  return stores.get(owner)!;
}

function readLocal(owner: string): ReadingMemory {
  const store = storeFor(owner);
  if (store.cache !== null) return store.cache;
  let value = EMPTY;
  try {
    const scopedRaw = owner === "guest" ? null : window.localStorage.getItem(storageKeyFor(owner));
    // Antes de esto la memoria de lectura no distinguía cuentas: una cuenta recién vista
    // adopta, una sola vez, lo que ya hubiera en la clave global (compartida con "guest") de este navegador.
    value = parse(scopedRaw ?? window.localStorage.getItem(READING_MEMORY_STORAGE_KEY));
  } catch {
    value = EMPTY;
  }
  store.cache = value;
  return value;
}

function writeLocal(owner: string, next: ReadingMemory) {
  storeFor(owner).cache = next;
  try {
    window.localStorage.setItem(storageKeyFor(owner), JSON.stringify(next));
  } catch {
    // Sin almacenamiento (ventana privada, cuota): la sesión actual sigue funcionando.
  }
  listeners.forEach((listener) => listener());
}

/* ── Firestore (cuenta de estudiante): studentProgress/{uid}.finishedStories + .lastStory ── */

function parseRemote(data: Record<string, unknown> | undefined): ReadingMemory {
  if (data === undefined) return EMPTY;
  const story = data.lastStory as Partial<StoryRef> | null | undefined;
  const finished = data.finishedStories;
  return {
    lastStory: story && isString(story.island) && isString(story.story) && isString(story.title) ? { island: story.island, story: story.story, title: story.title } : null,
    finished: Array.isArray(finished) ? finished.filter(isString) : [],
  };
}

function sameMemory(a: ReadingMemory, b: ReadingMemory): boolean {
  return a.lastStory?.island === b.lastStory?.island && a.lastStory?.story === b.lastStory?.story && a.lastStory?.title === b.lastStory?.title &&
    a.finished.length === b.finished.length && a.finished.every((key, i) => key === b.finished[i]);
}

/** Sin marca de tiempo en `lastStory`: se prefiere el de este dispositivo, el que se está usando ahora mismo. `finished` es unión: terminar una historia nunca se deshace al fusionar. */
function mergeMemory(remote: ReadingMemory, local: ReadingMemory): ReadingMemory {
  return { lastStory: local.lastStory ?? remote.lastStory, finished: [...new Set([...remote.finished, ...local.finished])] };
}

async function push(uid: string, memory: ReadingMemory): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, "studentProgress", uid), {
    studentId: uid,
    finishedStories: memory.finished,
    lastStory: memory.lastStory,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function hydrate(owner: string, uid: string): Promise<void> {
  const store = storeFor(owner);
  store.hydrated ??= (async () => {
    if (!db) return;
    try {
      const snapshot = await getDoc(doc(db, "studentProgress", uid));
      const remote = parseRemote(snapshot.data());
      const local = readLocal(owner);
      const merged = mergeMemory(remote, local);
      if (!sameMemory(merged, local)) writeLocal(owner, merged);
      if (!sameMemory(merged, remote)) await push(uid, merged);
    } catch {
      // Sin conexión o sin permisos: se sigue con lo local; se reintenta en el próximo montaje.
    }
  })();
  return store.hydrated;
}

function schedulePush(owner: string, uid: string) {
  const store = storeFor(owner);
  if (store.writeTimer !== null) clearTimeout(store.writeTimer);
  // Sin conexión, el SDK de Firestore guarda la escritura pendiente y la envía al volver.
  store.writeTimer = setTimeout(() => { void push(uid, readLocal(owner)).catch(() => {}); }, WRITE_DEBOUNCE_MS);
}

function ownerUid(owner: string): string | null {
  return owner.startsWith("user:") ? owner.slice("user:".length) : null;
}

/**
 * `getSyncedStudentId()` (de features/accounts/progress-service.ts, fijado por `ProgressSync`
 * montado en el layout raíz) decide si a esta cuenta le toca sincronizar, en vez de un flag propio
 * fijado por un hook: `rememberStory`/`markStoryFinished` son funciones sueltas, llamadas desde
 * efectos que no siempre comparten orden de montaje con `useReadingMemory`.
 */
function read(owner: string): ReadingMemory {
  const uid = ownerUid(owner);
  if (uid !== null && uid === getSyncedStudentId() && db !== null) void hydrate(owner, uid);
  return readLocal(owner);
}

function write(owner: string, next: ReadingMemory) {
  writeLocal(owner, next);
  const uid = ownerUid(owner);
  if (uid !== null && uid === getSyncedStudentId() && db !== null) schedulePush(owner, uid);
}

function subscribe(owner: string, listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKeyFor(owner) && event.key !== null) return;
    storeFor(owner).cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => EMPTY;

function ownerOf(user: { uid: string } | null): string {
  return user ? `user:${user.uid}` : "guest";
}

export function useReadingMemory(): ReadingMemory {
  const { user, loading } = useAuth();
  const owner = ownerOf(user);
  const subscribeOwner = useCallback((listener: () => void) => (loading ? () => {} : subscribe(owner, listener)), [owner, loading]);
  const getSnapshot = useCallback(() => (loading ? EMPTY : read(owner)), [owner, loading]);
  return useSyncExternalStore(subscribeOwner, getSnapshot, serverSnapshot);
}

/** Igual que `currentLearner()` en lib/adapters/lexical-knowledge.ts: funciones sueltas fuera de React, así que leen `auth.currentUser` directamente en vez de useAuth(). */
function currentOwner(): string {
  return auth?.currentUser ? `user:${auth.currentUser.uid}` : "guest";
}

export function rememberStory(ref: StoryRef) {
  const owner = currentOwner();
  const memory = read(owner);
  const last = memory.lastStory;
  if (last !== null && storyKey(last.island, last.story) === storyKey(ref.island, ref.story) && last.title === ref.title) return;
  write(owner, { ...memory, lastStory: ref });
}

/** Devuelve true solo la primera vez que se termina la historia en este navegador (o, ya sincronizada, en esta cuenta). */
export function markStoryFinished(island: string, story: string): boolean {
  const owner = currentOwner();
  const memory = read(owner);
  const key = storyKey(island, story);
  if (memory.finished.includes(key)) return false;
  write(owner, { ...memory, finished: [...memory.finished, key] });
  return true;
}
