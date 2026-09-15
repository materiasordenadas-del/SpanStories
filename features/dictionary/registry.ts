import type {
  CurriculumRegistry,
  MwuUnitId,
  SenseId,
} from "../curriculum/index.ts";
import type {
  A1DictionaryStats,
  DictionaryMwuEntry,
  DictionarySenseEnrichment,
  DictionarySenseEntry,
} from "./domain.ts";
import { A1_DICTIONARY_ENRICHMENTS } from "./lookup.ts";

function indexEnrichments(
  curriculum: CurriculumRegistry,
  enrichments: readonly DictionarySenseEnrichment[],
): ReadonlyMap<SenseId, DictionarySenseEnrichment> {
  const byId = new Map<SenseId, DictionarySenseEnrichment>();
  for (const enrichment of enrichments) {
    if (byId.has(enrichment.senseId)) {
      throw new Error(`DICTIONARY_DUPLICATE_SENSE_ENRICHMENT: ${enrichment.senseId}`);
    }
    const sense = curriculum.getSenseById(enrichment.senseId);
    if (sense === null) {
      throw new Error(`DICTIONARY_UNKNOWN_SENSE: ${enrichment.senseId}`);
    }
    if (!sense.isA1) {
      throw new Error(`DICTIONARY_NON_A1_SENSE: ${enrichment.senseId}`);
    }
    byId.set(enrichment.senseId, enrichment);
  }
  return byId;
}

export class A1Dictionary {
  readonly senses: readonly DictionarySenseEntry[];
  readonly mwus: readonly DictionaryMwuEntry[];
  readonly stats: A1DictionaryStats;

  private readonly senseById: ReadonlyMap<SenseId, DictionarySenseEntry>;
  private readonly mwuById: ReadonlyMap<MwuUnitId, DictionaryMwuEntry>;

  constructor(
    curriculum: CurriculumRegistry,
    enrichments: readonly DictionarySenseEnrichment[] = A1_DICTIONARY_ENRICHMENTS,
  ) {
    const enrichmentBySense = indexEnrichments(curriculum, enrichments);

    this.senses = curriculum.data.senses
      .filter((sense) => sense.isA1)
      .map((sense): DictionarySenseEntry => {
        const enrichment = enrichmentBySense.get(sense.id);
        return {
          senseId: sense.id,
          lexemeId: sense.lexemeId,
          item: sense.item,
          ...(enrichment === undefined ? {} : { enrichment }),
        };
      });

    this.senseById = new Map(this.senses.map((entry) => [entry.senseId, entry] as const));

    this.mwus = curriculum.data.mwuUnits.map((unit): DictionaryMwuEntry => {
      const enrichment = unit.senseId === null ? undefined : enrichmentBySense.get(unit.senseId);
      return {
        mwuId: unit.id,
        item: unit.item,
        lexemeId: unit.lexemeId,
        senseId: unit.senseId,
        ...(enrichment === undefined ? {} : { enrichment }),
      };
    });

    this.mwuById = new Map(this.mwus.map((entry) => [entry.mwuId, entry] as const));

    const enrichedSenseCount = this.senses.filter((entry) => entry.enrichment !== undefined).length;
    this.stats = {
      a1SenseCount: this.senses.length,
      enrichedSenseCount,
      missingEnrichmentCount: this.senses.length - enrichedSenseCount,
      mwuCount: this.mwus.length,
      mwuWithoutLexicalIdentityCount: this.mwus.filter((entry) => entry.lexemeId === null).length,
    };
  }

  getSense(id: SenseId | string): DictionarySenseEntry | null {
    return this.senseById.get(id as SenseId) ?? null;
  }

  getMwu(id: MwuUnitId | string): DictionaryMwuEntry | null {
    return this.mwuById.get(id as MwuUnitId) ?? null;
  }
}

export function createA1Dictionary(
  curriculum: CurriculumRegistry,
  enrichments: readonly DictionarySenseEnrichment[] = A1_DICTIONARY_ENRICHMENTS,
): A1Dictionary {
  return new A1Dictionary(curriculum, enrichments);
}
