/**
 * A Sense's image, as a registry of external references — never a file.
 *
 * SpanStories stores zero image bytes for this feature. A `SenseImageBinding`
 * is a few hundred bytes of metadata pointing at an image hosted by an
 * external provider (Openverse, Wikimedia Commons, ...). The reader renders
 * `<img src={candidate.thumbnailUrl}>` directly against that remote host.
 *
 * Binding is keyed by `Sense`, not by surface form or story: "perro" and
 * "perros" resolve to the same Sense and therefore the same binding, and a
 * verb's inflected forms (como, comes, comió, comemos, ...) all resolve
 * through their shared Sense to one curated image. This is what makes the
 * registry apply automatically to every story that ever surfaces that Sense,
 * rather than something authored per story.
 *
 * A binding may carry more than one candidate. Rank 1 is what the reader
 * shows; the rest are a fallback chain for when a remote URL goes stale
 * (renamed, deleted, or a provider outage) — never a design in itself, only a
 * refusal to let a dead hotlink blank a word's visual entirely. See
 * `resolveImageForSense` in `../registry/query.ts` for how the chain is
 * walked at read time.
 */

import { matchesIdPattern } from "../../curriculum/domain/ids.ts";
import { mediaIssue, type MediaIssue } from "./errors.ts";

export const IMAGE_PROVIDERS = ["openverse", "wikimedia"] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

/**
 * `APPROVED`   curator has confirmed this is the right image for the Sense
 * `FALLBACK`   acceptable but not preferred; used only if better ranks fail
 * `PENDING_REVIEW`  discovered by search, not yet looked at by a curator
 * `REJECTED`   a curator looked at it and said no; kept so it is never
 *              resurfaced by a later automated search for the same Sense
 */
export const CANDIDATE_STATUSES = [
  "APPROVED",
  "FALLBACK",
  "PENDING_REVIEW",
  "REJECTED",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** Statuses `resolveImageForSense` is willing to serve to the reader. */
export const SERVABLE_STATUSES: readonly CandidateStatus[] = ["APPROVED", "FALLBACK"];

export type SenseImageCandidate = {
  /** Serving order within the binding: 1 is tried first. Unique per binding. */
  readonly rank: number;
  readonly provider: ImageProvider;
  /**
   * The provider's own stable identifier for this asset — an Openverse UUID,
   * a Commons `File:...` title. Never the URL: a provider can rename or move
   * the file at the same identity (Commons explicitly documents this), and an
   * identity built from the URL would silently break on the first rename.
   */
  readonly providerAssetId: string;
  /** Full-size media, hosted by the provider. Not downloaded, only linked. */
  readonly remoteImageUrl: string;
  /** Reduced-size media for inline display; what the reader actually embeds. */
  readonly thumbnailUrl: string;
  /** Where a viewer can see licensing/attribution for this specific file. */
  readonly sourcePageUrl: string;
  readonly creator: string;
  readonly license: string;
  readonly licenseUrl: string;
  /** Alt text for the reader's `<img>`; authored, not derived from the URL. */
  readonly altText: string;
  readonly status: CandidateStatus;
  /** ISO date a curator last confirmed this candidate still resolves. */
  readonly validatedAt: string;
};

export type SenseImageBinding = {
  readonly senseId: string;
  readonly candidates: readonly SenseImageCandidate[];
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateCandidate(
  senseId: string,
  candidate: SenseImageCandidate,
  issues: MediaIssue[],
): void {
  if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
    issues.push(
      mediaIssue("MEDIA_RANK_INVALID", "rank must be a positive integer", {
        senseId,
        rank: candidate.rank,
      }),
    );
  }

  const assetId = candidate.providerAssetId.trim();
  if (assetId.length === 0 || /^https?:\/\//i.test(assetId)) {
    issues.push(
      mediaIssue(
        "MEDIA_PROVIDER_ASSET_ID_INVALID",
        "providerAssetId must be a non-blank, non-URL provider identifier",
        { senseId, rank: candidate.rank, field: "providerAssetId" },
      ),
    );
  }

  type StringField = keyof Pick<
    SenseImageCandidate,
    "remoteImageUrl" | "thumbnailUrl" | "sourcePageUrl" | "creator" | "license" | "licenseUrl" | "altText"
  >;
  const requiredFields: readonly StringField[] = [
    "remoteImageUrl",
    "thumbnailUrl",
    "sourcePageUrl",
    "creator",
    "license",
    "licenseUrl",
    "altText",
  ];
  type UrlField = keyof Pick<
    SenseImageCandidate,
    "remoteImageUrl" | "thumbnailUrl" | "sourcePageUrl" | "licenseUrl"
  >;
  const urlFields: readonly UrlField[] = [
    "remoteImageUrl",
    "thumbnailUrl",
    "sourcePageUrl",
    "licenseUrl",
  ];

  for (const field of requiredFields) {
    if (candidate[field].trim().length === 0) {
      issues.push(
        mediaIssue("MEDIA_ATTRIBUTION_INCOMPLETE", `${field} is required and cannot be blank`, {
          senseId,
          rank: candidate.rank,
          field,
        }),
      );
      continue;
    }
    if ((urlFields as readonly string[]).includes(field) && !isHttpUrl(candidate[field])) {
      issues.push(
        mediaIssue("MEDIA_URL_INVALID", `${field} must be a well-formed http(s) URL`, {
          senseId,
          rank: candidate.rank,
          field,
        }),
      );
    }
  }
}

/**
 * Validate one binding's internal shape: id pattern, non-empty candidate
 * list, a contiguous 1..n rank sequence with no duplicates, and complete
 * attribution on every candidate. Does not check that `senseId` exists in the
 * published curriculum — that is a registry-level, cross-referencing check.
 */
export function validateBinding(binding: SenseImageBinding): readonly MediaIssue[] {
  const issues: MediaIssue[] = [];

  if (!matchesIdPattern("SenseId", binding.senseId)) {
    issues.push(
      mediaIssue("MEDIA_ID_PATTERN_INVALID", "senseId does not match SENSE-A1-NNNNNN", {
        senseId: binding.senseId,
      }),
    );
  }

  if (binding.candidates.length === 0) {
    issues.push(
      mediaIssue("MEDIA_BINDING_EMPTY", "a binding must carry at least one candidate", {
        senseId: binding.senseId,
      }),
    );
    return issues;
  }

  const seenRanks = new Set<number>();
  for (const candidate of binding.candidates) {
    if (seenRanks.has(candidate.rank)) {
      issues.push(
        mediaIssue("MEDIA_DUPLICATE_RANK", "two candidates on this binding share a rank", {
          senseId: binding.senseId,
          rank: candidate.rank,
        }),
      );
    }
    seenRanks.add(candidate.rank);
    validateCandidate(binding.senseId, candidate, issues);
  }

  const sortedRanks = [...seenRanks].sort((a, b) => a - b);
  const isContiguousFromOne = sortedRanks.every((rank, index) => rank === index + 1);
  if (!isContiguousFromOne) {
    issues.push(
      mediaIssue(
        "MEDIA_RANK_SEQUENCE_INVALID",
        "ranks must form the contiguous sequence 1..n with no gaps",
        { senseId: binding.senseId },
      ),
    );
  }

  return issues;
}
