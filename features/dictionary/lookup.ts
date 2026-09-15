import type { SenseId } from "../curriculum/index.ts";
import { A1_EDITORIAL_ENRICHMENTS } from "./a1-editorial.ts";
import type { DictionarySenseEnrichment } from "./domain.ts";
import { A1_GENERATED_ENRICHMENTS } from "./generated.ts";
import { mergeDictionaryEnrichment } from "./merge.ts";

/** Generated data is the baseline; SpanStories editorial content may refine individual fields. */
const enrichmentBySense = new Map<SenseId, DictionarySenseEnrichment>();
for (const enrichment of A1_GENERATED_ENRICHMENTS) {
  if (enrichmentBySense.has(enrichment.senseId)) {
    throw new Error(`DICTIONARY_DUPLICATE_GENERATED_SENSE: ${enrichment.senseId}`);
  }
  enrichmentBySense.set(enrichment.senseId, enrichment);
}
for (const enrichment of A1_EDITORIAL_ENRICHMENTS) {
  enrichmentBySense.set(
    enrichment.senseId,
    mergeDictionaryEnrichment(enrichmentBySense.get(enrichment.senseId), enrichment),
  );
}

export const A1_DICTIONARY_ENRICHMENTS: readonly DictionarySenseEnrichment[] = [
  ...enrichmentBySense.values(),
];

/** Runtime lookup used by learner-facing adapters. */
export function getA1DictionaryEnrichment(
  senseId: SenseId | string,
): DictionarySenseEnrichment | undefined {
  return enrichmentBySense.get(senseId as SenseId);
}
