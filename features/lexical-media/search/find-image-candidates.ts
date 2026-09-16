/**
 * Orchestrate discovery across providers for one Sense.
 *
 * This is the editorial-facing half of the system: it finds candidates for a
 * curator to look at, it does not decide anything. Nothing here writes to the
 * registry. A curator reviews the output (typically via
 * `scripts/lexical-media/find-candidates.ts`) and, for the ones they approve,
 * hand-authors a `SenseImageCandidate` in `content/a1/images/bindings.json`.
 *
 * Accepts either a bare string (back-compat / curator override) or an
 * `ImageSearchContext` carrying `lemma`/`gloss`/`translation`/`query`; see
 * `query-builder.ts` for how that context becomes one or more query strings.
 */

import { searchOpenverse } from "../providers/openverse.ts";
import { searchWikimediaCommons } from "../providers/wikimedia.ts";
import type { DiscoveredImageCandidate } from "../providers/types.ts";
import { buildSearchQueries, type ImageSearchInput } from "./query-builder.ts";

/** Injectable so tests can simulate a provider succeeding or failing offline. */
export type ProviderSearchFn = (
  query: string,
  limit: number,
) => Promise<readonly DiscoveredImageCandidate[]>;

export type FindCandidatesOptions = {
  readonly limitPerProvider?: number;
  /** Caps how many of the built queries are actually issued. Default 3. */
  readonly maxQueries?: number;
  readonly providers?: {
    readonly openverse?: ProviderSearchFn;
    readonly wikimedia?: ProviderSearchFn;
  };
};

export type ProviderError = { readonly provider: string; readonly message: string };

const defaultOpenverse: ProviderSearchFn = (query, limit) =>
  searchOpenverse(query, { pageSize: limit });
const defaultWikimedia: ProviderSearchFn = (query, limit) =>
  searchWikimediaCommons(query, { limit });

/** Identity is `provider:providerAssetId`, never the URL — see domain docs. */
function dedupe(
  candidates: readonly DiscoveredImageCandidate[],
): readonly DiscoveredImageCandidate[] {
  const seen = new Set<string>();
  const deduped: DiscoveredImageCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.providerAssetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

async function runProvider(
  name: string,
  search: ProviderSearchFn,
  query: string,
  limit: number,
  providerErrors: ProviderError[],
): Promise<readonly DiscoveredImageCandidate[]> {
  try {
    return await search(query, limit);
  } catch (error) {
    providerErrors.push({ provider: name, message: (error as Error).message });
    return [];
  }
}

/**
 * Query every provider for a Sense and return a combined, deduped candidate
 * list. One provider failing (network error, rate limit) does not take down
 * the other, and one query string failing does not stop the rest from
 * running: every partial success is kept, every failure is reported.
 */
export async function findImageCandidates(
  input: ImageSearchInput,
  options: FindCandidatesOptions = {},
): Promise<{
  readonly candidates: readonly DiscoveredImageCandidate[];
  readonly queriesUsed: readonly string[];
  readonly providerErrors: readonly ProviderError[];
}> {
  const limit = options.limitPerProvider ?? 10;
  const maxQueries = options.maxQueries ?? 3;
  const queries = buildSearchQueries(input).slice(0, maxQueries);
  const openverseSearch = options.providers?.openverse ?? defaultOpenverse;
  const wikimediaSearch = options.providers?.wikimedia ?? defaultWikimedia;
  const providerErrors: ProviderError[] = [];

  const results = await Promise.all(
    queries.flatMap((query) => [
      runProvider("openverse", openverseSearch, query, limit, providerErrors),
      runProvider("wikimedia", wikimediaSearch, query, limit, providerErrors),
    ]),
  );

  return {
    candidates: dedupe(results.flat()),
    queriesUsed: queries,
    providerErrors,
  };
}
