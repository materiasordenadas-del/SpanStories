/**
 * Explicit lexical-engine domain errors.
 *
 * Mirrors the curriculum error style: a structural problem becomes a typed
 * issue carrying the ids involved, never a thrown string, a dropped edge or a
 * silently repaired graph. The lineage validator collects every issue in one
 * pass so a corrupt lineage can be diagnosed without re-running it.
 */

export type LexicalErrorCode =
  /** A lineage event names a lexeme id that the lexicon does not publish. */
  | "LEXICAL_REFERENCE_NOT_FOUND"
  /** Source/target counts contradict the event kind (SPLIT 1->n, MERGE n->1...). */
  | "LEXICAL_LINEAGE_CARDINALITY_INVALID"
  /** Following lineage edges returns to a lexeme already on the path. */
  | "LEXICAL_LINEAGE_CYCLE"
  /** The same lineage event id is declared twice. */
  | "LEXICAL_DUPLICATE_ID"
  /** An id does not match the pattern its kind publishes. */
  | "LEXICAL_ID_PATTERN_INVALID"
  /** A lexeme is claimed by two events that cannot both hold. */
  | "LEXICAL_LINEAGE_CONFLICT"
  /** Lineage semantics and transfer policy are not a permitted combination. */
  | "LEXICAL_TRANSFER_POLICY_INVALID"
  /** A homograph group contradicts published identity (empty, or one member). */
  | "LEXICAL_HOMOGRAPH_GROUP_INVALID"
  /** An annotation asserts something the published curriculum contradicts. */
  | "LEXICAL_ANNOTATION_UNAUTHORIZED";

export type LexicalIssueSeverity = "ERROR";

export type LexicalIssueContext = {
  /** Id of the offending record (lineage event, group, annotation). */
  readonly recordId?: string;
  /** The id that could not be resolved, for reference errors. */
  readonly referencedId?: string;
  /** Lexeme ids forming a detected cycle, in traversal order. */
  readonly path?: readonly string[];
  readonly field?: string;
  readonly expected?: string | number;
  readonly actual?: string | number;
};

export type LexicalIssue = LexicalIssueContext & {
  readonly code: LexicalErrorCode;
  readonly severity: LexicalIssueSeverity;
  readonly reason: string;
};

export function lexicalIssue(
  code: LexicalErrorCode,
  reason: string,
  context: LexicalIssueContext = {},
): LexicalIssue {
  return { code, severity: "ERROR", reason, ...context };
}

export function formatLexicalIssue(value: LexicalIssue): string {
  const at: string[] = [];
  if (value.recordId !== undefined) at.push(`record ${value.recordId}`);
  if (value.field !== undefined) at.push(`field ${value.field}`);
  if (value.referencedId !== undefined) at.push(`-> ${value.referencedId}`);
  if (value.path !== undefined) at.push(`path ${value.path.join(" -> ")}`);
  if (value.expected !== undefined || value.actual !== undefined) {
    at.push(`expected ${String(value.expected)} actual ${String(value.actual)}`);
  }
  const where = at.length > 0 ? ` [${at.join(" | ")}]` : "";
  return `${value.code}: ${value.reason}${where}`;
}

/** Thrown by the strict entrypoints; carries every issue found. */
export class LexicalEngineError extends Error {
  readonly issues: readonly LexicalIssue[];

  constructor(issues: readonly LexicalIssue[]) {
    const head = issues
      .slice(0, 10)
      .map((value) => `  - ${formatLexicalIssue(value)}`)
      .join("\n");
    const more =
      issues.length > 10 ? `\n  ... and ${issues.length - 10} more` : "";
    super(`LEXICON FAIL: ${issues.length} issue(s)\n${head}${more}`);
    this.name = "LexicalEngineError";
    this.issues = issues;
  }
}
