"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/features/accounts/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { createKnowledgeEvent, type KnowledgeEvent } from "@/features/learner-progress/domain/knowledge";
import { KNOWLEDGE_STORAGE_PREFIX, LocalKnowledgeEventRepository } from "@/features/learner-progress/repository/knowledge-event-repository";
import { importBrowserLegacyDeclarations } from "@/features/learner-progress/engine/knowledge-legacy";

export { projectKnowledge } from "@/features/learner-progress/engine/knowledge-projection";
export { KNOWLEDGE_STATES } from "@/features/learner-progress/domain/knowledge";
export const KNOWLEDGE_LABELS = { NEW: "Nuevo", RECOGNIZED: "Reconocido", FAMILIAR: "Familiar", LEARNED: "Aprendido", KNOWN: "Conocido", UNSEEN: "Sin seguimiento" };
export const currentLearner = () => auth?.currentUser ? `user:${auth.currentUser.uid}` : "guest";

type Snapshot = { ready: boolean; events: readonly KnowledgeEvent[]; error: string | null };
const EMPTY: Snapshot = { ready: false, events: [], error: null };
const snapshots = new Map<string, Snapshot>();
const listeners = new Set<() => void>();
const snapshot = (owner: string) => snapshots.get(owner) ?? EMPTY;
function reload(owner: string) {
  try {
    const repository = new LocalKnowledgeEventRepository(window.localStorage);
    const legacy = owner === "guest" ? window.localStorage.getItem("spanstories.learner-events.v1") : null;
    if (legacy) for (const event of importBrowserLegacyDeclarations(JSON.parse(legacy), owner)) repository.append(event);
    snapshots.set(owner, { ready: true, events: repository.listForLearner(owner), error: null });
  }
  catch { snapshots.set(owner, { ...snapshot(owner), ready: true, error: "No se pudo leer o guardar tu progreso local. Comprueba el almacenamiento del navegador." }); }
  listeners.forEach(l => l());
}
export function recordKnowledge(input: Omit<KnowledgeEvent, "eventId" | "learnerId" | "occurredAt" | "curriculumRelease" | "lexiconRelease"> & Partial<Pick<KnowledgeEvent, "eventId" | "occurredAt">>, owner = currentLearner()) {
  // A callback belonging to a previous signed-in session must never write after a switch.
  if (owner !== currentLearner()) return false;
  try {
    new LocalKnowledgeEventRepository(window.localStorage).append(createKnowledgeEvent({ ...input,
      eventId: input.eventId ?? crypto.randomUUID(), learnerId: owner, occurredAt: input.occurredAt ?? new Date().toISOString(),
      curriculumRelease: "A1-CURRICULUM-v1.51", lexiconRelease: "A1-LEXICON-v1.0" }));
    reload(owner);
    return true;
  } catch {
    snapshots.set(owner, { ...snapshot(owner), error: "No se pudo guardar este intento. Tu progreso no se ha actualizado." });
    listeners.forEach(l => l());
    return false;
  }
}
export function useKnowledge() {
  const { user, loading } = useAuth();
  const owner = user ? `user:${user.uid}` : "guest";
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    if (!loading) reload(owner);
    const changed = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(KNOWLEDGE_STORAGE_PREFIX)) reload(owner); };
    window.addEventListener("storage", changed);
    return () => { listeners.delete(listener); window.removeEventListener("storage", changed); };
  }, [owner, loading]);
  const read = useCallback(() => loading ? EMPTY : snapshot(owner), [owner, loading]);
  const value = useSyncExternalStore(subscribe, read, () => EMPTY);
  return { ...value, owner };
}
