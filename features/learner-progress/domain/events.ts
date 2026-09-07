/**
 * `LearnerEvent` — immutable historical truth.
 *
 * An event records what happened, frozen with enough context to be
 * reinterpreted later against a *different* lexicon release than the one in
 * force when it was recorded (see `../engine/attribution-engine.ts`). A split,
 * merge or reannotation afterwards never rewrites the event — it changes what
 * a projection concludes from it.
 *
 * `event != current state`: nothing here is "the learner knows X now." That
 * is what `../engine/declared-state-projection.ts` and
 * `../engine/progress-projection.ts` derive, on demand, from the full log.
 *
 * MVP ships exactly two event types. The union is closed, not because more
 * kinds are forbidden, but because a stub variant with no real logic behind
 * it (`RECOGNITION_ATTEMPTED`, `EXERCISE_ANSWERED`, ...) would be dead code —
 * see `docs/learner-progress-implementation.md` §"Event schema" for how a new
 * kind is added when it is actually needed: one more member of this union,
 * one more branch in `../engine/ordering.ts` and the projections that read it.
 */

import type { LexemeFormId, LexemeId, SenseId } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type { StoryId, StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEventId, LearnerId } from "./ids.ts";
import type { DeclaredState } from "./declared-state.ts";

export const LEARNER_EVENT_TYPES = ["OCCURRENCE_OPENED", "STATE_DECLARED"] as const;
export type LearnerEventType = (typeof LEARNER_EVENT_TYPES)[number];

type LearnerEventBase = {
  readonly eventId: LearnerEventId;
  readonly occurredAt: string;
  readonly learnerId: LearnerId;
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  /** The releases in force when this event was recorded — never updated later. */
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: LexiconReleaseId;
};

/**
 * The learner opened/encountered a specific `StoryOccurrence`.
 *
 * `recordedLexemeId`/`recordedSenseId`/`recordedFormId` are nullable: an
 * occurrence may be `UNRESOLVED` (see
 * `features/story-engine` `SenseResolutionStatus`) at the moment it is
 * opened, and the event must still be recordable — attribution later can
 * only work with what was actually known then.
 */
export type OccurrenceOpenedEvent = LearnerEventBase & {
  readonly eventType: "OCCURRENCE_OPENED";
  readonly occurrenceId: StoryOccurrenceId;
  readonly recordedLexemeId: LexemeId | null;
  readonly recordedSenseId: SenseId | null;
  readonly recordedFormId: LexemeFormId | null;
};

/**
 * The learner declared their own familiarity with a Lexeme.
 *
 * `declaredState` is `USER_DECLARED_STATE`, never `COMPUTED_MASTERY` — see
 * `./declared-state.ts`. `occurrenceId` is nullable: a learner may declare a
 * state from a vocabulary review view with no single occurrence in hand.
 */
export type StateDeclaredEvent = LearnerEventBase & {
  readonly eventType: "STATE_DECLARED";
  readonly occurrenceId: StoryOccurrenceId | null;
  readonly recordedLexemeId: LexemeId;
  readonly recordedSenseId: SenseId | null;
  readonly declaredState: DeclaredState;
};

export type LearnerEvent = OccurrenceOpenedEvent | StateDeclaredEvent;

/** The Lexeme this event records evidence about, if any. */
export function recordedLexemeOf(event: LearnerEvent): LexemeId | null {
  return event.recordedLexemeId;
}
