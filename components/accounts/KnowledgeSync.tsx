"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/features/accounts/AuthProvider";
import { db } from "@/lib/firebase/client";
import { refreshKnowledge, useKnowledge } from "@/lib/adapters/lexical-knowledge";
import { LocalKnowledgeEventRepository } from "@/features/learner-progress/repository/knowledge-event-repository";
import { fetchRemoteKnowledgeEvents, pushKnowledgeEvents } from "@/features/learner-progress/repository/firestore-knowledge-event-repository";

const PUSH_DEBOUNCE_MS = 1200;

/**
 * Sincroniza el conocimiento léxico (estado por palabra, repetición espaciada) de una cuenta de
 * estudiante con Firestore (`studentKnowledge/{uid}/events`), con el mismo espíritu que
 * ProgressSync: al iniciar sesión importa lo que ya hubiera en la nube al repositorio local (la
 * fuente de lectura síncrona de toda la app, sin cambios), y cada evento nuevo se sube con
 * debounce, sin bloquear la práctica ni el guardado local.
 */
export function KnowledgeSync() {
  const { user, profile } = useAuth();
  const studentId = user !== null && profile?.role === "student" ? user.uid : null;
  return studentId === null || db === null ? null : <KnowledgeSyncActive studentId={studentId} />;
}

function KnowledgeSyncActive({ studentId }: { studentId: string }) {
  const owner = `user:${studentId}`;
  const { ready, events } = useKnowledge();
  const hydratedRef = useRef<Promise<Set<string>> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const firestore = db;
    if (!ready || firestore === null) return;

    // Una sola vez por cuenta/sesión: trae lo que ya hubiera en la nube y lo importa al
    // repositorio local (append() ya deduplica por eventId), luego fuerza un reload para que
    // el resto de la app (flashcards, KnowledgeHub, WordPanel) vea el estado completo.
    hydratedRef.current ??= (async () => {
      try {
        const remote = await fetchRemoteKnowledgeEvents(firestore, studentId);
        const repository = new LocalKnowledgeEventRepository(window.localStorage);
        for (const event of remote) {
          try { repository.append(event); } catch { /* mismo id, contenido distinto: gana lo que ya hubiera en local */ }
        }
        if (remote.length > 0) refreshKnowledge(owner);
        return new Set(remote.map((event) => event.eventId));
      } catch {
        // Sin conexión o sin permisos: se sigue solo con lo local; se reintenta en el próximo montaje.
        return new Set<string>();
      }
    })();

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void hydratedRef.current!.then(async (synced) => {
        const pending = events.filter((event) => !synced.has(event.eventId));
        if (pending.length === 0) return;
        try {
          await pushKnowledgeEvents(firestore, studentId, pending);
          for (const event of pending) synced.add(event.eventId);
        } catch {
          // Sin conexión: se reintenta en el próximo evento o montaje; nada se pierde en local.
        }
      });
    }, PUSH_DEBOUNCE_MS);

    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); };
  }, [ready, events, studentId, owner]);

  return null;
}
