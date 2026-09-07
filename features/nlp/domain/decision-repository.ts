/**
 * The single persisted authority over whether an `AnnotationCandidate` has
 * been decided — see `./decision.ts` for why this exists instead of mutating
 * `AnnotationCandidate.status` in place.
 *
 * `recordAccepted`/`recordRejected` must be atomic "insert if and only if no
 * decision exists yet for this `candidateId`" — a plain
 * `if (!(await getByCandidateId(id))) { ...write... }` is not enough (two
 * concurrent callers can both pass the check before either writes); see
 * `InMemoryAnnotationDecisionRepository` and
 * `features/persistence/repository/postgres-annotation-decision-repository.ts`
 * for the two ways this is actually enforced (in-process mutual exclusion vs.
 * `UNIQUE(candidate_id)` + `INSERT ... ON CONFLICT`).
 *
 * A caller that loses the race — or retries after its own decision was
 * already recorded — gets `CANDIDATE_ALREADY_DECIDED`
 * (`../domain/errors.ts`), never a second decision and never a silent
 * overwrite. `getByCandidateId` lets it recover the prior decision (and, for
 * `NEW_OCCURRENCE`, the prior materialization) instead of re-deriving it.
 */

import type { AnnotationCandidateId } from "./ids.ts";
import type { AnnotationCandidateDecision } from "./decision.ts";

export type RecordAcceptedInput = {
  readonly candidateId: AnnotationCandidateId;
  readonly decidedAt: string;
  readonly reason: string;
  readonly editorialReference: string | null;
} & (
  | { readonly resultKind: "NEW_OCCURRENCE"; readonly occurrenceId: string; readonly anchorIds: readonly string[]; readonly targetBindingId: string | null }
  | { readonly resultKind: "REVISION"; readonly revisionId: string }
);

export type RecordRejectedInput = {
  readonly candidateId: AnnotationCandidateId;
  readonly decidedAt: string;
  readonly reason: string;
};

export interface AnnotationDecisionRepository {
  getByCandidateId(candidateId: AnnotationCandidateId): Promise<AnnotationCandidateDecision | null>;
  /** Throws `CANDIDATE_ALREADY_DECIDED` if a decision already exists for `input.candidateId`. */
  recordAccepted(input: RecordAcceptedInput): Promise<AnnotationCandidateDecision>;
  /** Throws `CANDIDATE_ALREADY_DECIDED` if a decision already exists for `input.candidateId`. */
  recordRejected(input: RecordRejectedInput): Promise<AnnotationCandidateDecision>;
}
