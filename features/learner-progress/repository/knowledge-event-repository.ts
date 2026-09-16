import { createKnowledgeEvent, type KnowledgeEvent } from "../domain/knowledge.ts";

export interface KnowledgeEventRepository {
  append(event: KnowledgeEvent): void;
  listForLearner(learnerId: string): readonly KnowledgeEvent[];
}

export class InMemoryKnowledgeEventRepository implements KnowledgeEventRepository {
  private events = new Map<string, KnowledgeEvent>();
  append(event: KnowledgeEvent) {
    const key = `${event.learnerId}:${event.eventId}`;
    const existing = this.events.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("Conflicting event ID");
    this.events.set(key, createKnowledgeEvent(event));
  }
  listForLearner(learnerId: string) { return [...this.events.values()].filter(e => e.learnerId === learnerId); }
}

export interface EventStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const KNOWLEDGE_STORAGE_PREFIX = "spanstories.lexical-events:v1:";
/** One immutable record per key avoids lost updates between tabs. Corruption fails visibly. */
export class LocalKnowledgeEventRepository implements KnowledgeEventRepository {
  private storage: EventStorage;
  constructor(storage: EventStorage) { this.storage = storage; }
  append(event: KnowledgeEvent) {
    const valid = createKnowledgeEvent(event);
    const key = `${KNOWLEDGE_STORAGE_PREFIX}${encodeURIComponent(event.learnerId)}:${encodeURIComponent(event.eventId)}`;
    const serialized = JSON.stringify(valid);
    const existing = this.storage.getItem(key);
    if (existing && existing !== serialized) throw new Error("Conflicting event ID");
    if (!existing) this.storage.setItem(key, serialized);
  }
  listForLearner(learnerId: string) {
    const prefix = `${KNOWLEDGE_STORAGE_PREFIX}${encodeURIComponent(learnerId)}:`;
    const events: KnowledgeEvent[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const event = createKnowledgeEvent(JSON.parse(this.storage.getItem(key)!));
      if (event.learnerId !== learnerId) throw new Error("Event owner mismatch");
      events.push(event);
    }
    return events;
  }
}
