/**
 * `AnnotationCandidateDecision` — the single, append-only authority over
 * whether an `AnnotationCandidate` was accepted or rejected.
 *
 * `AnnotationCandidate.status` (`./candidate.ts`) is the *raw* candidate's own
 * `CANDIDATE`/`REVIEW_REQUIRED`/`ACCEPTED`/`REJECTED` field, but nothing
 * mutates a persisted candidate row to flip it — there is no candidate
 * repository with an `UPDATE ... SET status = 'ACCEPTED'` path. The one and
 * only persisted, authoritative record of an editorial decision is a row in
 * `AnnotationDecisionRepository` (`./decision-repository.ts`), keyed
 * `UNIQUE(candidateId)`: once written, it cannot be overwritten by an
 * incompatible decision. A caller wanting "is this candidate still open for
 * review" composes `candidate.status` with the presence/kind of its decision
 * (`effectiveReviewStatus` below) — two views of one fact, not two competing
 * authorities.
 *
 * See `../review/acceptance-service.ts` for how `resultKind`/materialization
 * make a retried `accept()` call idempotent-safe (`CANDIDATE_ALREADY_DECIDED`)
 * instead of minting a second `StoryOccurrence`/`OccurrenceAnnotationRevision`.
 */

import type { AnnotationCandidateId } from "./ids.ts";
import type { CandidateStatus } from "./candidate.ts";

export const DECISION_KINDS = ["ACCEPTED", "REJECTED"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DECISION_RESULT_KINDS = ["NEW_OCCURRENCE", "REVISION", "NONE"] as const;
export type DecisionResultKind = (typeof DECISION_RESULT_KINDS)[number];

/**
 * Enough of a `NEW_OCCURRENCE` acceptance's shape to answer "what did
 * accepting this candidate produce" without minting a second set of ids on
 * retry. `anchorIds` covers every `TextAnchor` the occurrence's parts
 * reference; `targetBindingId` is `null` when the candidate named no
 * curriculum target.
 */
export type AcceptedOccurrenceMaterialization = {
  readonly occurrenceId: string;
  readonly anchorIds: readonly string[];
  readonly targetBindingId: string | null;
};

export type AnnotationCandidateDecision = {
  readonly candidateId: AnnotationCandidateId;
  readonly decision: DecisionKind;
  readonly decidedAt: string;
  readonly reason: string;
  readonly editorialReference: string | null;
  readonly resultKind: DecisionResultKind;
  readonly resultingOccurrenceId: string | null;
  readonly resultingRevisionId: string | null;
  /** Set only when `resultKind === "NEW_OCCURRENCE"`. */
  readonly materialization: AcceptedOccurrenceMaterialization | null;
};

/**
 * The composed view a UI/editorial workflow actually wants: `candidate.status`
 * alone is stale the instant a decision is recorded elsewhere, and a decision
 * alone says nothing about `REVIEW_REQUIRED` ambiguity that never reached a
 * decision at all.
 */
export function effectiveReviewStatus(
  candidateStatus: CandidateStatus,
  decision: AnnotationCandidateDecision | null,
): CandidateStatus {
  if (decision !== null) return decision.decision;
  return candidateStatus;
}
