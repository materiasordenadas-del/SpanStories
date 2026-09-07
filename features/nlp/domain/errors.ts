/**
 * Explicit NLP feature domain errors.
 *
 * Mirrors `features/story-engine/domain/errors.ts`'s style: a structural or
 * safety problem becomes a typed issue carrying the ids involved, never a
 * thrown string or a silently-accepted bad candidate. See
 * `docs/nlp-annotation-assistant.md` for which of these are reachable from
 * the acceptance service (`../review/acceptance-service.ts`) versus the
 * analyzer bridge (`../adapters/spacy/spacy-analyzer.ts`).
 */

export type NlpErrorCode =
  /** An id does not match the fixed technical prefix its kind requires. */
  | "NLP_ID_PATTERN_INVALID"
  /** A candidate's anchor falls outside its sentence's bounds, or is empty/inverted. */
  | "CANDIDATE_ANCHOR_INVALID"
  /** Two parts of the same candidate overlap on the surface. */
  | "CANDIDATE_PART_OVERLAP"
  /** A candidate was built with zero parts. */
  | "CANDIDATE_EMPTY"
  /** `acceptAnnotationCandidate` was asked to accept something already `ACCEPTED`/`REJECTED`. */
  | "CANDIDATE_NOT_PENDING"
  /** The candidate's `storyVersionId`, `curriculumReleaseId` or `lexiconReleaseId` no
   *  longer matches the current one — §37 "stale candidate protection". */
  | "STALE_CANDIDATE"
  /** A candidate names a `LexemeId`/`SenseId`/`LexemeFormId`/target id the current
   *  registries do not publish. */
  | "CANDIDATE_UNKNOWN_REFERENCE"
  /** A candidate's `senseId` does not belong to its own `lexemeId`. */
  | "CANDIDATE_SENSE_LEXEME_MISMATCH"
  /** The analyzer subprocess exited non-zero, timed out, or produced output
   *  that does not match the versioned Node<->Python JSON contract. */
  | "ANALYZER_BRIDGE_FAILURE"
  /** A candidate already has a recorded `AnnotationCandidateDecision` — accept/reject
   *  is exactly-once, enforced by `AnnotationDecisionRepository`, not by `status`. */
  | "CANDIDATE_ALREADY_DECIDED"
  /** A reannotation was attempted against a `StoryOccurrence` whose `kind` does not
   *  match the reannotation being proposed (e.g. lexical reannotation of a
   *  CONSTRUCTION occurrence) — never silently coerced via a type assertion. */
  | "CANDIDATE_REANNOTATION_KIND_MISMATCH"
  /** The runtime analyzer's spaCy/model version does not match the governed,
   *  fingerprinted configuration this codebase was built and tested against. */
  | "ANALYZER_VERSION_MISMATCH";

export type NlpIssueContext = {
  readonly recordId?: string;
  readonly referencedId?: string;
  readonly field?: string;
  readonly expected?: string | number;
  readonly actual?: string | number;
};

export type NlpIssue = NlpIssueContext & {
  readonly code: NlpErrorCode;
  readonly reason: string;
};

export function nlpIssue(code: NlpErrorCode, reason: string, context: NlpIssueContext = {}): NlpIssue {
  return { code, reason, ...context };
}

export function formatNlpIssue(value: NlpIssue): string {
  const at: string[] = [];
  if (value.recordId !== undefined) at.push(`record ${value.recordId}`);
  if (value.field !== undefined) at.push(`field ${value.field}`);
  if (value.referencedId !== undefined) at.push(`-> ${value.referencedId}`);
  if (value.expected !== undefined || value.actual !== undefined) {
    at.push(`expected ${String(value.expected)} actual ${String(value.actual)}`);
  }
  const where = at.length > 0 ? ` [${at.join(" | ")}]` : "";
  return `${value.code}: ${value.reason}${where}`;
}

/** Thrown by strict construction/validation helpers; carries every issue found. */
export class NlpError extends Error {
  readonly issues: readonly NlpIssue[];

  constructor(issues: readonly NlpIssue[]) {
    const head = issues.slice(0, 10).map((value) => `  - ${formatNlpIssue(value)}`).join("\n");
    const more = issues.length > 10 ? `\n  ... and ${issues.length - 10} more` : "";
    super(`NLP FAIL: ${issues.length} issue(s)\n${head}${more}`);
    this.name = "NlpError";
    this.issues = issues;
  }
}
