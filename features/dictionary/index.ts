export type {
  A1DictionaryStats,
  DictionaryExample,
  DictionaryMwuEntry,
  DictionarySenseEnrichment,
  DictionarySenseEntry,
  DictionarySourceKind,
  DictionarySourceRef,
} from "./domain.ts";

export {
  A1_EDITORIAL_ENRICHMENTS,
  A1_EDITORIAL_ENRICHMENT_BY_SENSE,
} from "./a1-editorial.ts";

export { A1Dictionary, createA1Dictionary } from "./registry.ts";
