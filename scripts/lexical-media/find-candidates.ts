/**
 * CLI: search image providers for candidates of a Sense.
 *
 *   npm run lexical-media:find-candidates -- "gato"
 *   npm run lexical-media:find-candidates -- --lemma=banco --translation=bench --gloss="asiento para sentarse"
 *
 * Prints JSON candidates to stdout for a curator to review. Writes nothing —
 * promoting a candidate into the registry is a manual editorial step (see
 * content/a1/images/README.md). Requires network access.
 */

import process from "node:process";

import { findImageCandidates } from "../../features/lexical-media/search/find-image-candidates.ts";
import type { ImageSearchInput } from "../../features/lexical-media/search/query-builder.ts";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match === null || match === undefined ? null : match.slice(prefix.length);
}

const positional = process.argv.slice(2).find((value) => !value.startsWith("--"));
const lemma = argValue("lemma");
const limit = argValue("limit");

let input: ImageSearchInput;
if (lemma !== null) {
  input = {
    lemma,
    senseId: argValue("sense-id") ?? undefined,
    partOfSpeech: argValue("pos") ?? undefined,
    gloss: argValue("gloss") ?? undefined,
    translation: argValue("translation") ?? undefined,
    query: argValue("query") ?? undefined,
  };
} else if (positional !== undefined) {
  input = positional;
} else {
  console.error(
    'Usage: lexical-media:find-candidates -- "<word or gloss>" [--limit=N]\n' +
      "   or: lexical-media:find-candidates -- --lemma=<word> [--translation=..] [--gloss=..] [--pos=..] [--sense-id=..] [--limit=N]",
  );
  process.exit(1);
}

const { candidates, queriesUsed, providerErrors } = await findImageCandidates(input, {
  limitPerProvider: limit === null ? undefined : Number(limit),
});

for (const error of providerErrors) {
  console.error(`provider ${error.provider} failed: ${error.message}`);
}

console.log(JSON.stringify(candidates, null, 2));
console.error(`queries: ${queriesUsed.join(" | ")}`);
console.error(`${candidates.length} candidate(s)`);
