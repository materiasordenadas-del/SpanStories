/**
 * Pure in-memory `LearnerEventRepository` — tests and early development.
 *
 * `append` rejects a duplicate `eventId` rather than overwriting: two events
 * are either genuinely different occurrences, or a caller bug is retrying an
 * append it should not, and either way silently merging them would corrupt
 * the log's append-only guarantee.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";
import type { LearnerEventRepository } from "./learner-event-repository.ts";

export class InMemoryLearnerEventRepository implements LearnerEventRepository {
  private readonly events = new Map<LearnerEventId, LearnerEvent>();

  append(event: LearnerEvent): void {
    if (this.events.has(event.eventId)) {
      throw new Error(`DUPLICATE_LEARNER_EVENT_ID: ${event.eventId} was already appended`);
    }
    this.events.set(event.eventId, event);
  }

  getById(eventId: LearnerEventId): LearnerEvent | null {
    return this.events.get(eventId) ?? null;
  }

  listForLearner(learnerId: LearnerId): readonly LearnerEvent[] {
    return [...this.events.values()].filter((e) => e.learnerId === learnerId);
  }

  listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): readonly LearnerEvent[] {
    return [...this.events.values()].filter((e) => e.learnerId === learnerId && e.recordedLexemeId === lexemeId);
  }

  listForStoryVersion(storyVersionId: StoryVersionId): readonly LearnerEvent[] {
    return [...this.events.values()].filter((e) => e.storyVersionId === storyVersionId);
  }
}
