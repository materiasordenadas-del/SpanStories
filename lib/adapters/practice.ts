"use client";

import { useSyncExternalStore } from "react";
import {
  InMemoryPracticeItemRepository,
  LocalStoragePracticeItemRepository,
  PRACTICE_STORAGE_KEY,
  createPracticeItem,
  practiceItemKey,
  practiceTargetKey,
  type PracticeItem,
  type PracticeItemRepository,
  type ReaderWordPractice,
} from "@/features/practice";

/**
 * Palabras guardadas en este navegador, conectadas con React.
 * La identidad y las reglas viven en features/practice; aquí solo se sincroniza la interfaz con el repositorio.
 */

export {
  A1_VERBS,
  CONJUGATION_PERSONS,
  PRACTICE_MODES,
  VERB_GROUPS,
  buildConjugationPool,
  buildFlashcardDeck,
  conjugationPersonLabel,
  conjugationTable,
  currentConjugationAttempt,
  currentConjugationQuestion,
  currentFlashcard,
  currentFlashcardAttempt,
  findConjugationVerb,
  isVerbTypeOn,
  nextConjugationQuestion,
  nextFlashcard,
  practiceItemKey,
  readerWordPractice,
  revealConjugationAnswer,
  revealFlashcardAnswer,
  savedConjugationVerbs,
  sentenceWithAnswer,
  startConjugationSession,
  startFlashcardSession,
  submitConjugationAnswer,
  submitFlashcardAnswer,
  summarizeConjugationSession,
  summarizeFlashcardSession,
  withoutMarks,
} from "@/features/practice";
export type {
  ConjugationPerson,
  ConjugationSession,
  ConjugationSettings,
  Flashcard,
  FlashcardAttempt,
  FlashcardSession,
  PracticeModeId,
  PracticeOccurrence,
  ReaderWordPractice,
  VerbGroup,
} from "@/features/practice";

export type PracticeItemsSnapshot = { readonly ready: boolean; readonly items: readonly PracticeItem[] };

const LOADING: PracticeItemsSnapshot = { ready: false, items: [] };
const listeners = new Set<() => void>();
let snapshot = LOADING;
let loading: Promise<void> | null = null;
let repository: PracticeItemRepository | null = null;

function getRepository(): PracticeItemRepository {
  if (repository === null) {
    try {
      repository = new LocalStoragePracticeItemRepository(window.localStorage);
    } catch {
      // Sin acceso a localStorage (bloqueado por el navegador): las palabras duran lo que dure la visita.
      repository = new InMemoryPracticeItemRepository();
    }
  }
  return repository;
}

function publish(items: readonly PracticeItem[]) {
  snapshot = { ready: true, items };
  listeners.forEach((listener) => listener());
}

function reload(): Promise<void> {
  loading ??= getRepository().list()
    .then(publish, () => publish(snapshot.items))
    .finally(() => { loading = null; });
  return loading;
}

async function change(action: (target: PracticeItemRepository) => Promise<unknown>) {
  try {
    await action(getRepository());
  } catch {
    // El almacenamiento falló al escribir (cuota, modo privado): se sigue en memoria con lo que ya había.
    const memory = new InMemoryPracticeItemRepository();
    for (const item of snapshot.items) await memory.save(item);
    repository = memory;
    await action(memory);
  }
  await reload();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!snapshot.ready) void reload();
  const onStorage = (event: StorageEvent) => {
    if (event.key === PRACTICE_STORAGE_KEY) void reload();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => LOADING;

export function usePracticeItems(): PracticeItemsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const isSaved = (items: readonly PracticeItem[], word: ReaderWordPractice) => {
  const key = practiceTargetKey(word.target);
  return items.some((item) => practiceItemKey(item) === key);
};

export function useIsPracticeWordSaved(word: ReaderWordPractice | null): boolean {
  const { items } = usePracticeItems();
  return word !== null && isSaved(items, word);
}

/** Guarda la palabra (su Sense o Lexeme) o la quita si ya estaba guardada. */
export function togglePracticeWord(word: ReaderWordPractice): Promise<void> {
  return change((target) => isSaved(snapshot.items, word)
    ? target.remove(word.target)
    : target.save(createPracticeItem({ target: word.target, savedAt: new Date(), savedFrom: word.savedFrom })));
}
