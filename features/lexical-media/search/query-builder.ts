/**
 * Turn what the curriculum knows about a Sense into search strings a
 * provider can actually match against.
 *
 * A bare Spanish lemma is a weak query: "banco" alone returns furniture,
 * financial institutions and river banks in whatever proportion the
 * provider's index happens to favour, because Openverse and Wikimedia
 * Commons are overwhelmingly tagged in English. `translation` and `gloss`
 * exist precisely to disambiguate that, so they are tried before the bare
 * lemma rather than alongside it.
 *
 * This deliberately does not fabricate compound queries ("wooden bench",
 * "park bench") or synonym expansions: that would require either a
 * hand-authored synonym dictionary per Sense (a curriculum-authoring cost
 * this feature does not own) or an AI call, and both are out of scope. What
 * it does instead is order the fields that already exist on a Sense by how
 * well each one disambiguates, and let the caller run more than one.
 */

export type ImageSearchContext = {
  readonly senseId?: string;
  readonly lemma: string;
  readonly partOfSpeech?: string;
  readonly gloss?: string;
  readonly translation?: string;
  /** Curator override: if present, tried first, verbatim. */
  readonly query?: string;
};

export type ImageSearchInput = string | ImageSearchContext;

/**
 * Ordered, deduplicated search strings for one Sense: explicit override,
 * then the English translation, then the Spanish gloss, then the bare lemma
 * as a last resort. A plain string input is returned as the sole query,
 * unchanged, for callers that already know exactly what to search.
 */
export function buildSearchQueries(input: ImageSearchInput): readonly string[] {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length === 0 ? [] : [trimmed];
  }

  const queries: string[] = [];
  const push = (value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0 && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };

  push(input.query);
  push(input.translation);
  push(input.gloss);
  push(input.lemma);
  return queries;
}
