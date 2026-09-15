import generatedEnrichments from "../../generated/dictionary/a1/enrichments.json" with { type: "json" };
import type { SenseId } from "../curriculum/index.ts";
import type { DictionarySenseEnrichment } from "./domain.ts";

type JsonEnrichment = Omit<DictionarySenseEnrichment, "senseId"> & { readonly senseId: string };

/**
 * Build artifact produced by the dictionary import/curation pipeline.
 * The cast is intentionally centralized here; registry validation still checks
 * every Sense id against the canonical curriculum before publication.
 */
export const A1_GENERATED_ENRICHMENTS: readonly DictionarySenseEnrichment[] =
  (generatedEnrichments as readonly JsonEnrichment[]).map((entry) => ({
    ...entry,
    senseId: entry.senseId as SenseId,
  }));
