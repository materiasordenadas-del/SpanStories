/**
 * Canonical curriculum domain objects.
 *
 * These are the *third* representation in the import pipeline:
 *
 *   raw CSV row  !=  validated input row  !=  canonical domain object
 *
 * A raw row is `Record<string, string>` straight out of the parser. A validated
 * input row has been checked field by field with row/line context. A canonical
 * domain object below is typed, has resolved references and carries only what
 * the curriculum authority actually publishes.
 *
 * Absent values are modelled as `null`, never as an omitted key: the sources
 * distinguish "column exists and is empty" from "column does not apply", and a
 * stable key set keeps the generated registry byte-reproducible.
 */

import type {
  AllocationId,
  GrammarUnitId,
  IslandId,
  LexemeFormId,
  LexemeId,
  ModuleId,
  MwuUnitId,
  RecycleEdgeId,
  SenseId,
  SourceAssertionId,
  StoryBlueprintId,
} from "./ids.ts";

export const LEVEL_CODE = "A1" as const;
export type LevelCode = typeof LEVEL_CODE;

/** Closed vocabularies. Unknown values are rejected at import, never coerced. */
export const LEXEME_TYPES = ["ATOMIC", "MULTIWORD"] as const;
export type LexemeType = (typeof LEXEME_TYPES)[number];

export const SENSE_STATUSES = [
  "A1_CORE_NORMATIVE",
  "A1_REGIONAL_RECEPTIVE",
  "A2_BOUNDARY_NOT_A1",
] as const;
export type SenseStatus = (typeof SENSE_STATUSES)[number];

