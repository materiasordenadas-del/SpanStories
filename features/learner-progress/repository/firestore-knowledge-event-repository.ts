import { collection, doc, getDocs, Timestamp, writeBatch, type DocumentData, type Firestore } from "firebase/firestore";
import { createKnowledgeEvent, type KnowledgeEvent } from "../domain/knowledge.ts";

const BATCH_SIZE = 400; // Firestore's own limit is 500 writes per batch; stay well under it.

function toFirestoreEvent(event: KnowledgeEvent): DocumentData {
  const { eventId, learnerId, targetKey, occurredAt, kind, storyVersionId, occurrenceId, curriculumRelease, lexiconRelease,
    practiceSessionId, attemptId, evidence, outcome, assisted, targetProductive, declaredState, source } = event;
  return {
    eventId, learnerId, targetKey, kind, storyVersionId, occurrenceId, curriculumRelease, lexiconRelease,
    occurredAt: Timestamp.fromDate(new Date(occurredAt)),
    ...(practiceSessionId === undefined ? {} : { practiceSessionId }),
    ...(attemptId === undefined ? {} : { attemptId }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(assisted === undefined ? {} : { assisted }),
    ...(targetProductive === undefined ? {} : { targetProductive }),
    ...(declaredState === undefined ? {} : { declaredState }),
    ...(source === undefined ? {} : { source }),
  };
}

function fromFirestoreEvent(data: DocumentData): KnowledgeEvent | null {
  try {
    const occurredAt = data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : data.occurredAt;
    return createKnowledgeEvent({ ...data, occurredAt } as KnowledgeEvent);
  } catch {
    return null; // Documento corrupto o de una forma que ya no se reconoce: se ignora, no rompe la hidratación.
  }
}

/** Toda la colección propia del estudiante: sin límite artificial de "más recientes N" (a diferencia de la lectura del profesor en progress-service.ts) porque las proyecciones de conocimiento pliegan el historial completo — recortarlo corrompería el estado calculado, no solo la vista. */
export async function fetchRemoteKnowledgeEvents(db: Firestore, uid: string): Promise<KnowledgeEvent[]> {
  const snapshot = await getDocs(collection(db, "studentKnowledge", uid, "events"));
  return snapshot.docs.flatMap((entry) => { const event = fromFirestoreEvent(entry.data()); return event === null ? [] : [event]; });
}

/** Doc id = eventId: las reglas solo permiten `create`, así que reenviar un evento ya subido fallaría — el llamador debe filtrar primero (ver KnowledgeSync). */
export async function pushKnowledgeEvents(db: Firestore, uid: string, events: readonly KnowledgeEvent[]): Promise<void> {
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const event of events.slice(i, i + BATCH_SIZE)) {
      batch.set(doc(db, "studentKnowledge", uid, "events", event.eventId), toFirestoreEvent(event));
    }
    await batch.commit();
  }
}
