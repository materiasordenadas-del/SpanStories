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
 *
 * The shapes here are release-neutral. Nothing carries a version-stamped field
 * name: a figure the curriculum publishes about itself is named for what it
 * means, and the release it came from is recorded once, in `CurriculumRelease`.
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

/**
 * Role a story plays in the sequence.
 *
 * Release-neutral by design: these are the three published roles, not the
 * analytical labels used while the restructure was being decided.
 */
export const STORY_ROLES = ["NARRATIVE", "INTEGRATION", "CAPSTONE"] as const;
export type StoryRole = (typeof STORY_ROLES)[number];

/**
 * Weight of a first introduction inside its story.
 *
 * FOCUS and SUPPORTED both denote *the* single first introduction of a target.
 * SUPPORTED is not a second introduction and not a lesser kind of scheduling:
 * it is the same event carrying less attentional load in that story.
 */
export const INTRO_SALIENCES = ["FOCUS", "SUPPORTED"] as const;
export type IntroSalience = (typeof INTRO_SALIENCES)[number];

/**
 * Ordinal position of a scheduled return on the recycling route of a target.
 *
 * A target has between one and three returns. The stages are a closed, ordered
 * vocabulary: where a later stage exists the earlier ones exist too, and each
 * return lands strictly after the previous one in the canonical story sequence.
 */
export const RETURN_STAGES = [
  "FIRST_RETURN",
  "SECOND_RETURN",
  "THIRD_RETURN",
] as const;
export type ReturnStage = (typeof RETURN_STAGES)[number];

/** How far a scheduled return travels from the story that introduced it. */
export const RELATION_SCOPES = [
  "SAME_ISLAND",
  "SAME_MODULE_CROSS_ISLAND",
  "CROSS_MODULE",
] as const;
export type RelationScope = (typeof RELATION_SCOPES)[number];

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

/**
 * A module of the A1 sequence.
 *
 * The published architecture ledger carries one row per island, not per module:
 * modules are reconstructed by grouping islands on `module_id`. Only attributes
 * the island rows repeat identically across a module are lifted here, and the
 * importer fails if such an attribute disagrees between two islands of the same
 * module rather than silently picking one.
 */
export type CurriculumModule = {
  readonly id: ModuleId;
  readonly order: number;
  readonly name: string;
  readonly moduleGate: string;
  /** The single story that closes the module. */
  readonly checkpointStoryId: StoryBlueprintId | null;
  /** Sum of the story counts the islands of this module declare. */
  readonly declaredStoryCount: number;
  readonly islandIds: readonly IslandId[];
};

export type Island = {
  readonly id: IslandId;
  readonly moduleId: ModuleId;
  readonly islandOrder: number;
  readonly globalIslandOrder: number;
  readonly name: string;
  readonly communicativeGoal: string;
  readonly designRole: string;
  /** Story blueprints the architecture declares for this island. */
  readonly declaredStoryCount: number;
  /** The story that closes the island. Always inside this island. */
  readonly checkpointStoryId: StoryBlueprintId;
  /** Set only on the island that closes its module. */
  readonly moduleCheckpointStoryId: StoryBlueprintId | null;
  /** Preceding island, or null where the published value is `NONE`. */
  readonly hardPrerequisiteIslandId: IslandId | null;
  readonly recyclingPolicy: string;
  readonly allocationStatus: string;
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
  readonly role: StoryRole;
  readonly scenarioBrief: string;
  readonly communicativeGoal: string;
  readonly genreFocus: string;
  readonly plannedInputMode: string;
  readonly taskDemand: string;
  readonly newTargetPolicy: string;
  readonly knownTokenCoveragePolicy: string;
  readonly masteryPolicy: string;
  readonly authoringPolicy: string;
  readonly focusGuardrail: string;
  readonly revisionReason: string;
  readonly status: string;
  readonly isIslandCheckpoint: boolean;
  readonly isModuleCheckpoint: boolean;
  readonly isFinalTransferStory: boolean;
  /** Published DELE task structures this blueprint can carry. */
  readonly deleTaskIds: readonly string[];
  /** Modalities the blueprint must exercise; empty where none is required. */
  readonly requiredModalities: readonly string[];
  /** Counts declared by the blueprint ledger, cross-checked at import. */
  readonly declaredFirstIntroTargetCount: number;
  readonly declaredFocusFirstIntroCount: number;
  readonly declaredSupportedFirstIntroCount: number;
  readonly declaredFirstReturnInCount: number;
  readonly declaredSecondReturnInCount: number;
  readonly declaredThirdReturnInCount: number;
  readonly declaredRegionalReceptiveReturnInCount: number;
  readonly declaredScheduledRelationCount: number;
};

/**
 * The first — and only — introduction of a curriculum target.
 *
 * `introSalience` records how the story weights that introduction. It does not
 * multiply the event: one published allocation row is one first introduction.
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
  readonly introSalience: IntroSalience;
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
  readonly storyBlueprintStatus: string;
  readonly recycleEdgeIds: readonly RecycleEdgeId[];
};

/**
 * One scheduled return of a target to a later story.
 *
 * The edge addresses its target directly: the published ledger links by
 * `target_id` plus the `introduction_story` of that target's allocation, and
 * the importer checks that pair against the allocation rather than trusting
 * one side of it.
 */
export type RecycleEdge = {
  readonly id: RecycleEdgeId;
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly introductionStoryId: StoryBlueprintId;
  readonly returnStage: ReturnStage;
  readonly returnStoryId: StoryBlueprintId;
  readonly relationScope: RelationScope;
  readonly evidenceDemand: string;
  readonly expectedReceptive: string;
  readonly expectedProductive: string;
  readonly masteryClaim: string;
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
