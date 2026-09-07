/**
 * Resolve a matched surface pattern against the published MWU/grammar
 * inventory — a candidate target id, or explicitly `null` ("UNRESOLVED_CANDIDATE",
 * §32/§35: "si el registry no contiene la identidad requerida... no inventar
 * ID"). Never mints a `MwuUnit`/`GrammarUnit`; only ever resolves *to* one
 * the curriculum already publishes.
 */

import type { CurriculumRegistry } from "../../curriculum/index.ts";

/** Case-insensitive exact match against a published `MwuUnit.item`. `null` if none publishes exactly this phrase. */
export function resolveMwuTargetByPhrase(registry: CurriculumRegistry, phrase: string): { readonly targetId: string; readonly lexemeId: string | null } | null {
  const lower = phrase.toLowerCase();
  const unit = registry.data.mwuUnits.find((u) => u.item.toLowerCase() === lower);
  return unit === null || unit === undefined ? null : { targetId: unit.id, lexemeId: unit.lexemeId };
}

/** Case-insensitive exact match against a published `GrammarUnit.item`. `null` if none publishes exactly this label. */
export function resolveGrammarTargetByPhrase(registry: CurriculumRegistry, phrase: string): string | null {
  const lower = phrase.toLowerCase();
  const unit = registry.data.grammarUnits.find((u) => u.item.toLowerCase() === lower);
  return unit === null || unit === undefined ? null : unit.id;
}
