/**
 * Pure in-memory `LearnerEventRepository` — tests and early development.
 *
 * `append` rejects a duplicate `eventId` rather than overwriting: two events
 * are either genuinely different occurrences, or a caller bug is retrying an
 * append it should not, and either way silently merging them would corrupt
 * the log's append-only guarantee.
 *
 * Every method is declared `async` for call-compatibility with
 * `features/persistence`'s PostgreSQL adapter — see
 * `./learner-event-repository.ts`.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";
import type { LearnerEventRepository } from "./learner-event-repository.ts";

export class InMemoryLearnerEventRepository implements LearnerEventRepository {
  private readonly events = new Map<LearnerEventId, LearnerEvent>();

  async append(event: LearnerEvent): Promise<void> {
    if (this.events.has(event.eventId)) {
      throw new Error(`DUPLICATE_LEARNER_EVENT_ID: ${event.eventId} was already appended`);
    }
    this.events.set(event.eventId, event);
  }

  async getById(eventId: LearnerEventId): Promise<LearnerEvent | null> {
    return this.events.get(eventId) ?? null;
  }

  async listForLearner(learnerId: LearnerId): Promise<readonly LearnerEvent[]> {
    return [...this.events.values()].filter((e) => e.learnerId === learnerId);
  }

  async listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): Promise<readonly LearnerEvent[]> {
    return [...this.events.values()].filter((e) => e.learnerId === learnerId && e.recordedLexemeId === lexemeId);
  }

  async listForStoryVersion(storyVersionId: StoryVersionId): Promise<readonly LearnerEvent[]> {
    return [...this.events.values()].filter((e) => e.storyVersionId === storyVersionId);
  }
}
