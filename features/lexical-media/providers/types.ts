/**
 * Shape returned by a discovery provider, before any editorial decision.
 *
 * Distinct from `SenseImageCandidate`: a discovered candidate has no `rank`
 * (it is not yet placed in a fallback chain) and no `status` (no curator has
 * looked at it). `search/find-image-candidates.ts` produces these; a human
 * curator promotes the chosen ones into a `SenseImageBinding` by hand.
 */

import type { ImageProvider } from "../domain/sense-image-binding.ts";

export type DiscoveredImageCandidate = {
  readonly provider: ImageProvider;
  /** The provider's own stable identifier — never derived from the URL. */
  readonly providerAssetId: string;
  readonly remoteImageUrl: string;
  readonly thumbnailUrl: string;
  readonly sourcePageUrl: string;
  readonly creator: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly title: string;
};
