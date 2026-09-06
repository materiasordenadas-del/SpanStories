/**
 * Lexical identity: lifecycle and pronominality.
 *
 * Both live in an *annotation layer* keyed by published `LexemeId`, not in the
 * curriculum objects themselves. The reason is evidential, not stylistic:
 *
 *   - The A1 release publishes no lifecycle history. Every published lexeme is
 *     `ACTIVE` at the release that published it; `SUPERSEDED` and `RETIRED` are
 *     produced by lineage events, which the A1 release does not yet contain.
 *   - The A1 release publishes no pronominality field at all. Six lemmas end in
 *     `-se` (`bañarse`, `dedicarse`, `ducharse`, `lavarse`, `levantarse`,
 *     `llamarse`), but a surface ending is not a lexical fact: `-se` on the
 *     lemma is an orthographic convention, and none of the six has a published
 *     non-pronominal counterpart to contrast with. Classifying them from the
 *     string would be inference, so they stay `UNSPECIFIED`.
 *
 * Keeping the layer separate means a published `LexemeId` never changes meaning
 * when editorial authority later fills these in.
 */

import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type { LexiconReleaseId } from "./ids.ts";

/**
 * Where a lexeme stands in its own identity history.
 *
 * `PROVISIONAL` marks an identity proposed but not yet published as stable.
 * `ACTIVE` is the normal state. `SUPERSEDED` means lineage moved the identity
 * on while the id keeps resolving. `RETIRED` means it was withdrawn with no
 * successor. A superseded or retired id is never deleted and never reused.
 */
export const LEXEME_LIFECYCLE_STATUSES = [
  "PROVISIONAL",
  "ACTIVE",
  "SUPERSEDED",
  "RETIRED",
] as const;
export type LexemeLifecycleStatus = (typeof LEXEME_LIFECYCLE_STATUSES)[number];

/**
 * Whether the clitic is part of the lexeme's identity.
 *
 *   NONE                  the lexeme has no lexicalised clitic
 *   OBLIGATORY            the clitic is inseparable from the identity
 *   LEXICALIZED_ALTERNANT a distinct lexeme standing beside a non-pronominal one
 *   UNSPECIFIED           no editorial authority has classified this lexeme
 *
 * `UNSPECIFIED` is the honest default and is never inferred away. It is not a
 * synonym for `NONE`: `NONE` is a decision, `UNSPECIFIED` is its absence.
 *
 * Distinctions the engine holds and must not blur:
 *   canonical `-se` is not the literal surface "se";
 *   lexical-pronominal is not reflexive by default;
 *   reflexive, reciprocal, passive `se` and impersonal `se` are uses of a
 *   lexeme, not new lexemes.
 */
export const PRONOMINALITY_VALUES = [
  "UNSPECIFIED",
  "NONE",
  "OBLIGATORY",
  "LEXICALIZED_ALTERNANT",
] as const;
export type Pronominality = (typeof PRONOMINALITY_VALUES)[number];

/**
 * Provenance of an annotation. The engine refuses to hold a classification
 * without saying who decided it, so an inferred value cannot pass as published.
 */
export const ANNOTATION_AUTHORITIES = [
  /** Stated by the published curriculum artefacts. */
  "PUBLISHED_CURRICULUM",
  /** Decided by an editor, recorded in the lexicon release. */
  "EDITORIAL_DECISION",
  /** No authority has ruled; the value must be UNSPECIFIED. */
  "NOT_CLASSIFIED",
  /** Technical fixture, valid only inside tests. */
  "FIXTURE",
] as const;
export type AnnotationAuthority = (typeof ANNOTATION_AUTHORITIES)[number];

/**
 * The phase-2 identity layer for one published lexeme.
 *
 * `lexemeId` is a published curriculum id, quoted verbatim. Nothing here may
 * alter what that id denotes.
 */
export type LexicalIdentity = {
  readonly lexemeId: LexemeId;
  readonly lifecycle: LexemeLifecycleStatus;
  readonly pronominality: Pronominality;
  readonly pronominalityAuthority: AnnotationAuthority;
  /** Lexicon release in which this identity record is effective. */
  readonly effectiveRelease: LexiconReleaseId;
  /** Free-text justification, required when an authority did decide. */
  readonly note: string | null;
};

/**
 * The identity every published A1 lexeme starts with.
 *
 * Deliberately uniform: the A1 release carries no evidence that would justify
 * any other lifecycle or pronominality value, and a default that varied per
 * lexeme would be an inference dressed up as data.
 */
export function publishedIdentity(
  lexemeId: LexemeId,
  effectiveRelease: LexiconReleaseId,
): LexicalIdentity {
  return {
    lexemeId,
    lifecycle: "ACTIVE",
    pronominality: "UNSPECIFIED",
    pronominalityAuthority: "NOT_CLASSIFIED",
    effectiveRelease,
    note: null,
  };
}

/** True when a classification claims more than `NOT_CLASSIFIED` may claim. */
export function isUnauthorizedClassification(value: LexicalIdentity): boolean {
  return (
    value.pronominalityAuthority === "NOT_CLASSIFIED" &&
    value.pronominality !== "UNSPECIFIED"
  );
}
