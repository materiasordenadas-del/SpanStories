/**
 * Evidence that a learner encountered one specific curriculum target —
 * `SENSE`, `MWU_SOURCE_UNIT` or `GRAMMAR_UNIT` — without collapsing the three
 * into one shape (`docs/learner-progress-implementation.md` §"TargetEvidence").
 *
 * `Sense != MWU != GrammarUnit`, and a `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` target
 * legitimately has no `Lexeme` at all (170 of 214 MWUs, all 169 grammar
 * units). `TargetEvidence` is deliberately not `Lexeme`-shaped: it is never
 * used to mint one, and its absence for a target is never treated as
 * `NO_LEXICAL_IDENTITY` being wrong.
 *
 * `TargetEvidence != mastery`: this records that >= 1 `LearnerEvent`
 * evidences this exact target, nothing about how well the learner knows it.
 * See `../domain/progress.ts` for `computedMastery`, which stays `null`.
 */

import type { LexemeId, SenseId, TargetType } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type { StoryId, StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { LearnerEventId, LearnerId } from "./ids.ts";

/**
 * How a `TargetEvidence` record was resolved.
 *
 * `LEXEME_ATTRIBUTION`: the event recorded a `Lexeme` encounter and the
 * target is a `SENSE` target on that same lexeme — the pre-existing
 * lineage-aware path (`../engine/attribution-engine.ts`), unchanged.
 *
 * `STORY_TARGET_BINDING`: the event's occurrence carries a
 * `StoryTargetBinding` naming this exact target directly — the only path
 * available for `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` targets, and the only one
 * that works with no `Lexeme` in the picture at all.
 */
export const EVIDENCE_KINDS = ["LEXEME_ATTRIBUTION", "STORY_TARGET_BINDING"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

type TargetEvidenceBase = {
  readonly learnerId: LearnerId;
  readonly targetId: string;
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  /** Null only for a `STATE_DECLARED`-sourced record; every current source is `OCCURRENCE_OPENED`. */
  readonly occurrenceId: StoryOccurrenceId | null;
  readonly eventId: LearnerEventId;
  readonly occurredAt: string;
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: LexiconReleaseId;
  readonly evidenceKind: EvidenceKind;
};

export type SenseTargetEvidence = TargetEvidenceBase & {
  readonly targetType: "SENSE";
  readonly evidenceKind: "LEXEME_ATTRIBUTION";
  readonly lexemeId: LexemeId;
  readonly senseId: SenseId | null;
};

export type MwuTargetEvidence = TargetEvidenceBase & {
  readonly targetType: "MWU_SOURCE_UNIT";
  readonly evidenceKind: "STORY_TARGET_BINDING";
};

export type GrammarTargetEvidence = TargetEvidenceBase & {
  readonly targetType: "GRAMMAR_UNIT";
  readonly evidenceKind: "STORY_TARGET_BINDING";
};

/**
 * `TargetEvidence` deliberately mirrors `TargetType` (`../../curriculum/index.ts`)
 * as a closed, discriminated union rather than one shape carrying an optional
 * `lexemeId` — a `GrammarTargetEvidence` must not even have a field to put a
 * `Lexeme` id in.
 */
export type TargetEvidence = SenseTargetEvidence | MwuTargetEvidence | GrammarTargetEvidence;

export function targetTypeOfEvidence(evidence: TargetEvidence): TargetType {
  return evidence.targetType;
}
