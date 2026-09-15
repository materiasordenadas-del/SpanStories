import type { DictionarySenseEnrichment, DictionarySourceRef } from "./domain.ts";

function sourceKey(source: DictionarySourceRef): string {
  return `${source.kind}\u0000${source.reference}\u0000${source.label}`;
}

/**
 * Merge learner-facing enrichment without treating an editorial correction as
 * a replacement for the whole imported record. Scalar/array fields supplied by
 * the overlay win; provenance is preserved as the union of both sources.
 */
export function mergeDictionaryEnrichment(
  baseline: DictionarySenseEnrichment | undefined,
  overlay: DictionarySenseEnrichment,
): DictionarySenseEnrichment {
  if (baseline === undefined) return overlay;
  if (baseline.senseId !== overlay.senseId) {
    throw new Error(`DICTIONARY_MERGE_SENSE_MISMATCH: ${baseline.senseId} != ${overlay.senseId}`);
  }

  const sourceMap = new Map<string, DictionarySourceRef>();
  for (const source of [...baseline.sources, ...overlay.sources]) {
    sourceMap.set(sourceKey(source), source);
  }

  return {
    ...baseline,
    ...overlay,
    senseId: baseline.senseId,
    sources: [...sourceMap.values()],
  };
}
