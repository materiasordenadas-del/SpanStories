/**
 * Explicit Story Engine domain errors.
 *
 * Mirrors the curriculum/lexical-engine error style: a structural problem
 * becomes a typed issue carrying the ids involved, never a thrown string, a
 * silently repaired anchor or a partially published version.
 */

export type StoryEngineErrorCode =
  /** An id does not match the fixed technical prefix its kind requires. */
  | "STORY_ENGINE_ID_PATTERN_INVALID"
  /** A `TextAnchor` falls outside `[0, length)` of the sentence it names. */
  | "ANCHOR_OUT_OF_BOUNDS"
  /** `end <= start` on a half-open `[start, end)` interval. */
  | "ANCHOR_EMPTY_OR_INVERTED"
  /** An `OccurrencePart` names an anchor that does not exist. */
  | "PART_ANCHOR_NOT_FOUND"
  /** Two parts of the same occurrence overlap on the surface. */
  | "PART_OVERLAP"
  /** An occurrence was constructed with zero parts. */
  | "OCCURRENCE_EMPTY"
  /** A part's role does not belong to its occurrence's kind (e.g. `SLOT` on a
   *  `LEXICAL` occurrence, or `HEAD` on a `CONSTRUCTION` one). */
  | "PART_ROLE_INVALID_FOR_KIND"
  /** A `LEXICAL` occurrence has no `HEAD` part, or a `CONSTRUCTION` one has no
   *  `ANCHOR` part. */
  | "OCCURRENCE_MISSING_REQUIRED_ROLE"
  /** A `SLOT` part carries no `slotLabel`, or a non-`SLOT` part carries one. */
  | "SLOT_LABEL_INVALID";

export type StoryEngineIssueContext = {
  readonly recordId?: string;
  readonly referencedId?: string;
  readonly field?: string;
  readonly expected?: string | number;
  readonly actual?: string | number;
};

export type StoryEngineIssue = StoryEngineIssueContext & {
  readonly code: StoryEngineErrorCode;
  readonly reason: string;
};

export function storyEngineIssue(
  code: StoryEngineErrorCode,
  reason: string,
  context: StoryEngineIssueContext = {},
): StoryEngineIssue {
  return { code, reason, ...context };
}

export function formatStoryEngineIssue(value: StoryEngineIssue): string {
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

/** Thrown by strict construction helpers; carries every issue found. */
export class StoryEngineError extends Error {
  readonly issues: readonly StoryEngineIssue[];

  constructor(issues: readonly StoryEngineIssue[]) {
    const head = issues.slice(0, 10).map((value) => `  - ${formatStoryEngineIssue(value)}`).join("\n");
    const more = issues.length > 10 ? `\n  ... and ${issues.length - 10} more` : "";
    super(`STORY_ENGINE FAIL: ${issues.length} issue(s)\n${head}${more}`);
    this.name = "StoryEngineError";
    this.issues = issues;
  }
}
