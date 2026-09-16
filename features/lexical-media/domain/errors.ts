/**
 * Explicit lexical-media domain errors.
 *
 * Mirrors the curriculum and lexical-engine error style: a structural problem
 * becomes a typed issue carrying the ids involved, never a thrown string or a
 * silently repaired binding.
 */

export type MediaErrorCode =
  /** A binding names a sense id that does not match the published pattern. */
  | "MEDIA_ID_PATTERN_INVALID"
  /** A binding has no candidates at all. */
  | "MEDIA_BINDING_EMPTY"
  /** Two candidates on the same binding claim the same rank. */
  | "MEDIA_DUPLICATE_RANK"
  /** A candidate's `rank` is not a positive integer. */
  | "MEDIA_RANK_INVALID"
  /** A binding's ranks are not the contiguous sequence 1..n. */
  | "MEDIA_RANK_SEQUENCE_INVALID"
  /** A candidate is missing a field required for the license to be honoured. */
  | "MEDIA_ATTRIBUTION_INCOMPLETE"
  /** A field expected to be a URL is not a well-formed http(s) URL. */
  | "MEDIA_URL_INVALID"
  /** `providerAssetId` is blank, or is a URL rather than a stable asset id. */
  | "MEDIA_PROVIDER_ASSET_ID_INVALID"
  /** The same sense id is declared by two bindings in one registry. */
  | "MEDIA_DUPLICATE_SENSE";

export type MediaIssueContext = {
  readonly senseId?: string;
  readonly rank?: number;
  readonly field?: string;
};

export type MediaIssue = MediaIssueContext & {
  readonly code: MediaErrorCode;
  readonly reason: string;
};

export function mediaIssue(
  code: MediaErrorCode,
  reason: string,
  context: MediaIssueContext = {},
): MediaIssue {
  return { code, reason, ...context };
}

export function formatMediaIssue(value: MediaIssue): string {
  const at: string[] = [];
  if (value.senseId !== undefined) at.push(`sense ${value.senseId}`);
  if (value.rank !== undefined) at.push(`rank ${value.rank}`);
  if (value.field !== undefined) at.push(`field ${value.field}`);
  const where = at.length > 0 ? ` [${at.join(" | ")}]` : "";
  return `${value.code}: ${value.reason}${where}`;
}

/** Thrown by the strict entrypoints; carries every issue found. */
export class MediaRegistryError extends Error {
  readonly issues: readonly MediaIssue[];

  constructor(issues: readonly MediaIssue[]) {
    const head = issues
      .slice(0, 10)
      .map((value) => `  - ${formatMediaIssue(value)}`)
      .join("\n");
    const more = issues.length > 10 ? `\n  ... and ${issues.length - 10} more` : "";
    super(`LEXICAL_MEDIA REGISTRY FAIL: ${issues.length} issue(s)\n${head}${more}`);
    this.name = "MediaRegistryError";
    this.issues = issues;
  }
}
