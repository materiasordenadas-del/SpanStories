/**
 * Technical fixtures for the lexical engine.
 *
 * Everything here is invented for testing and is clearly marked as such: the
 * lineage fixtures use `LEX-FIXTURE-*` ids that no release publishes, and every
 * annotation carries authority `FIXTURE`. Nothing in this file may be read as
 * curriculum data, and no fixture id ever enters the generated registry.
 *
 * Fixtures exist for exactly the cases the published A1 release does not
 * contain: it has no lineage history at all, and no same-POS homographs. Where
 * A1 *does* carry the evidence — the 20 cross-POS homograph groups, the 44
 * lexicalised MWUs, the 170 without lexeme identity — the tests use the real
 * registry instead, because a fixture would prove less.
 */

import type { Lexeme } from "../../curriculum/domain/model.ts";
import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type {
  LexemeLineageEvent,
  LineageSemantics,
  LineageEventKind,
  TransferPolicy,
} from "../domain/lineage.ts";
import type { LexicalRelation } from "../domain/relations.ts";
import type { LexicalIdentity, Pronominality } from "../domain/identity.ts";
import {
  asLexicalId,
  type LexiconReleaseId,
  type LineageEventId,
  type LexicalRelationId,
} from "../domain/ids.ts";

/** Fixture-only release, never published. */
export const FIXTURE_RELEASE = asLexicalId(
  "LexiconReleaseId",
  "A1-LEXICON-v9.9",
) as LexiconReleaseId;

/**
 * Brand a fixture lexeme id.
 *
 * Fixture ids deliberately use a `LEX-FIXTURE-` prefix so that a fixture
 * leaking into a real code path fails the published `LEX-A1-\d{6}` pattern
 * instead of passing for curriculum data.
 */
export function fixtureLexemeId(name: string): LexemeId {
  return `LEX-FIXTURE-${name}` as unknown as LexemeId;
}

let eventCounter = 0;

export function lineageEvent(
  kind: LineageEventKind,
  sources: readonly string[],
  targets: readonly string[],
  overrides: {
    readonly semantics?: LineageSemantics;
    readonly transferPolicy?: TransferPolicy;
    readonly reason?: string;
    readonly id?: string;
  } = {},
): LexemeLineageEvent {
  eventCounter += 1;
  const id = asLexicalId(
    "LineageEventId",
    overrides.id ?? `LIN-A1-${String(eventCounter).padStart(6, "0")}`,
  ) as LineageEventId;
  return {
    id,
    kind,
    sourceLexemeIds: sources as readonly LexemeId[],
    targetLexemeIds: targets as readonly LexemeId[],
    semantics: overrides.semantics ?? "EQUIVALENT_IDENTITY",
    transferPolicy: overrides.transferPolicy ?? "CONTEXTUAL",
    effectiveRelease: FIXTURE_RELEASE,
    reason: overrides.reason ?? "technical fixture",
  };
}

/**
 * A minimal published-shaped lexeme.
 *
 * Only the fields the lexical layer reads are meaningful; the rest carry
 * fixture markers so a stray fixture is recognisable in any dump.
 */
export function fixtureLexeme(
  id: string,
  lemma: string,
  enginePos: string | null,
  lexicalCategory: string | null = null,
): Lexeme {
  return {
    id: id as unknown as LexemeId,
    lemma,
    lexemeKey: `${lemma}|${id}`,
    type: "ATOMIC",
    enginePos,
    lexicalCategory,
    regionalConceptAnchor: null,
    release: "FIXTURE",
    curriculumLayer: "FIXTURE",
    curriculumInclusion: "FIXTURE",
  };
}

/**
 * Same-POS homographs: `cura` "priest" and `cura` "cure".
 *
 * A1 publishes no such pair — all 20 of its homograph groups are cross-POS — so
 * the case that proves canonical form plus POS does not determine identity has
 * to be a fixture. Both members are NOUN and both must survive grouping as
 * distinct lexemes.
 */
export const CURA_PRIEST = fixtureLexeme(
  "LEX-FIXTURE-CURA-1",
  "cura",
  "NOUN",
  "NOUN",
);
export const CURA_CURE = fixtureLexeme(
  "LEX-FIXTURE-CURA-2",
  "cura",
  "NOUN",
  "NOUN",
);

/**
 * Cross-POS homographs, fixture form: `vino` NOUN against `vino` as a form of
 * VENIR. A1 happens to publish real cross-POS groups, so the real ones carry
 * the load in the tests; this pair exists to state the canonical example.
 */
export const VINO_NOUN = fixtureLexeme(
  "LEX-FIXTURE-VINO-1",
  "vino",
  "NOUN",
  "NOUN",
);
export const VENIR_VERB = fixtureLexeme(
  "LEX-FIXTURE-VENIR",
  "venir",
  "VERB",
  "VERB",
);

/**
 * Pronominal pair: IR against IRSE.
 *
 * A1 publishes `ir` but not `irse`, and publishes six `-se` lemmas with no
 * non-pronominal counterpart, so a separate-identity pronominal pair cannot be
 * demonstrated from the release. Both members are fixtures, and both carry an
 * explicit `FIXTURE` authority: the point of the test is that the distinction
 * is *declared*, never inferred from the `-se` ending.
 */
export const IR = fixtureLexeme("LEX-FIXTURE-IR", "ir", "VERB", "VERB");
export const IRSE = fixtureLexeme("LEX-FIXTURE-IRSE", "irse", "VERB", "VERB");

export function fixtureIdentity(
  lexemeId: string,
  pronominality: Pronominality,
  note: string,
): LexicalIdentity {
  return {
    lexemeId: lexemeId as unknown as LexemeId,
    lifecycle: "ACTIVE",
    pronominality,
    pronominalityAuthority: pronominality === "UNSPECIFIED" ? "NOT_CLASSIFIED" : "FIXTURE",
    effectiveRelease: FIXTURE_RELEASE,
    note,
  };
}

export function fixtureRelation(
  id: string,
  type: LexicalRelation["type"],
  from: string,
  to: string,
  note: string,
): LexicalRelation {
  return {
    id: asLexicalId("LexicalRelationId", id) as LexicalRelationId,
    type,
    fromLexemeId: from as unknown as LexemeId,
    toLexemeId: to as unknown as LexemeId,
    basis: "FIXTURE",
    effectiveRelease: FIXTURE_RELEASE,
    note,
  };
}

/** Issue codes of a validation result, for compact assertions. */
export function codesOf(
  issues: readonly { readonly code: string }[],
): readonly string[] {
  return issues.map((issue) => issue.code);
}
