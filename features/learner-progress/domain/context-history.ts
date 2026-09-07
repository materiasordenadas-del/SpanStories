/**
 * Studied contexts, reconstructed from `OCCURRENCE_OPENED` events.
 *
 * Every encounter is kept as its own entry — never collapsed to
 * `lexemeId + count`. A count can always be derived from the list
 * (`entries.length`); the reverse is not true, and phase 6 or a future UI may
 * need to point back at *which* Story/sentence/occurrence a specific
 * encounter happened in.
 */

import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import type { StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEventId, LearnerId } from "./ids.ts";
import type { ProjectionMetadata } from "./projection-metadata.ts";

export type ContextHistoryEntry = {
  readonly storyVersionId: StoryVersionId;
  readonly occurrenceId: StoryOccurrenceId;
  readonly occurredAt: string;
  readonly recordedLexemeId: LexemeId | null;
  readonly recordedSenseId: SenseId | null;
  readonly sourceEventId: LearnerEventId;
};

export type ContextHistoryProjection = {
  readonly learnerId: LearnerId;
  /** Keyed by `LexemeId`; absent key means no recorded encounter, not zero. */
  readonly entriesByLexeme: ReadonlyMap<string, readonly ContextHistoryEntry[]>;
  readonly metadata: ProjectionMetadata;
};
