import type { LexemeId, SenseId } from "../../curriculum/index.ts";

/**
 * Hechos léxicos publicados que necesita el mundo interactivo.
 *
 * Es una vista de solo lectura sobre el registro A1 publicado: nada aquí
 * crea Lexemes, Senses ni formas, y no infiere género ni ninguna otra
 * propiedad que el registro no publique.
 */
export type SenseFacts = {
  readonly senseId: SenseId;
  readonly lexemeId: LexemeId;
  readonly isA1: boolean;
  readonly item: string;
  /** Formas publicadas con relationType CANONICAL_OR_BASE_FORM. */
  readonly canonicalForms: readonly string[];
};

export interface LexiconLookup {
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
  senseFacts(senseId: string): SenseFacts | null;
}

type RawSense = { readonly id: string; readonly lexemeId: string; readonly item: string; readonly isA1: boolean };
type RawForm = { readonly lexemeId: string; readonly surface: string; readonly relationType: string };

export const CANONICAL_RELATION = "CANONICAL_OR_BASE_FORM";

/** Construye el índice desde los datos publicados (JSON generado). Apto para navegador y Node. */
export function createLexiconLookup(input: {
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
  readonly senses: readonly RawSense[];
  readonly forms: readonly RawForm[];
}): LexiconLookup {
  const formsByLexeme = new Map<string, string[]>();
  for (const form of input.forms) {
    if (form.relationType !== CANONICAL_RELATION) continue;
    const list = formsByLexeme.get(form.lexemeId) ?? [];
    list.push(form.surface);
    formsByLexeme.set(form.lexemeId, list);
  }
  const senses = new Map<string, RawSense>();
  for (const sense of input.senses) senses.set(sense.id, sense);
  return {
    curriculumReleaseId: input.curriculumReleaseId,
    lexiconReleaseId: input.lexiconReleaseId,
    senseFacts(senseId: string): SenseFacts | null {
      const sense = senses.get(senseId);
      if (sense === undefined) return null;
      return {
        senseId: sense.id as SenseId,
        lexemeId: sense.lexemeId as LexemeId,
        isA1: sense.isA1,
        item: sense.item,
        canonicalForms: Object.freeze([...(formsByLexeme.get(sense.lexemeId) ?? [])]),
      };
    },
  };
}
