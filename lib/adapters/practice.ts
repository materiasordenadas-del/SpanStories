"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/features/accounts/AuthProvider";
import { currentLearner, recordKnowledge } from "./lexical-knowledge";
import { learnerPracticeStorageKey as storageKey } from "@/features/practice/repository/learner-storage-key";
import {
  InMemoryPracticeItemRepository,
  LocalStoragePracticeItemRepository,
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
type OwnerStore = { snapshot: PracticeItemsSnapshot; loading: Promise<void> | null; repository: PracticeItemRepository | null };
const stores = new Map<string, OwnerStore>();
function storeFor(owner: string): OwnerStore {
  if (!stores.has(owner)) stores.set(owner, { snapshot: LOADING, loading: null, repository: null });
  return stores.get(owner)!;
}

function getRepository(owner: string): PracticeItemRepository {
  const store = storeFor(owner);
  if (store.repository === null) {
    try {
      store.repository = new LocalStoragePracticeItemRepository(window.localStorage, storageKey(owner));
    } catch {
      // Sin acceso a localStorage (bloqueado por el navegador): las palabras duran lo que dure la visita.
      store.repository = new InMemoryPracticeItemRepository();
    }
  }
  return store.repository;
}

function publish(owner: string, items: readonly PracticeItem[]) {
  storeFor(owner).snapshot = { ready: true, items };
  listeners.forEach((listener) => listener());
}

function reload(owner: string): Promise<void> {
  const store = storeFor(owner);
  store.loading ??= getRepository(owner).list()
    .then(items => publish(owner, items), () => publish(owner, store.snapshot.items))
    .finally(() => { store.loading = null; });
  return store.loading;
}

async function change(owner: string, action: (target: PracticeItemRepository) => Promise<unknown>) {
  const store = storeFor(owner);
  try {
    await action(getRepository(owner));
  } catch {
    // El almacenamiento falló al escribir (cuota, modo privado): se sigue en memoria con lo que ya había.
    const memory = new InMemoryPracticeItemRepository();
    for (const item of store.snapshot.items) await memory.save(item);
    store.repository = memory;
    await action(memory);
  }
  await reload(owner);
}

function subscribe(owner: string, listener: () => void) {
  listeners.add(listener);
  if (!storeFor(owner).snapshot.ready) void reload(owner);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(owner) || event.key === null) void reload(owner);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => LOADING;

export function usePracticeItems(): PracticeItemsSnapshot {
  const { user, loading } = useAuth();
  const owner = user ? `user:${user.uid}` : "guest";
  const subscribeOwner = useCallback((listener: () => void) => loading ? () => {} : subscribe(owner, listener), [owner, loading]);
  const getSnapshot = useCallback(() => loading ? LOADING : storeFor(owner).snapshot, [owner, loading]);
  return useSyncExternalStore(subscribeOwner, getSnapshot, getServerSnapshot);
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
export async function togglePracticeWord(word: ReaderWordPractice): Promise<void> {
  const owner = currentLearner();
  await reload(owner);
  const saved = isSaved(storeFor(owner).snapshot.items, word);
  await change(owner, (target) => saved
    ? target.remove(word.target)
    : target.save(createPracticeItem({ target: word.target, savedAt: new Date(), savedFrom: word.savedFrom })));
  if (!saved) recordKnowledge({ kind: "SAVED", targetKey: practiceTargetKey(word.target), storyVersionId: word.savedFrom.storyVersionId, occurrenceId: word.savedFrom.occurrenceId }, owner);
}
