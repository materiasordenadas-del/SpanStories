/**
 * Published curriculum identifiers.
 *
 * Every id in this module is a *published* logical id: it is created by the
 * curriculum authoring process, is immutable after publication
 * (`identity_publication_policy` = `IMMUTABLE_AFTER_V1.37` in the sources) and
 * must be preserved byte-for-byte by the importer. Ids are never derived from
 * surface strings and never regenerated.
 *
 * The patterns below were verified against the published artefacts; they are
 * not assumptions. See docs/curriculum-import.md.
 */

declare const brand: unique symbol;

type Branded<TName extends string> = string & { readonly [brand]: TName };

export type LexemeId = Branded<"LexemeId">;
export type LexemeFormId = Branded<"LexemeFormId">;
export type SenseId = Branded<"SenseId">;
export type MwuUnitId = Branded<"MwuUnitId">;
export type GrammarUnitId = Branded<"GrammarUnitId">;
export type SourceAssertionId = Branded<"SourceAssertionId">;
export type AllocationId = Branded<"AllocationId">;
export type RecycleEdgeId = Branded<"RecycleEdgeId">;
export type ModuleId = Branded<"ModuleId">;
export type IslandId = Branded<"IslandId">;
export type StoryBlueprintId = Branded<"StoryBlueprintId">;
export type RegionalPatternId = Branded<"RegionalPatternId">;

/**
 * A scheduled curriculum target is addressed by the published id of the object
 * it points at, which is one of three disjoint id spaces.
 */
export type CurriculumTargetId = SenseId | MwuUnitId | GrammarUnitId;

export type CurriculumIdKind =
  | "LexemeId"
  | "LexemeFormId"
  | "SenseId"
  | "MwuUnitId"
  | "GrammarUnitId"
  | "SourceAssertionId"
  | "AllocationId"
  | "RecycleEdgeId"
  | "ModuleId"
  | "IslandId"
  | "StoryBlueprintId"
  | "RegionalPatternId";

/** Patterns observed in — and therefore demonstrated by — the published sources. */
export const ID_PATTERNS: Readonly<Record<CurriculumIdKind, RegExp>> = {
  LexemeId: /^LEX-A1-\d{6}$/,
  LexemeFormId: /^FORM-A1-\d{6}$/,
  SenseId: /^SENSE-A1-\d{6}$/,
  MwuUnitId: /^\d{2}B\d-MWU-\d{4}$/,
  GrammarUnitId: /^GRAM-A1-\d{3}$/,
  SourceAssertionId: /^SA-A1-\d{6}$/,
  AllocationId: /^SEQ-A1-\d{6}$/,
  RecycleEdgeId: /^REC-A1-\d{6}$/,
  ModuleId: /^M\d{2}$/,
  IslandId: /^A1-M\d{2}-I\d{2}$/,
  StoryBlueprintId: /^A1-M\d{2}-I\d{2}-S\d+$/,
  RegionalPatternId: /^\d{2}C-PAT-\d{4}$/,
};

export function matchesIdPattern(kind: CurriculumIdKind, value: string): boolean {
  return ID_PATTERNS[kind].test(value);
}

/**
 * Narrow a raw published string to a branded id *without* altering it.
 *
 * This is the only sanctioned way to introduce a branded id. It performs no
 * trimming, casing or padding: an id that does not match its published pattern
 * is a domain error for the caller to report, never something to repair here.
 */
export function asId<TKind extends CurriculumIdKind>(
  _kind: TKind,
  value: string,
): Branded<TKind> {
  return value as Branded<TKind>;
}

/** Classify a target id by its published prefix. Returns null when unknown. */
export function classifyTargetId(
  value: string,
): "SENSE" | "MWU_SOURCE_UNIT" | "GRAMMAR_UNIT" | null {
  if (matchesIdPattern("SenseId", value)) return "SENSE";
  if (matchesIdPattern("MwuUnitId", value)) return "MWU_SOURCE_UNIT";
  if (matchesIdPattern("GrammarUnitId", value)) return "GRAMMAR_UNIT";
  return null;
}
