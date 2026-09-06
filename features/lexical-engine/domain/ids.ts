/**
 * Identifiers owned by the lexical engine.
 *
 * These are phase-2 ids for phase-2 objects (lexicon releases, homograph
 * groups, lexical relations, lineage events). They are *additions*, never
 * replacements: `LEX-A1-*`, `FORM-A1-*`, `SENSE-A1-*`, `GRAM-A1-*`, `SA-A1-*`
 * and MWU `NNBn-MWU-NNNN` remain the published curriculum ids and are quoted
 * verbatim wherever this feature refers to them.
 *
 * No id here is ever derived from a surface string, a lemma, a POS tag, a hash
 * of text or an order of appearance. They are assigned by the lexicon release
 * that declares the object.
 */

declare const brand: unique symbol;

type Branded<TName extends string> = string & { readonly [brand]: TName };

export type LexiconReleaseId = Branded<"LexiconReleaseId">;
export type HomographGroupId = Branded<"HomographGroupId">;
export type LexicalRelationId = Branded<"LexicalRelationId">;
export type LineageEventId = Branded<"LineageEventId">;

export type LexicalIdKind =
  | "LexiconReleaseId"
  | "HomographGroupId"
  | "LexicalRelationId"
  | "LineageEventId";

/** Patterns this feature publishes for the ids it owns. */
export const LEXICAL_ID_PATTERNS: Readonly<Record<LexicalIdKind, RegExp>> = {
  LexiconReleaseId: /^A1-LEXICON-v\d+\.\d+$/,
  HomographGroupId: /^HG-A1-\d{4}$/,
  LexicalRelationId: /^LR-A1-\d{6}$/,
  LineageEventId: /^LIN-A1-\d{6}$/,
};

export function matchesLexicalIdPattern(
  kind: LexicalIdKind,
  value: string,
): boolean {
  return LEXICAL_ID_PATTERNS[kind].test(value);
}

/**
 * Narrow a declared string to a branded lexical id without altering it.
 *
 * Performs no trimming, casing or padding. A value that does not match its
 * pattern is a domain error for the caller to report, never repaired here.
 */
export function asLexicalId<TKind extends LexicalIdKind>(
  _kind: TKind,
  value: string,
): Branded<TKind> {
  return value as Branded<TKind>;
}
