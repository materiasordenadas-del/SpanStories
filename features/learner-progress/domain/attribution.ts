/**
 * `LearnerEventAttribution` — reading a historical event against the
 * *current* `LexiconRelease`.
 *
 * A `LearnerEvent` never changes (`recordedLexemeId` is what was true when it
 * happened). What a lineage split, merge or occurrence reannotation changes is
 * which *current* lexeme that old evidence should count towards — this type
 * is that answer, always reconstructible from the event log plus the current
 * lexicon/story-engine state, never itself part of the append-only log.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type { LearnerEventId } from "./ids.ts";

/**
 *   EXACT                 the recorded lexeme is still ACTIVE; nothing moved
 *   BY_OCCURRENCE         resolved via an OccurrenceAnnotationRevision on the
 *                         Story Engine occurrence this event names
 *   BY_SENSE              a SPLIT is ambiguous at the lexeme level, but the
 *                         recorded Sense's own current lexeme disambiguates it
 *   BY_EQUIVALENT_MERGE   the recorded lexeme was merged/replaced into
 *                         exactly one successor under an identity-preserving
 *                         (not coarsening) semantics
 *   AMBIGUOUS_LEGACY      several successors exist and nothing disambiguates
 *                         which one this evidence belongs to
 *   UNATTRIBUTED          no attribution is possible at all (event recorded
 *                         no lexeme, the lexeme is unpublished, it was
 *                         retired with no successor, or it was folded into a
 *                         coarser identity with no transfer licensed)
 */
export const ATTRIBUTION_STATUSES = [
  "EXACT",
  "BY_OCCURRENCE",
  "BY_SENSE",
  "BY_EQUIVALENT_MERGE",
  "AMBIGUOUS_LEGACY",
  "UNATTRIBUTED",
] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export type LearnerEventAttribution = {
  readonly learnerEventId: LearnerEventId;
  readonly recordedLexemeId: LexemeId | null;
  /** The lexeme this evidence counts towards now. Null iff UNATTRIBUTED/AMBIGUOUS_LEGACY. */
  readonly effectiveLexemeId: LexemeId | null;
  /** Every candidate, only populated for AMBIGUOUS_LEGACY. */
  readonly ambiguousCandidates: readonly LexemeId[];
  readonly status: AttributionStatus;
  readonly lexiconReleaseId: LexiconReleaseId;
  readonly reason: string;
};
