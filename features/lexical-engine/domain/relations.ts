/**
 * Typed relations between published lexemes.
 *
 * Relations are directed, carry their own evidence and are never inferred from
 * spelling. The engine ships the contract and the query surface; it populates
 * only what an authority actually states. A1 supports exactly one kind today —
 * `HOMOGRAPH_OF`, from the 20 published form collisions — and the other three
 * stay empty until editorial publishes them. An empty relation set is a correct
 * answer about the release, not a gap to fill in.
 */

import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type { LexicalRelationId, LexiconReleaseId } from "./ids.ts";

export const LEXICAL_RELATION_TYPES = [
  /** Shares a canonical written form with a distinct lexeme. Symmetric. */
  "HOMOGRAPH_OF",
  /** Pronominal lexeme standing beside its non-pronominal counterpart. */
  "PRONOMINAL_COUNTERPART_OF",
  /** Orthographic or regional variant of another lexeme's identity. */
  "VARIANT_OF",
  /** Morphologically derived from another lexeme. */
  "DERIVED_FROM",
] as const;
export type LexicalRelationType = (typeof LEXICAL_RELATION_TYPES)[number];

/**
 * Relation types that hold in both directions.
 *
 * Symmetry is a property of the relation, not of the storage: a symmetric
 * relation is stored once and answered from either endpoint.
 */
export const SYMMETRIC_RELATION_TYPES: ReadonlySet<LexicalRelationType> =
  new Set<LexicalRelationType>(["HOMOGRAPH_OF"]);

export const RELATION_BASES = [
  "PUBLISHED_FORM_COLLISION",
  "EDITORIAL_DECISION",
  "FIXTURE",
] as const;
export type RelationBasis = (typeof RELATION_BASES)[number];

export type LexicalRelation = {
  readonly id: LexicalRelationId;
  readonly type: LexicalRelationType;
  readonly fromLexemeId: LexemeId;
  readonly toLexemeId: LexemeId;
  readonly basis: RelationBasis;
  readonly effectiveRelease: LexiconReleaseId;
  readonly note: string | null;
};

export function isSymmetric(type: LexicalRelationType): boolean {
  return SYMMETRIC_RELATION_TYPES.has(type);
}
