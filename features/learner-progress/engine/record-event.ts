/**
 * Construct a `LearnerEvent`.
 *
 * The result is `Object.freeze`d: a `LearnerEvent` is immutable historical
 * truth, and freezing makes an accidental in-place edit throw (in strict
 * mode, which every ES module already runs under) instead of silently
 * rewriting history. See `../__tests__/events.test.ts`.
 */

import type { LexemeFormId, LexemeId, SenseId } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type { StoryId, StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";
import type { DeclaredState } from "../domain/declared-state.ts";
import type { OccurrenceOpenedEvent, StateDeclaredEvent } from "../domain/events.ts";
import type { Clock } from "../domain/ports.ts";

type CommonInput = {
  readonly eventId: LearnerEventId;
  readonly learnerId: LearnerId;
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: LexiconReleaseId;
};

export function recordOccurrenceOpened(
  input: CommonInput & {
    readonly occurrenceId: StoryOccurrenceId;
    readonly recordedLexemeId: LexemeId | null;
    readonly recordedSenseId: SenseId | null;
    readonly recordedFormId: LexemeFormId | null;
  },
  clock: Clock,
): OccurrenceOpenedEvent {
  return Object.freeze({
    eventType: "OCCURRENCE_OPENED",
    eventId: input.eventId,
    occurredAt: clock.now().toISOString(),
    learnerId: input.learnerId,
    storyId: input.storyId,
    storyVersionId: input.storyVersionId,
    curriculumReleaseId: input.curriculumReleaseId,
    lexiconReleaseId: input.lexiconReleaseId,
    occurrenceId: input.occurrenceId,
    recordedLexemeId: input.recordedLexemeId,
    recordedSenseId: input.recordedSenseId,
    recordedFormId: input.recordedFormId,
  });
}

export function recordStateDeclared(
  input: CommonInput & {
    readonly occurrenceId: StoryOccurrenceId | null;
    readonly recordedLexemeId: LexemeId;
    readonly recordedSenseId: SenseId | null;
    readonly declaredState: DeclaredState;
  },
  clock: Clock,
): StateDeclaredEvent {
  return Object.freeze({
    eventType: "STATE_DECLARED",
    eventId: input.eventId,
    occurredAt: clock.now().toISOString(),
    learnerId: input.learnerId,
    storyId: input.storyId,
    storyVersionId: input.storyVersionId,
    curriculumReleaseId: input.curriculumReleaseId,
    lexiconReleaseId: input.lexiconReleaseId,
    occurrenceId: input.occurrenceId,
    recordedLexemeId: input.recordedLexemeId,
    recordedSenseId: input.recordedSenseId,
    declaredState: input.declaredState,
  });
}
