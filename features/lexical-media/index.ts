/**
 * Public contract of the lexical-media feature.
 *
 * Scope: an external reference registry for Sense images. No image bytes are
 * stored or served by SpanStories — every URL exposed here points at an
 * external provider, and the reader hotlinks it directly. Downstream code
 * (adapters, UI) should import from here rather than reaching into
 * `providers/`, `search/` or `registry/` directly.
 */

export type { MediaErrorCode, MediaIssue, MediaIssueContext } from "./domain/errors.ts";
export { MediaRegistryError, formatMediaIssue, mediaIssue } from "./domain/errors.ts";

export type {
  CandidateStatus,
  ImageProvider,
  SenseImageBinding,
  SenseImageCandidate,
} from "./domain/sense-image-binding.ts";
export {
  CANDIDATE_STATUSES,
  IMAGE_PROVIDERS,
  SERVABLE_STATUSES,
  validateBinding,
} from "./domain/sense-image-binding.ts";

export { CANONICAL_SOURCE_FILE, IMAGES_FILE, REGISTRY_DIR } from "./registry/files.ts";
export {
  buildImageRegistry,
  ensureSourceFile,
  readImageRegistry,
  readSourceBindings,
  validateBindings,
} from "./registry/serialize.ts";
export { ImageRegistry, createImageRegistry } from "./registry/query.ts";

export type { DiscoveredImageCandidate } from "./providers/types.ts";
export { searchOpenverse } from "./providers/openverse.ts";
export { searchWikimediaCommons } from "./providers/wikimedia.ts";
export { findImageCandidates } from "./search/find-image-candidates.ts";
export type {
  FindCandidatesOptions,
  ProviderError,
  ProviderSearchFn,
} from "./search/find-image-candidates.ts";
export { buildSearchQueries } from "./search/query-builder.ts";
export type { ImageSearchContext, ImageSearchInput } from "./search/query-builder.ts";

import { readImageRegistry } from "./registry/serialize.ts";
import { createImageRegistry, type ImageRegistry } from "./registry/query.ts";
import { REGISTRY_DIR } from "./registry/files.ts";

/**
 * Load the generated registry from disk and index it for querying.
 *
 * Node-side only. Load once at module scope in a server context; never per
 * request.
 */
export function loadImageRegistry(inputDir: string = REGISTRY_DIR): ImageRegistry {
  const bindings = readImageRegistry(inputDir);
  return createImageRegistry(bindings);
}
