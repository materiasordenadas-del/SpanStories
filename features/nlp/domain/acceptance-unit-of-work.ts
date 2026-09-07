/**
 * Corrección B §17 crash-safety: for the `REVISION` acceptance path,
 * `OccurrenceAnnotationRevision` + `AnnotationCandidateDecision` must land
 * together or not at all. Two independent repository writes cannot promise
 * that on their own — a crash between them leaves a revision with no
 * decision (retryable: same candidate, no decision recorded yet) or, worse,
 * a decision recorded before the revision exists.
 *
 * `runRevisionAcceptance` is the one seam allowed to break the "domain never
 * imports a persistence adapter" rule in spirit: it is still just an
 * interface here, implemented by
 * `InMemoryAnnotationAcceptanceUnitOfWork` (`../repository/...`, no real
 * transaction — nothing to crash between in-process) and
 * `features/persistence/repository/postgres-annotation-acceptance-unit-of-work.ts`
 * (a real SQL transaction). `../review/acceptance-service.ts` degrades to a
 * decision-first, non-transactional ordering when no unit of work is
 * supplied at all (documented there) — never to two writes with no ordering
 * guarantee.
 */

import type { OccurrenceAnnotationRevision } from "../../story-engine/index.ts";
import type { AnnotationCandidateDecision } from "./decision.ts";
import type { RecordAcceptedInput } from "./decision-repository.ts";

export interface AnnotationAcceptanceUnitOfWork {
  /** Appends `revision` and records `decision` atomically. */
  runRevisionAcceptance(
    revision: OccurrenceAnnotationRevision,
    decision: RecordAcceptedInput & { readonly resultKind: "REVISION" },
  ): Promise<AnnotationCandidateDecision>;
}
