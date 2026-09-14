"use client";

import { useSyncExternalStore } from "react";

/**
 * Memoria de lectura del navegador, solo para continuidad de la interfaz:
 * retomar la última historia y marcar historias terminadas.
 * No sustituye a los learner events: el progreso pedagógico sigue siendo de features/.
 * Las palabras guardadas no viven aquí: son PracticeItems de features/practice.
 */
export type StoryRef = { readonly island: string; readonly story: string; readonly title: string };
export type ReadingMemory = {
  readonly lastStory: StoryRef | null;
  readonly finished: readonly string[];
};

const STORAGE_KEY = "spanstories.reading-memory:v1";
const EMPTY: ReadingMemory = { lastStory: null, finished: [] };
const listeners = new Set<() => void>();
let cache: ReadingMemory | null = null;

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

function read(): ReadingMemory {
  if (cache !== null) return cache;
  try {
    cache = parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: ReadingMemory) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento (ventana privada, cuota): la sesión actual sigue funcionando.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => EMPTY;

export function useReadingMemory(): ReadingMemory {
  return useSyncExternalStore(subscribe, read, serverSnapshot);
}

export function rememberStory(ref: StoryRef) {
  const memory = read();
  const last = memory.lastStory;
  if (last !== null && storyKey(last.island, last.story) === storyKey(ref.island, ref.story) && last.title === ref.title) return;
  write({ ...memory, lastStory: ref });
}

/** Devuelve true solo la primera vez que se termina la historia en este navegador. */
export function markStoryFinished(island: string, story: string): boolean {
  const memory = read();
  const key = storyKey(island, story);
  if (memory.finished.includes(key)) return false;
  write({ ...memory, finished: [...memory.finished, key] });
  return true;
}
