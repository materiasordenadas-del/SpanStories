/**
 * A `localStorage`-backed `LearnerEventRepository` — a provisional adapter,
 * not the persistence target (phase 5 adds PostgreSQL; see
 * `docs/architecture/plan-implementacion-motor-v1.0.md` §"FASE 5").
 *
 * This module still imports no `window`: it depends on `StorageLike` (the
 * two methods of the Web Storage API it actually uses), so the call site
 * decides what storage to pass — `window.localStorage` in the browser, a
 * fake in tests. That keeps the constraint "the domain must not import
 * `window`/`localStorage`" true even one level up, in the one adapter whose
 * whole job is talking to it: `features/learner-progress/domain/**` never
 * imports this file, only the other way around.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";
import type { LearnerEventRepository } from "./learner-event-repository.ts";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_STORAGE_KEY = "spanstories.learner-events.v1";

type StoredLog = {
  readonly schemaVersion: 1;
  readonly events: readonly LearnerEvent[];
};

export class LocalStorageLearnerEventRepository implements LearnerEventRepository {
  private readonly storage: StorageLike;
  private readonly key: string;

  constructor(storage: StorageLike, key: string = DEFAULT_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  private readLog(): LearnerEvent[] {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as StoredLog;
    return [...parsed.events];
  }

  private writeLog(events: readonly LearnerEvent[]): void {
    const log: StoredLog = { schemaVersion: 1, events };
    this.storage.setItem(this.key, JSON.stringify(log));
  }

  append(event: LearnerEvent): void {
    const events = this.readLog();
    if (events.some((e) => e.eventId === event.eventId)) {
      throw new Error(`DUPLICATE_LEARNER_EVENT_ID: ${event.eventId} was already appended`);
    }
    events.push(event);
    this.writeLog(events);
  }

  getById(eventId: LearnerEventId): LearnerEvent | null {
    return this.readLog().find((e) => e.eventId === eventId) ?? null;
  }

  listForLearner(learnerId: LearnerId): readonly LearnerEvent[] {
    return this.readLog().filter((e) => e.learnerId === learnerId);
  }

  listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): readonly LearnerEvent[] {
    return this.readLog().filter((e) => e.learnerId === learnerId && e.recordedLexemeId === lexemeId);
  }

  listForStoryVersion(storyVersionId: StoryVersionId): readonly LearnerEvent[] {
    return this.readLog().filter((e) => e.storyVersionId === storyVersionId);
  }
}
