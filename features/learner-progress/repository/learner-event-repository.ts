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
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";

export interface LearnerEventRepository {
  append(event: LearnerEvent): void;
  getById(eventId: LearnerEventId): LearnerEvent | null;
  listForLearner(learnerId: LearnerId): readonly LearnerEvent[];
  listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): readonly LearnerEvent[];
  listForStoryVersion(storyVersionId: StoryVersionId): readonly LearnerEvent[];
}
