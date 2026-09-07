/**
 * The latest `STATE_DECLARED` event per Lexeme, per learner.
 *
 * Rebuildable by construction: this is a pure fold over the sorted event log,
 * with no persisted intermediate state anywhere. Delete it and recompute from
 * the same events -> the same result (`../__tests__/rebuildability.test.ts`).
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventId, LearnerId } from "../domain/ids.ts";
import type { DeclaredState } from "../domain/declared-state.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";
import { sortedByOccurrence } from "./ordering.ts";

export type DeclaredStateEntry = {
  readonly lexemeId: LexemeId;
  readonly state: DeclaredState;
  readonly declaredAt: string;
  readonly sourceEventId: LearnerEventId;
};

export type DeclaredStateProjection = {
  readonly learnerId: LearnerId;
  readonly states: ReadonlyMap<string, DeclaredStateEntry>;
  readonly metadata: ProjectionMetadata;
};

export function buildDeclaredStateProjection(
  learnerId: LearnerId,
  events: readonly LearnerEvent[],
  metadata: ProjectionMetadata,
): DeclaredStateProjection {
  const cutoff = metadata.eventCutoff;
  const relevant = sortedByOccurrence(
    events.filter((e) => e.learnerId === learnerId && e.eventType === "STATE_DECLARED" && e.occurredAt <= cutoff),
  );

  const states = new Map<string, DeclaredStateEntry>();
  for (const event of relevant) {
    if (event.eventType !== "STATE_DECLARED") continue;
    // Later events overwrite earlier ones for the same lexeme — last writer,
    // in the total order defined by `compareLearnerEvents`, wins.
    states.set(event.recordedLexemeId, {
      lexemeId: event.recordedLexemeId,
      state: event.declaredState,
      declaredAt: event.occurredAt,
      sourceEventId: event.eventId,
    });
  }

  return { learnerId, states, metadata };
}
