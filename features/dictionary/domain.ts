import type { LexemeId, MwuUnitId, SenseId } from "../curriculum/index.ts";

/**
 * Learner-facing enrichment is deliberately separate from curricular authority.
 * Lexeme/Sense identity and CEFR status continue to come from features/curriculum.
 */
export type DictionarySourceKind =
  | "SPANSTORIES_EDITORIAL"
  | "FREEDICT"
  | "KAIKKI_WIKTEXTRACT"
  | "TATOEBA";

export type DictionarySourceRef = {
  readonly kind: DictionarySourceKind;
  readonly label: string;
  /** Stable URL or release identifier for provenance; never used as runtime dependency. */
  readonly reference: string;
};

export type DictionaryExample = {
  readonly text: string;
  readonly translation?: string;
};

export type DictionarySenseEnrichment = {
  readonly senseId: SenseId;
  readonly translation?: string;
  readonly partOfSpeechLabel?: string;
  readonly shortUsage?: string;
  readonly examples?: readonly DictionaryExample[];
  readonly usageNotes?: readonly string[];
  readonly frequency?: string;
  readonly relatedWords?: readonly string[];
  readonly sources: readonly DictionarySourceRef[];
};

/**
 * One canonical dictionary record per published A1 Sense. The curriculum owns
 * identity; this layer only adds learner-facing content.
 */
export type DictionarySenseEntry = {
  readonly senseId: SenseId;
  readonly lexemeId: LexemeId;
  readonly item: string;
  readonly enrichment?: DictionarySenseEnrichment;
};

/**
 * Every published MWU gets a dictionary address. Many MWUs deliberately have no
 * lexical identity, so mwuId — not surface text — is the canonical key here.
 */
export type DictionaryMwuEntry = {
  readonly mwuId: MwuUnitId;
  readonly item: string;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
  /** Resolved automatically when the MWU publishes a Sense that has enrichment. */
  readonly enrichment?: DictionarySenseEnrichment;
};

export type A1DictionaryStats = {
  readonly a1SenseCount: number;
  readonly enrichedSenseCount: number;
  readonly missingEnrichmentCount: number;
  readonly mwuCount: number;
  readonly mwuWithoutLexicalIdentityCount: number;
};
