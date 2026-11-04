"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/features/accounts/AuthProvider";
import { db } from "@/lib/firebase/client";
import { resolvePersonalPracticeSurface } from "@/features/practice/engine/personal-practice-resolution";
import { personalPracticeStorageKey as storageKey } from "@/features/practice/repository/personal-practice-storage-key";
import {
  FirestorePersonalPracticeItemRepository,
  InMemoryPersonalPracticeItemRepository,
  LocalStoragePersonalPracticeItemRepository,
  syncPersonalPracticeNotes,
  withResolution,
  type PersonalPracticeAddedBy,
  type PersonalPracticeItem,
  type PersonalPracticeItemRepository,
} from "@/features/practice";
import { applyPersonalPracticeChanges } from "@/features/practice/engine/personal-practice-merge";

/**
 * Palabras y frases para practicar, escritas a mano en las notas del
 * estudiante. Misma arquitectura que lib/adapters/practice.ts (repositorio
 * en localStorage por cuenta, con reserva en memoria); aquí además la
 * escritura se sincroniza línea a línea y se resuelve contra el léxico en
 * segundo plano, sin bloquear el guardado.
 */

export { buildPersonalFlashcardDeck, PERSONAL_FLASHCARD_KEY_PREFIX } from "@/features/practice";
export type { PersonalFlashcard, PersonalPracticeItem } from "@/features/practice";

export type PersonalPracticeItemsSnapshot = { readonly ready: boolean; readonly items: readonly PersonalPracticeItem[] };

const LOADING: PersonalPracticeItemsSnapshot = { ready: false, items: [] };
const listeners = new Set<() => void>();
type OwnerStore = { snapshot: PersonalPracticeItemsSnapshot; loading: Promise<void> | null; repository: PersonalPracticeItemRepository | null; isStudent: boolean };
const stores = new Map<string, OwnerStore>();
function storeFor(owner: string): OwnerStore {
  if (!stores.has(owner)) stores.set(owner, { snapshot: LOADING, loading: null, repository: null, isStudent: false });
  return stores.get(owner)!;
}

/** Marks whether `owner` is a signed-in student account, decided by the caller (`useAuth().profile.role`) before the repository is first built. A teacher's own notes (if any) stay local-only — Firestore sync is a student-account feature. */
function setStudent(owner: string, isStudent: boolean) {
  storeFor(owner).isStudent = isStudent;
}

function getRepository(owner: string): PersonalPracticeItemRepository {
  const store = storeFor(owner);
  if (store.repository === null) {
    const uid = owner.startsWith("user:") ? owner.slice("user:".length) : null;
    try {
      store.repository = uid !== null && store.isStudent && db !== null
        ? new FirestorePersonalPracticeItemRepository(db, uid, window.localStorage, storageKey(owner))
        : new LocalStoragePersonalPracticeItemRepository(window.localStorage, storageKey(owner));
    } catch {
      // Sin acceso a localStorage (bloqueado por el navegador): las notas duran lo que dure la visita.
      store.repository = new InMemoryPersonalPracticeItemRepository();
    }
  }
  return store.repository;
}

function publish(owner: string, items: readonly PersonalPracticeItem[]) {
  storeFor(owner).snapshot = { ready: true, items };
  listeners.forEach((listener) => listener());
}

function reload(owner: string): Promise<void> {
  const store = storeFor(owner);
  store.loading ??= getRepository(owner).list()
    .then((items) => publish(owner, items), () => publish(owner, store.snapshot.items))
    .finally(() => { store.loading = null; });
  return store.loading;
}

async function replace(owner: string, items: readonly PersonalPracticeItem[]) {
  const store = storeFor(owner);
  try {
    await getRepository(owner).replaceAll(items);
  } catch {
    // El almacenamiento falló al escribir (cuota, modo privado): se sigue en memoria con lo que ya había.
    const memory = new InMemoryPersonalPracticeItemRepository();
    store.repository = memory;
    await memory.replaceAll(items);
  }
  publish(owner, items);
}

