import type { SenseId } from "../curriculum/index.ts";
import { A1_EDITORIAL_ENRICHMENT_BY_SENSE } from "./a1-editorial.ts";
import type { DictionarySenseEnrichment } from "./domain.ts";

/**
 * Runtime lookup used by learner-facing adapters.
 *
 * Imported A1 enrichment will be merged into this lookup at build/import time;
 * editorial records have final precedence for product-specific wording.
 */
export function getA1DictionaryEnrichment(
  senseId: SenseId | string,
): DictionarySenseEnrichment | undefined {
  return A1_EDITORIAL_ENRICHMENT_BY_SENSE.get(senseId as SenseId);
}
