/**
 * Resolve a token's surface/lemma against the Lexical Engine — never a final
 * answer, always a candidate set, per §28 of the governing brief:
 *
 *   published LexemeForm ID match  -> published Lexeme candidates
 *   -> canonical form candidates   -> unresolved candidate
 *
 * A homograph lemma (20 groups in the A1 lexicon) legitimately produces more
 * than one candidate at whichever tier resolves — this function never picks
 * one. `LexicalEngine.getLexemesByCanonicalForm` is documented as returning
 * "candidates, not an answer" (`HANDOFF_NEXT_PHASE.md` §8); every tier here
 * keeps that promise.
 */

import type { LexicalEngine } from "../../lexical-engine/index.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { LexicalFormMatch, LexicalResolution } from "../domain/candidate.ts";

function dedupe(ids: readonly LexemeId[]): readonly LexemeId[] {
  return [...new Set(ids)];
}

export function resolveLexicalCandidates(
  engine: LexicalEngine,
  input: { readonly surface: string; readonly lemma: string },
): LexicalResolution {
  // Tier 1: the token's exact surface matches a published, inflected LexemeForm.
  const formMatches: LexicalFormMatch[] = engine.curriculum.data.lexemeForms
    .filter((form) => form.surface === input.surface)
    .map((form) => ({ lexemeFormId: form.id, lexemeId: form.lexemeId }));
  if (formMatches.length > 0) {
    return { tier: "PUBLISHED_FORM", matches: formMatches };
  }

  // Tier 2: no inflected form on file, but the analyzer's own lemma names a
  // published Lexeme's citation form directly.
  const byLemma = dedupe(engine.getLexemesByCanonicalForm(input.lemma).map((l) => l.id));
  if (byLemma.length > 0) {
    return { tier: "LEXEME_CANDIDATES", lexemeIds: byLemma };
  }

  // Tier 3: weaker still — the raw surface itself happens to equal a
  // published citation form (an uninflected word the analyzer's lemma
  // disagreed with, or lemmatised differently).
  const bySurface = dedupe(engine.getLexemesByCanonicalForm(input.surface).map((l) => l.id));
  if (bySurface.length > 0) {
    return { tier: "CANONICAL_FORM_CANDIDATES", lexemeIds: bySurface };
  }

  return { tier: "UNRESOLVED" };
}

/** Ranked `SenseCandidateEntry` list for every published `Sense` of a `Lexeme` — order is registry order, not a confidence score. */
export function senseCandidatesFor(engine: LexicalEngine, lexemeId: string): readonly { readonly senseId: string; readonly rank: number }[] {
  const result = engine.getSenses(lexemeId);
  if (result.status !== "FOUND") return [];
  return result.value.map((sense, index) => ({ senseId: sense.id, rank: index + 1 }));
}
