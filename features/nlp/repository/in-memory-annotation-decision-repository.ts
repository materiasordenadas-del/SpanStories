/**
 * In-memory `AnnotationDecisionRepository` — for tests and any wiring that
 * has no PostgreSQL backing yet. See `../domain/decision-repository.ts`.
 *
 * Exactly-once is enforced with a `Map<candidateId, Promise<...>>` used as a
 * mutual-exclusion lock per `candidateId`: two concurrent
 * `recordAccepted`/`recordRejected` calls for the same candidate serialize on
 * `pending.get(candidateId)` before either checks `decisions`, so the
 * "already decided" check and the write can never interleave. A single
 * Node.js process has no real concurrency inside synchronous code, but two
 * `await`-separated calls racing through this method absolutely can
 * interleave without this — this is the in-process analogue of PostgreSQL's
 * `UNIQUE(candidate_id)` + `INSERT ... ON CONFLICT`.
 */

import { NlpError, nlpIssue } from "../domain/errors.ts";
import type { AnnotationCandidateDecision } from "../domain/decision.ts";
import type { AnnotationDecisionRepository, RecordAcceptedInput, RecordRejectedInput } from "../domain/decision-repository.ts";
import type { AnnotationCandidateId } from "../domain/ids.ts";

function alreadyDecided(candidateId: AnnotationCandidateId): never {
  throw new NlpError([
    nlpIssue("CANDIDATE_ALREADY_DECIDED", `candidate ${candidateId} already has a recorded decision`, { recordId: candidateId }),
  ]);
}

export class InMemoryAnnotationDecisionRepository implements AnnotationDecisionRepository {
  private readonly decisions = new Map<AnnotationCandidateId, AnnotationCandidateDecision>();
  private readonly locks = new Map<AnnotationCandidateId, Promise<unknown>>();

  private async withLock<T>(candidateId: AnnotationCandidateId, fn: () => T): Promise<T> {
    const previous = this.locks.get(candidateId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    this.locks.set(candidateId, previous.then(() => gate));
    await previous;
    try {
      return fn();
    } finally {
      release();
    }
  }

  async getByCandidateId(candidateId: AnnotationCandidateId): Promise<AnnotationCandidateDecision | null> {
    return this.decisions.get(candidateId) ?? null;
  }

  recordAccepted(input: RecordAcceptedInput): Promise<AnnotationCandidateDecision> {
    return this.withLock(input.candidateId, () => {
      if (this.decisions.has(input.candidateId)) alreadyDecided(input.candidateId);
      const decision: AnnotationCandidateDecision = {
        candidateId: input.candidateId,
        decision: "ACCEPTED",
        decidedAt: input.decidedAt,
        reason: input.reason,
        editorialReference: input.editorialReference,
        resultKind: input.resultKind,
        resultingOccurrenceId: input.resultKind === "NEW_OCCURRENCE" ? input.occurrenceId : null,
        resultingRevisionId: input.resultKind === "REVISION" ? input.revisionId : null,
        materialization:
          input.resultKind === "NEW_OCCURRENCE"
            ? { occurrenceId: input.occurrenceId, anchorIds: input.anchorIds, targetBindingId: input.targetBindingId }
            : null,
      };
      this.decisions.set(input.candidateId, decision);
      return decision;
    });
  }

  recordRejected(input: RecordRejectedInput): Promise<AnnotationCandidateDecision> {
    return this.withLock(input.candidateId, () => {
      if (this.decisions.has(input.candidateId)) alreadyDecided(input.candidateId);
      const decision: AnnotationCandidateDecision = {
        candidateId: input.candidateId,
        decision: "REJECTED",
        decidedAt: input.decidedAt,
        reason: input.reason,
        editorialReference: null,
        resultKind: "NONE",
        resultingOccurrenceId: null,
        resultingRevisionId: null,
        materialization: null,
      };
      this.decisions.set(input.candidateId, decision);
      return decision;
    });
  }
}