export const TARGET_TYPES = [
  "SENSE",
  "MWU_SOURCE_UNIT",
  "GRAMMAR_UNIT",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const RECYCLE_EDGE_TYPES = [
  "LOCAL_REUSE",
  "LOCAL_RECEPTIVE_REUSE",
  "NEAR_TRANSFER",
  "REGIONAL_NEAR_RECOGNITION",
  "DISTANT_RETURN",
  "REGIONAL_LATER_RECOGNITION",
  "TERMINAL_CAPSTONE_RETURN",
] as const;
export type RecycleEdgeType = (typeof RECYCLE_EDGE_TYPES)[number];

/**
 * Ordinal position of an edge on the recycling route of a target.
 *
 * The published routes always run introduction -> local -> near -> third leg;
 * the third leg is a distant return, a terminal capstone return or a regional
 * later recognition depending on the mode policy of the target.
 */
export const RECYCLE_STAGES = ["LOCAL", "NEAR", "THIRD"] as const;
export type RecycleStage = (typeof RECYCLE_STAGES)[number];

export const RECYCLE_STAGE_BY_EDGE_TYPE: Readonly<
  Record<RecycleEdgeType, RecycleStage>
> = {
  LOCAL_REUSE: "LOCAL",
  LOCAL_RECEPTIVE_REUSE: "LOCAL",
  NEAR_TRANSFER: "NEAR",
  REGIONAL_NEAR_RECOGNITION: "NEAR",
  DISTANT_RETURN: "THIRD",
  REGIONAL_LATER_RECOGNITION: "THIRD",
  TERMINAL_CAPSTONE_RETURN: "THIRD",
};

export type Lexeme = {
  readonly id: LexemeId;
  readonly lemma: string;
  readonly lexemeKey: string;
  readonly type: LexemeType;
  /** Only annotated for function-word classes resolved in phase 14c. */
  readonly enginePos: string | null;
  readonly lexicalCategory: string | null;
  /** Only set for lexemes anchored to a regional concept. */
  readonly regionalConceptAnchor: string | null;
  readonly release: string;
  readonly curriculumLayer: string;
  readonly curriculumInclusion: string;
};

export type LexemeForm = {
  readonly id: LexemeFormId;
  readonly lexemeId: LexemeId;
  readonly surface: string;
  /** Morphological features; published only where they disambiguate a form. */
  readonly features: string | null;
  readonly origin: string;
  readonly relationType: string;
  readonly variantStatus: string | null;
  readonly enginePos: string | null;
  readonly lexicalCategory: string | null;
};

export type Sense = {
  readonly id: SenseId;
  readonly lexemeId: LexemeId;
  readonly item: string;
  readonly senseKey: string;
  readonly status: SenseStatus;
  readonly scope: string;
  readonly curriculumStatus: string;
  readonly sourceAssertionPolicy: string;
  readonly enginePos: string | null;
  readonly lexicalCategory: string | null;
  readonly sourceAssertionScopeKey: string | null;
  readonly a2BoundaryScopeKey: string | null;
  /** Derived: every published sense except the six A2 boundary senses. */
  readonly isA1: boolean;
};

/**
 * A multi-word unit as published by the source inventory.
 *
 * Only a subset of MWUs are promoted to multiword Lexemes; the rest stay source
 * units with no lexeme identity. `lexemeId`/`senseId` are therefore nullable by
 * design and must not be back-filled.
 */
export type MwuUnit = {
  readonly id: MwuUnitId;
  readonly item: string;
  readonly objectClass: string;
  readonly subtype: string;
  readonly frameKey: string | null;
  readonly identityPolicy: string;
  readonly classificationConfidence: string;
  readonly lexicalCategory: string;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
};

/**
 * A grammar unit of the A1 inventory.
 *
 * The published artefacts carry grammar units only inside the sequencing
 * allocation ledger: there is no separate grammar registry file and no
 * SourceAssertion addresses a `GRAM-A1-*` id. See docs/curriculum-import.md.
 */
export type GrammarUnit = {
  readonly id: GrammarUnitId;
  readonly item: string;
  readonly pcicSection: string;
  readonly category: string;
  readonly kind: string;
};

export type SourceAssertion = {
  readonly id: SourceAssertionId;
  readonly targetType: "SENSE" | "MWU_SOURCE_UNIT" | "REGIONAL_PATTERN";
  readonly targetId: string;
  readonly targetItem: string;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
  readonly assertedLevel: string;
  readonly assertedCurriculumStatus: string;
  readonly evidenceRole: string;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly assertionBasis: string;
  readonly sourceResolution: string;
  readonly sourceLevelRelation: string;
  readonly sourcePrecision: string;
  readonly scopeKey: string;
  readonly a2BoundaryScopeKey: string | null;
  readonly expectedReceptive: string;
  readonly expectedProductive: string;
  readonly formulaicExpectation: string;
  readonly modeClass: string;
  readonly modeAuthority: string;
  readonly regionalScope: string | null;
  readonly curriculumVersion: string;
  readonly publicationStatus: string;
};

export type CurriculumModule = {
  readonly id: ModuleId;
  readonly order: number;
  readonly name: string;
  readonly communicativeGoal: string;
  readonly specificDomainFocus: string;
  readonly designRole: string;
  readonly hardPrerequisite: string;
  readonly recyclingPolicy: string;
  readonly moduleGate: string;
  readonly storyMin: number;
  readonly storyPlanningTarget: number;
  readonly storyMax: number;
  /**
   * v1.42 planning figure, kept for traceability and **superseded** as a
   * distribution: phases 16C/16D moved introductions between islands, so this
   * no longer matches the v1.44 allocation ledger per module. Its global sum
   * is still 985. The authority for what a module introduces is the ledger.
   */
  readonly plannedFirstIntroObjectsV142: number;
  /** v1.44 figure; validated against the story blueprints. */
  readonly declaredStoryBlueprintCount: number;
  readonly islandIds: readonly IslandId[];
};

export type Island = {
  readonly id: IslandId;
  readonly moduleId: ModuleId;
  readonly islandOrder: number;
  readonly globalIslandOrder: number;
  readonly name: string;
  readonly communicativeGoal: string;
  readonly specificDomainFocus: string;
  readonly designRole: string;
  readonly grammarFocus: string;
  readonly genreFocus: string;
  readonly inputModes: string;
  readonly hardPrerequisite: string;
  readonly recyclingPolicy: string;
  readonly senseIntroBudget: number;
  readonly grammarIntroBudget: number;
  readonly mwuIntroBudget: number;
  readonly regionalReceptiveIntroBudget: number;
  /**
   * v1.42 planning figure. Superseded per island by the v1.44 allocation
   * ledger; see `CurriculumModule.plannedFirstIntroObjectsV142`.
   */
  readonly plannedFirstIntroObjectsV142: number;
  /** v1.44 figure; validated against the story blueprints. */
  readonly declaredStoryBlueprintCount: number;
  readonly storyIds: readonly StoryBlueprintId[];
};

export type StoryBlueprint = {
  readonly id: StoryBlueprintId;
  readonly moduleId: ModuleId;
  readonly islandId: IslandId;
  readonly globalIslandOrder: number;
  readonly storyOrder: number;
  /** Position in the single canonical A1 story sequence, 1-based. */
  readonly sequenceIndex: number;
  readonly title: string;
  readonly role: string;
  readonly scenarioBrief: string;
  readonly communicativeGoal: string;
  readonly genreFocus: string;
  readonly plannedInputMode: string;
  readonly taskDemand: string;
  readonly isFinalTransferStory: boolean;
  /** Counts declared by the blueprint ledger, cross-checked at import. */
  readonly declaredNewTargetCount: number;
  readonly declaredScheduledRelationCount: number;
  readonly status: string;
};

/**
 * The first (and only) introduction of a curriculum target, plus the recycling
 * route scheduled for it. One per published allocation row.
 */
export type CurriculumTarget = {
  readonly allocationId: AllocationId;
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly item: string;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
  readonly objectClass: string;
  readonly senseStatus: string;
  readonly expectedReceptive: string;
  readonly expectedProductive: string;
  readonly formulaicExpectation: string;
  readonly regionalPolicy: string | null;
  readonly routeClass: string;
  readonly allocationAuthority: string;
  readonly allocationBasis: string;
  readonly allocationReason: string;
  /** Published SA-A1-* ids. Empty for MWU rows, which link by target id. */
  readonly sourceAssertionIds: readonly SourceAssertionId[];
  /**
   * Non-assertion provenance refs found in the same column. Grammar rows carry
   * a source-catalogue id (PCIC-02) here rather than an assertion id; keeping
   * it separate avoids both a false FK error and a silent drop.
   */
  readonly sourceCatalogueRefs: readonly string[];
  readonly firstIntroductionModuleId: ModuleId;
  readonly firstIntroductionIslandId: IslandId;
  readonly firstIntroductionStoryId: StoryBlueprintId;
  readonly recycleEdgeIds: readonly RecycleEdgeId[];
};

export type RecycleEdge = {
  readonly id: RecycleEdgeId;
  readonly allocationId: AllocationId;
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly item: string;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
  readonly edgeType: RecycleEdgeType;
  readonly stage: RecycleStage;
  readonly fromStoryId: StoryBlueprintId;
  readonly toStoryId: StoryBlueprintId;
  readonly fromIslandId: IslandId;
  readonly toIslandId: IslandId;
  readonly routeClass: string;
  readonly requiredEvidenceClass: string;
  readonly productiveDemandRule: string;
  readonly regionalPolicy: string | null;
  readonly masteryClaim: string;
  readonly curriculumVersion: string;
  readonly status: string;
};

/** The canonical, fully cross-linked A1 curriculum. */
export type CurriculumData = {
  readonly level: LevelCode;
  readonly modules: readonly CurriculumModule[];
  readonly islands: readonly Island[];
  readonly storyBlueprints: readonly StoryBlueprint[];
  readonly lexemes: readonly Lexeme[];
  readonly lexemeForms: readonly LexemeForm[];
  readonly senses: readonly Sense[];
  readonly mwuUnits: readonly MwuUnit[];
  readonly grammarUnits: readonly GrammarUnit[];
  readonly sourceAssertions: readonly SourceAssertion[];
  readonly targets: readonly CurriculumTarget[];
  readonly recycleEdges: readonly RecycleEdge[];
};