function subscribe(owner: string, listener: () => void) {
  listeners.add(listener);
  if (!storeFor(owner).snapshot.ready) void reload(owner);
  const repository = getRepository(owner);
  const stopRemote = repository instanceof FirestorePersonalPracticeItemRepository
    ? repository.subscribe((items) => publish(owner, items)) : () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(owner) || event.key === null) void reload(owner);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    stopRemote();
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => LOADING;

function ownerOf(user: { uid: string } | null): string {
  return user ? `user:${user.uid}` : "guest";
}

export function usePersonalPracticeItems(): PersonalPracticeItemsSnapshot {
  const { user, profile, loading } = useAuth();
  const owner = ownerOf(user);
  const isStudent = profile?.role === "student";
  const subscribeOwner = useCallback((listener: () => void) => {
    if (loading) return () => {};
    setStudent(owner, isStudent);
    return subscribe(owner, listener);
  }, [owner, isStudent, loading]);
  const getSnapshot = useCallback(() => (loading ? LOADING : storeFor(owner).snapshot), [owner, loading]);
  return useSyncExternalStore(subscribeOwner, getSnapshot, getServerSnapshot);
}

/** Resolves newly created/edited items against the Lexical Engine in the background; never blocks the save. */
async function resolveInBackground(owner: string, candidates: readonly PersonalPracticeItem[]): Promise<void> {
  if (candidates.length === 0) return;
  const resolved = await Promise.all(candidates.map(async (item) => {
    try {
      return withResolution(item, await resolvePersonalPracticeSurface(item.surface), new Date());
    } catch {
      return item;
    }
  }));
  await reload(owner);
  const resolvedById = new Map(resolved.map((item) => [item.id, item]));
  const current = storeFor(owner).snapshot.items;
  // Only apply a resolution if the line still reads exactly as it did when resolution started.
  const merged = current.map((item) => {
    const candidate = resolvedById.get(item.id);
    return candidate !== undefined && candidate.surface === item.surface ? candidate : item;
  });
  await replace(owner, merged);
}

export type PersonalPracticeSaveState = "idle" | "saving" | "saved";

const DEBOUNCE_MS = 600;

/**
 * `scope`: a Story key (`"01/02"`) shows/edits only that Story's own notebook
 * — it starts blank in a Story never written in before. `null` is the
 * student's own "Palabras y frases para practicar" list: every item, from
 * every Story, together.
 */
export function usePersonalPracticeNotesEditor(scope: string | null = null): {
  readonly ready: boolean;
  readonly text: string;
  readonly saveState: PersonalPracticeSaveState;
  readonly onChange: (value: string) => void;
} {
  const { user, profile, loading } = useAuth();
  const owner = ownerOf(user);
  const addedBy: PersonalPracticeAddedBy = profile?.role === "teacher" ? "TUTOR" : "STUDENT";
  const { ready, items } = usePersonalPracticeItems();
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PersonalPracticeSaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftBase = useRef<readonly PersonalPracticeItem[] | null>(null);

  const persist = useCallback((rawText: string) => {
    void reload(owner).then(async () => {
      const result = syncPersonalPracticeNotes({
        previousItems: draftBase.current ?? storeFor(owner).snapshot.items,
        rawText,
        addedBy,
        scope,
        now: new Date(),
        generateId: () => crypto.randomUUID(),
      });
      const merged = applyPersonalPracticeChanges(storeFor(owner).snapshot.items, draftBase.current ?? storeFor(owner).snapshot.items, result.items);
      await replace(owner, merged);
      draftBase.current = null;
      setSaveState("saved");
      setDraft(null);
      void resolveInBackground(owner, [...result.created, ...result.updated]);
    });
  }, [owner, addedBy, scope]);

  const onChange = useCallback((value: string) => {
    draftBase.current ??= storeFor(owner).snapshot.items;
    setDraft(value);
    setSaveState("saving");
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(value), DEBOUNCE_MS);
  }, [persist, owner]);

  const persistedText = items.filter((item) => scope === null || item.scope === scope).map((item) => item.surface).join("\n");
  return { ready: ready && !loading, text: draft ?? persistedText, saveState, onChange };
}
