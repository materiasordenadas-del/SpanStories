/**
 * Explicit curriculum domain errors.
 *
 * Structural problems are never reported as `undefined`, a silent default or a
 * dropped row. Every problem becomes a `CurriculumIssue` carrying enough
 * context (source file, row, record, field, referenced id) to locate it in the
 * published artefacts.
 */

export type CurriculumErrorCode =
  /** A declared canonical source file is absent or unreadable. */
  | "CURRICULUM_SOURCE_MISSING"
  /** The bytes could not be parsed as the declared CSV dialect. */
  | "CURRICULUM_PARSE_ERROR"
  /** Headers/columns do not match what the importer was written against. */
  | "CURRICULUM_SCHEMA_MISMATCH"
  /** A required field is empty or a value is outside its published domain. */
  | "CURRICULUM_IMPORT_INVALID"
  /** The same published id appears twice where uniqueness is required. */
  | "CURRICULUM_DUPLICATE_ID"
  /** A reference points at an id that does not exist. */
  | "CURRICULUM_REFERENCE_NOT_FOUND"
  /** An id does not match the pattern demonstrated by the sources. */
  | "CURRICULUM_ID_PATTERN_INVALID"
  /** An expected count declared by the release does not match the data. */
  | "CURRICULUM_COUNT_MISMATCH"
  /** Release/curriculum version identifiers disagree across sources. */
  | "CURRICULUM_RELEASE_MISMATCH"
  /** A target is scheduled in a way its own status forbids (e.g. A2 as A1). */
  | "CURRICULUM_TARGET_INVALID"
  /** Sequencing/recycling topology is invalid (backward edge, bad route order). */
  | "CURRICULUM_SEQUENCE_INVALID";

export type CurriculumIssueSeverity = "ERROR";

/** Locates an issue inside the published artefacts. */
export type CurriculumIssueContext = {
  /** Basename of the canonical source file, when known. */
  readonly sourceFile?: string;
  /** 1-based record number within the file (header excluded), when known. */
  readonly row?: number;
  /** 1-based physical line where the record starts, when known. */
  readonly line?: number;
  /** Published id of the offending record, when known. */
  readonly recordId?: string;
  /** Column name, when the problem is field-scoped. */
  readonly field?: string;
  /** The id that could not be resolved, for reference errors. */
  readonly referencedId?: string;
  /** Machine-comparable expected value, for count/version mismatches. */
  readonly expected?: string | number;
  /** Machine-comparable actual value, for count/version mismatches. */
  readonly actual?: string | number;
};

export type CurriculumIssue = CurriculumIssueContext & {
  readonly code: CurriculumErrorCode;
  readonly severity: CurriculumIssueSeverity;
  /** Human-readable statement of what is wrong. */
  readonly reason: string;
};

export function issue(
  code: CurriculumErrorCode,
  reason: string,
  context: CurriculumIssueContext = {},
): CurriculumIssue {
  return { code, severity: "ERROR", reason, ...context };
}

export function formatIssue(value: CurriculumIssue): string {
  const at: string[] = [];
  if (value.sourceFile !== undefined) at.push(value.sourceFile);
  if (value.row !== undefined) at.push(`row ${value.row}`);
  if (value.line !== undefined) at.push(`line ${value.line}`);
  if (value.recordId !== undefined) at.push(`record ${value.recordId}`);
  if (value.field !== undefined) at.push(`field ${value.field}`);
  if (value.referencedId !== undefined) at.push(`-> ${value.referencedId}`);
  if (value.expected !== undefined || value.actual !== undefined) {
    at.push(`expected ${String(value.expected)} actual ${String(value.actual)}`);
  }
  const where = at.length > 0 ? ` [${at.join(" | ")}]` : "";
  return `${value.code}: ${value.reason}${where}`;
}

/**
 * Thrown by the strict entrypoints. Carries every issue found, not just the
 * first, so a failed import can be diagnosed in one pass.
 */
export class CurriculumImportError extends Error {
  readonly issues: readonly CurriculumIssue[];

  constructor(issues: readonly CurriculumIssue[]) {
    const head = issues
      .slice(0, 10)
      .map((value) => `  - ${formatIssue(value)}`)
      .join("\n");
    const more =
      issues.length > 10 ? `\n  ... and ${issues.length - 10} more` : "";
    super(`IMPORT FAIL: ${issues.length} issue(s)\n${head}${more}`);
    this.name = "CurriculumImportError";
    this.issues = issues;
  }
}
