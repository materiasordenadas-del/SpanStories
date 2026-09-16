/**
 * Discovery against the Openverse API (api.openverse.org).
 *
 * Read-only search: this never downloads or re-hosts the media it finds. It
 * returns the provider's own hosted URLs, which is what a later curated
 * `SenseImageCandidate` links to directly.
 *
 * https://docs.openverse.org/meta/media_properties/api.html
 */

import type { DiscoveredImageCandidate } from "./types.ts";

const OPENVERSE_SEARCH_ENDPOINT = "https://api.openverse.org/v1/images/";

export type OpenverseSearchOptions = {
  /** Results per page; Openverse caps this at 20 for anonymous requests. */
  readonly pageSize?: number;
  /** Restrict to licenses that permit reuse without asking; on by default. */
  readonly licenseType?: "commercial" | "modification" | "all";
};

type OpenverseResult = {
  /** Openverse's own stable UUID for the media item. */
  readonly id?: string;
  readonly title?: string;
  readonly foreign_landing_url?: string;
  readonly url?: string;
  readonly thumbnail?: string;
  readonly creator?: string;
  readonly license?: string;
  readonly license_url?: string;
};

type OpenverseResponse = {
  readonly results?: readonly OpenverseResult[];
};

function isUsable(result: OpenverseResult): result is Required<OpenverseResult> {
  return (
    typeof result.id === "string" &&
    typeof result.url === "string" &&
    typeof result.thumbnail === "string" &&
    typeof result.foreign_landing_url === "string" &&
    typeof result.creator === "string" &&
    typeof result.license === "string" &&
    typeof result.license_url === "string"
  );
}

/**
 * Search Openverse for candidate images of a Spanish word or short gloss.
 * Network failures propagate to the caller rather than being swallowed into
 * an empty list, so a curator running this interactively sees the real error.
 */
export async function searchOpenverse(
  query: string,
  options: OpenverseSearchOptions = {},
): Promise<readonly DiscoveredImageCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(options.pageSize ?? 10),
    license_type: options.licenseType ?? "commercial",
  });

  const response = await fetch(`${OPENVERSE_SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OPENVERSE_SEARCH_FAILED: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as OpenverseResponse;
  return (body.results ?? []).filter(isUsable).map(
    (result): DiscoveredImageCandidate => ({
      provider: "openverse",
      providerAssetId: result.id,
      remoteImageUrl: result.url,
      thumbnailUrl: result.thumbnail,
      sourcePageUrl: result.foreign_landing_url,
      creator: result.creator,
      license: result.license,
      licenseUrl: result.license_url,
      title: result.title ?? query,
    }),
  );
}
