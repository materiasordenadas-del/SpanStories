/**
 * Append-only event log contract.
 *
 * There is no `update`/`delete` method here, on purpose — the interface
 * itself is the enforcement mechanism, the same choice
 * `features/story-engine/repository/story-repository.ts` makes for published
 * `StoryVersion` content. A future administrative erasure for privacy (see
 * `docs/architecture/plan-implementacion-motor-v1.0.md` §"Seguridad de datos")
 * is a different, explicitly out-of-band operation — not a method any normal
 * caller of this interface has access to.
 *
 * Every method returns a `Promise`, for the same reason
 * `features/story-engine/repository/story-repository.ts` does: a real
 * persistence adapter cannot answer synchronously, and committing to
 * `Promise` here (rather than reshaping the interface once phase 5 needed
 * it) is what lets `features/persistence`'s `PostgresLearnerEventRepository`
 * implement this exact interface.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";

export interface LearnerEventRepository {
  append(event: LearnerEvent): Promise<void>;
  getById(eventId: LearnerEventId): Promise<LearnerEvent | null>;
  listForLearner(learnerId: LearnerId): Promise<readonly LearnerEvent[]>;
  listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): Promise<readonly LearnerEvent[]>;
  listForStoryVersion(storyVersionId: StoryVersionId): Promise<readonly LearnerEvent[]>;
}
