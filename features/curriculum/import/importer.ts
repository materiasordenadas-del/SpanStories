/**
 * Curriculum importer: published artefacts -> canonical domain objects.
 *
 * Guarantees:
 *  - deterministic: same source bytes + same importer version produce the same
 *    canonical output, including collection order;
 *  - offline: filesystem only. No UI, browser, localStorage, database, network,
 *    external API or model call takes part in an import;
 *  - strict: a structural problem produces IMPORT FAIL with located issues,
 *    never a partially valid release presented as correct.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  CurriculumImportError,
  issue,
  type CurriculumIssue,
} from "../domain/errors.ts";
import {
  asId,
  matchesIdPattern,
  type IslandId,
  type ModuleId,
  type RecycleEdgeId,
  type SenseId,
  type SourceAssertionId,
  type StoryBlueprintId,
} from "../domain/ids.ts";
import {
  INTRO_SALIENCES,
  LEVEL_CODE,
  LEXEME_TYPES,
  RELATION_SCOPES,
  RETURN_STAGES,
  SENSE_STATUSES,
  STORY_ROLES,
  TARGET_TYPES,
  type CurriculumData,
  type CurriculumModule,
  type CurriculumTarget,
  type GrammarUnit,
  type Island,
  type Lexeme,
  type LexemeForm,
  type MwuUnit,
  type RecycleEdge,
  type Sense,
  type SourceAssertion,
  type StoryBlueprint,
} from "../domain/model.ts";
import {
  REGISTRY_SCHEMA_VERSION,
  type CountCheck,
  type CurriculumRelease,
  type SourceFileManifest,
} from "../domain/release.ts";
import { readCsvFile, type ParsedCsv } from "./csv.ts";
import {
  ARCHITECTURE_EXPECTED_COUNTS,
  readPublishedExpectations,
  type CountKey,
} from "./expectations.ts";
import { RowReader } from "./fields.ts";
import {
  CANONICAL_SOURCES,
  CANONICAL_SOURCE_DIR,
  NORMALIZATION_MASTER,
  RECYCLING_EDGES,
  SEQUENCING_ALLOCATION,
  SEQUENCING_ARCHITECTURE,
  SEQUENCING_AUDIT,
  SEQUENCING_SOURCE_KEYS,
  SOURCE_ASSERTIONS,
  STORY_BLUEPRINTS,
  VERSION_STAMPED_COLUMN,
  type CanonicalSource,
  type CanonicalSourceKey,
} from "./sources.ts";
import { validateCurriculum } from "./validators.ts";

export { CANONICAL_SOURCE_DIR };

export type ImportOptions = {
  /** Directory holding the published artefacts. Defaults to the repo path. */
  readonly sourceDir?: string;
  /** Injectable clock so tests do not depend on wall time. */
  readonly now?: () => Date;
};

export type CurriculumImportResult =
  | {
      readonly status: "IMPORT_OK";
      readonly release: CurriculumRelease;
      readonly data: CurriculumData;
      readonly issues: readonly [];
    }
  | {
      readonly status: "IMPORT_FAIL";
      readonly issues: readonly CurriculumIssue[];
      /** Present when enough was readable to describe what was attempted. */
      readonly release: CurriculumRelease | null;
    };

/** Row-type vocabularies the importer was written against. */
const NORM_ROW_TYPES = [
  "INPUT_OBJECT",
  "LEXEME_REGISTRY",
  "LEXEME_FORM_REGISTRY",
  "SENSE_REGISTRY",
  "SPLIT_OR_SENSE_TARGET",
  "SOURCE_ASSERTION_SCOPE",
  "OUTSIDE_LEXEME_COUNT_OBJECT",
  "ADDITIONAL_SENSE_TARGET",
  "REGIONAL_PATTERN_CANDIDATE",
] as const;

/**
 * v1.51 publishes island rows only. `MODULE`, `SEQUENCING_RULE` and
 * `RECYCLING_RULE` belonged to the archived v1.44 layout; encountering one now
 * is schema drift, not a row to skip.
 */
const ARCH_RECORD_TYPES = ["ISLAND"] as const;

const SA_RECORD_TYPES = ["SOURCE_ASSERTION", "ASSERTION_ENVELOPE"] as const;

const SA_TARGET_TYPES = [
  "SENSE",
  "MWU_SOURCE_UNIT",
  "REGIONAL_PATTERN",
] as const;

/** Marks a published assertion as final rather than superseded staging. */
const PUBLISHED_ASSERTION_STATUS = "PUBLISHED_V1.40";

/** Published value meaning "this island opens the sequence". */
const NO_PREREQUISITE = "NONE";

function compareBy<T>(key: (value: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const left = key(a);
    const right = key(b);
    return left < right ? -1 : left > right ? 1 : 0;
  };
}

function padOrder(value: number): string {
  return Number.isFinite(value) ? String(value).padStart(6, "0") : "999999";
}

/** Split a published `;`-separated list. Empty stays empty, never `[""]`. */
function splitList(value: string): string[] {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * Import the canonical A1 curriculum.
 *
 * Returns a result rather than throwing so that every issue in the release can
 * be enumerated in one pass. Use `importCurriculumOrThrow` when the caller
 * wants a hard failure.
 */
export function importCurriculum(
  options: ImportOptions = {},
): CurriculumImportResult {
  const sourceDir = options.sourceDir ?? CANONICAL_SOURCE_DIR;
  const now = options.now ?? (() => new Date());
  const issues: CurriculumIssue[] = [];

  // ---------------------------------------------------------------- sources
  const parsed = new Map<CanonicalSourceKey, ParsedCsv>();
  for (const source of CANONICAL_SOURCES) {
    const result = readCsvFile(join(sourceDir, source.file), source.file, source);
    parsed.set(source.key, result);
    issues.push(...result.issues);
  }

  const manifests: SourceFileManifest[] = [];
  const curriculumVersions: Record<string, string> = {};
  for (const source of CANONICAL_SOURCES) {
    const file = parsed.get(source.key);
    if (file === undefined) continue;
    const declared = declaredVersion(source, file, issues);
    if (declared !== null) curriculumVersions[source.key] = declared;
    manifests.push({
      file: source.file,
      sha256: file.sha256,
      byteLength: file.byteLength,
      recordCount: file.records.length,
      declaredCurriculumVersion: declared,
    });
  }

  // Parse and schema problems make every downstream reading untrustworthy.
  if (issues.length > 0) {
    return { status: "IMPORT_FAIL", issues, release: null };
  }

  const get = (key: CanonicalSourceKey): ParsedCsv => {
    const value = parsed.get(key);
    if (value === undefined) {
      throw new Error(`internal: source ${key} was not read`);
    }
    return value;
  };

  /*
   * Release-neutral column contract (published audit control H-024).
   *
   * The restructure retired the version-stamped sequencing columns
   * (`v1_42_*`, `v1_43_*`, `v1_44_*`). Reintroducing one would smuggle a
   * superseded release's semantics back into the active schema, so the guard
   * is enforced here rather than trusted from the ledger.
   */
  let versionStampedColumns = 0;
  for (const key of SEQUENCING_SOURCE_KEYS) {
    const file = get(key);
    for (const column of file.header) {
      if (!VERSION_STAMPED_COLUMN.test(column)) continue;
      versionStampedColumns += 1;
      issues.push(
        issue(
          "CURRICULUM_IMPORT_INVALID",
          `column ${JSON.stringify(column)} is stamped with a curriculum version; the active sequencing schema is release-neutral`,
          { sourceFile: file.file, field: column },
        ),
      );
    }
  }

  // ---------------------------------------------------------------- entities
  const norm = get("normalizationMaster");
  const lexemes: Lexeme[] = [];
  const lexemeForms: LexemeForm[] = [];
  const senses: Sense[] = [];
  const mwuUnits: MwuUnit[] = [];

  for (const record of norm.records) {
    const read = new RowReader(norm.file, record, issues);
    const rowType = read.enum("phase14_row_type", NORM_ROW_TYPES);
    const objectType = read.raw("object_type");

    if (objectType === "MWU_CHUNK") {
      const id = read.id("MwuUnitId", "record_id");
      read.identify(id);
      mwuUnits.push({
        id,
        item: read.required("item"),
        objectClass: read.required("mwu_object_class"),
        subtype: read.required("mwu_subtype"),
        frameKey: read.optional("mwu_frame_key"),
        identityPolicy: read.required("mwu_identity_policy"),
        classificationConfidence: read.required("mwu_classification_confidence"),
        lexicalCategory: read.required("lexical_category"),
        lexemeId: read.optionalId("LexemeId", "lexeme_id"),
        senseId: read.optionalId("SenseId", "sense_id"),
      });
      continue;
    }

    if (rowType === "LEXEME_REGISTRY") {
      const id = read.id("LexemeId", "lexeme_id");
      read.identify(id);
      lexemes.push({
        id,
        lemma: read.required("canonical_lemma_final"),
        lexemeKey: read.required("lexeme_key"),
        type: read.enum("lexeme_type_final", LEXEME_TYPES),
        enginePos: read.optional("engine_pos"),
        lexicalCategory: read.optional("lexical_category"),
        regionalConceptAnchor: read.optional("regional_concept_anchor"),
        release: read.required("lexeme_release"),
        curriculumLayer: read.required("curriculum_layer"),
        curriculumInclusion: read.required("curriculum_inclusion"),
      });
      continue;
    }

    if (rowType === "LEXEME_FORM_REGISTRY") {
      const id = read.id("LexemeFormId", "form_id");
      read.identify(id);
      lexemeForms.push({
        id,
        lexemeId: read.id("LexemeId", "lexeme_id"),
        surface: read.required("form_surface"),
        features: read.optional("form_features_final"),
        origin: read.required("form_origin"),
        relationType: read.required("form_relation_type"),
        variantStatus: read.optional("curricular_variant_status"),
        enginePos: read.optional("engine_pos"),
        lexicalCategory: read.optional("lexical_category"),
      });
      continue;
    }

    if (rowType === "SENSE_REGISTRY") {
      const id = read.id("SenseId", "sense_id");
      read.identify(id);
      const status = read.enum("sense_status_final", SENSE_STATUSES);
      senses.push({
        id,
        lexemeId: read.id("LexemeId", "lexeme_id"),
        item: read.required("item"),
        senseKey: read.required("sense_key"),
        status,
        scope: read.required("sense_scope_final"),
        curriculumStatus: read.required("sense_curriculum_status"),
        sourceAssertionPolicy: read.required("source_assertion_policy"),
        enginePos: read.optional("engine_pos"),
        lexicalCategory: read.optional("lexical_category"),
        sourceAssertionScopeKey: read.optional("source_assertion_scope_key"),
        a2BoundaryScopeKey: read.optional("a2_boundary_scope_key"),
        isA1: status !== "A2_BOUNDARY_NOT_A1",
      });
    }
    // Other row types are staging/provenance rows outside the published
    // identity registries. They are recognised (the enum above rejects
    // anything unknown) and intentionally not imported.
  }

  // ------------------------------------------------------- source assertions
  const saFile = get("sourceAssertions");
  const sourceAssertions: SourceAssertion[] = [];
  for (const record of saFile.records) {
    const read = new RowReader(saFile.file, record, issues);
    const recordType = read.enum("record_type", SA_RECORD_TYPES);
    if (recordType !== "SOURCE_ASSERTION") continue;
    const id = read.id("SourceAssertionId", "source_assertion_id");
    read.identify(id);
    const publicationStatus = read.required("final_publication_status");
    if (publicationStatus !== PUBLISHED_ASSERTION_STATUS) {
      issues.push(
        issue(
          "CURRICULUM_IMPORT_INVALID",
          `assertion is typed SOURCE_ASSERTION but its publication status is ${publicationStatus}`,
          {
            sourceFile: saFile.file,
            row: record.row,
            line: record.line,
            recordId: id,
            field: "final_publication_status",
          },
        ),
      );
    }
    sourceAssertions.push({
      id,
      targetType: read.enum("target_type", SA_TARGET_TYPES),
      targetId: read.required("target_id"),
      targetItem: read.required("target_item"),
      lexemeId: read.optionalId("LexemeId", "lexeme_id"),
      senseId: read.optionalId("SenseId", "sense_id"),
      assertedLevel: read.required("asserted_level"),
      assertedCurriculumStatus: read.required("asserted_curriculum_status"),
      evidenceRole: read.required("evidence_role"),
      sourceId: read.required("source_id_single"),
      sourceUrl: read.required("source_url_single"),
      assertionBasis: read.required("assertion_basis"),
      sourceResolution: read.required("source_resolution"),
      sourceLevelRelation: read.required("source_level_relation"),
      sourcePrecision: read.required("source_precision"),
      scopeKey: read.required("scope_key"),
      a2BoundaryScopeKey: read.optional("a2_boundary_scope_key"),
      expectedReceptive: read.required("expected_receptive"),
      expectedProductive: read.required("expected_productive"),
      formulaicExpectation: read.required("formulaic_expectation"),
      modeClass: read.required("mode_class"),
      modeAuthority: read.required("mode_authority"),
      regionalScope: read.optional("regional_scope"),
      curriculumVersion: read.required("curriculum_version"),
      publicationStatus,
    });
  }

  // ------------------------------------------------------ modules and islands
  /*
   * v1.51 publishes eleven ISLAND rows and no MODULE row. The eight modules are
   * therefore reconstructed by grouping islands on `module_id`. Attributes a
   * module owns (`module_order`, `module_name`, `module_gate`) are repeated on
   * each of its island rows; disagreement between two rows of the same module
   * is reported rather than resolved by taking the first value read.
   */
  const archFile = get("sequencingArchitecture");
  type ModuleDraft = {
    id: ModuleId;
    order: number;
    name: string;
    moduleGate: string;
    checkpointStoryIds: Set<string>;
    declaredStoryCount: number;
  };
  const moduleDrafts = new Map<string, ModuleDraft>();
  const islands: Island[] = [];

  for (const record of archFile.records) {
    const read = new RowReader(archFile.file, record, issues);
    read.enum("record_type", ARCH_RECORD_TYPES);
    const id = read.id("IslandId", "island_id");
    read.identify(id);

    // The published `sequence_id` restates the island id; a divergence means
    // the row was assembled from two different islands.
    const sequenceId = read.required("sequence_id");
    if (sequenceId !== "" && sequenceId !== id) {
      issues.push(
        issue(
          "CURRICULUM_SEQUENCE_INVALID",
          "sequence_id does not restate the island id of its own row",
          {
            sourceFile: archFile.file,
            row: record.row,
            line: record.line,
            recordId: id,
            field: "sequence_id",
            expected: id,
            actual: sequenceId,
          },
        ),
      );
    }

    const moduleId = read.id("ModuleId", "module_id");
    const moduleOrder = read.integer("module_order");
    const moduleName = read.required("module_name");
    const moduleGate = read.required("module_gate");
    const declaredStoryCount = read.integer("story_count");
    const moduleCheckpoint = read.optionalId(
      "StoryBlueprintId",
      "module_checkpoint_story_id",
    );

    const draft = moduleDrafts.get(moduleId);
    if (draft === undefined) {
      moduleDrafts.set(moduleId, {
        id: moduleId,
        order: moduleOrder,
        name: moduleName,
        moduleGate,
        checkpointStoryIds: new Set(
          moduleCheckpoint === null ? [] : [moduleCheckpoint],
        ),
        declaredStoryCount,
      });
    } else {
      const disagreements: [string, string | number, string | number][] = [];
      if (draft.order !== moduleOrder) {
        disagreements.push(["module_order", draft.order, moduleOrder]);
      }
      if (draft.name !== moduleName) {
        disagreements.push(["module_name", draft.name, moduleName]);
      }
      if (draft.moduleGate !== moduleGate) {
        disagreements.push(["module_gate", draft.moduleGate, moduleGate]);
      }
      for (const [field, expected, actual] of disagreements) {
        issues.push(
          issue(
            "CURRICULUM_SEQUENCE_INVALID",
            `islands of module ${moduleId} disagree about ${field}`,
            {
              sourceFile: archFile.file,
              row: record.row,
              line: record.line,
              recordId: id,
              field,
              expected,
              actual,
            },
          ),
        );
      }
      if (moduleCheckpoint !== null) draft.checkpointStoryIds.add(moduleCheckpoint);
      draft.declaredStoryCount += declaredStoryCount;
    }

    const prerequisite = read.required("hard_prerequisite");
    let hardPrerequisiteIslandId: IslandId | null = null;
    if (prerequisite !== NO_PREREQUISITE && prerequisite !== "") {
      if (!matchesIdPattern("IslandId", prerequisite)) {
        issues.push(
          issue(
            "CURRICULUM_ID_PATTERN_INVALID",
            `hard_prerequisite ${JSON.stringify(prerequisite)} is neither ${NO_PREREQUISITE} nor a published IslandId`,
            {
              sourceFile: archFile.file,
              row: record.row,
              line: record.line,
              recordId: id,
              field: "hard_prerequisite",
            },
          ),
        );
      }
      hardPrerequisiteIslandId = asId("IslandId", prerequisite);
    }

    islands.push({
      id,
      moduleId,
      islandOrder: read.integer("island_order"),
      globalIslandOrder: read.integer("global_island_order"),
      name: read.required("island_name"),
      communicativeGoal: read.required("communicative_goal"),
      designRole: read.required("design_role"),
      declaredStoryCount,
      checkpointStoryId: read.id("StoryBlueprintId", "island_checkpoint_story_id"),
      moduleCheckpointStoryId: moduleCheckpoint,
      hardPrerequisiteIslandId,
      recyclingPolicy: read.required("recycling_policy"),
      allocationStatus: read.required("allocation_status"),
      storyIds: [],
    });
  }

  islands.sort(compareBy((value) => padOrder(value.globalIslandOrder)));

  // -------------------------------------------------------- story blueprints
  const storyFile = get("storyBlueprints");
  const storyRows: Omit<StoryBlueprint, "sequenceIndex">[] = [];
  for (const record of storyFile.records) {
    const read = new RowReader(storyFile.file, record, issues);
    const id = read.id("StoryBlueprintId", "story_id");
    read.identify(id);
    storyRows.push({
      id,
      moduleId: read.id("ModuleId", "module_id"),
      islandId: read.id("IslandId", "island_id"),
      globalIslandOrder: read.integer("global_island_order"),
      storyOrder: read.integer("story_order"),
      title: read.required("story_title"),
      role: read.enum("story_role", STORY_ROLES),
      scenarioBrief: read.required("scenario_brief"),
      communicativeGoal: read.required("communicative_goal"),
      genreFocus: read.required("genre_focus"),
      plannedInputMode: read.required("planned_input_mode"),
      taskDemand: read.required("task_demand"),
      newTargetPolicy: read.required("new_target_policy"),
      knownTokenCoveragePolicy: read.required("known_token_coverage_policy"),
      masteryPolicy: read.required("mastery_policy"),
      authoringPolicy: read.required("authoring_policy"),
      focusGuardrail: read.required("focus_guardrail"),
      revisionReason: read.required("revision_reason"),
      status: read.required("status"),
      isIslandCheckpoint: read.yesNo("is_island_checkpoint"),
      isModuleCheckpoint: read.yesNo("is_module_checkpoint"),
      isFinalTransferStory: read.yesNo("is_final_transfer_story"),
      deleTaskIds: splitList(read.raw("dele_task_ids")),
      requiredModalities: splitList(read.raw("required_modalities")),
      declaredFirstIntroTargetCount: read.integer("first_intro_target_count"),
      declaredFocusFirstIntroCount: read.integer("focus_first_intro_count"),
      declaredSupportedFirstIntroCount: read.integer("supported_first_intro_count"),
      declaredFirstReturnInCount: read.integer("first_return_in_count"),
      declaredSecondReturnInCount: read.integer("second_return_in_count"),
      declaredThirdReturnInCount: read.integer("third_return_in_count"),
      declaredRegionalReceptiveReturnInCount: read.integer(
        "regional_receptive_return_in_count",
      ),
      declaredScheduledRelationCount: read.integer("scheduled_relation_count"),
    });
  }

  storyRows.sort(
    compareBy(
      (value) => `${padOrder(value.globalIslandOrder)}#${padOrder(value.storyOrder)}`,
    ),
  );
  const storyBlueprints: StoryBlueprint[] = storyRows.map((value, index) => ({
    ...value,
    sequenceIndex: index + 1,
  }));

  // ------------------------------------------------------------- allocations
  const allocFile = get("sequencingAllocation");
  type AllocationDraft = Omit<CurriculumTarget, "recycleEdgeIds">;
  const allocations: AllocationDraft[] = [];
  const grammarUnitsById = new Map<string, GrammarUnit>();

  for (const record of allocFile.records) {
    const read = new RowReader(allocFile.file, record, issues);
    const allocationId = read.id("AllocationId", "allocation_id");
    read.identify(allocationId);
    const targetType = read.enum("target_type", TARGET_TYPES);
    const targetId = read.required("target_id");

    // The target id must belong to the id space its declared type implies.
    const idKind =
      targetType === "SENSE"
        ? "SenseId"
        : targetType === "MWU_SOURCE_UNIT"
          ? "MwuUnitId"
          : "GrammarUnitId";
    if (targetId !== "" && !matchesIdPattern(idKind, targetId)) {
      issues.push(
        issue(
          "CURRICULUM_ID_PATTERN_INVALID",
          `target id ${JSON.stringify(targetId)} does not match the ${idKind} pattern required by target_type ${targetType}`,
          {
            sourceFile: allocFile.file,
            row: record.row,
            line: record.line,
            recordId: allocationId,
            field: "target_id",
          },
        ),
      );
    }

    // Grammar units exist only here; build the registry as we read the ledger.
    if (targetType === "GRAMMAR_UNIT" && targetId !== "") {
      const unit: GrammarUnit = {
        id: asId("GrammarUnitId", targetId),
        item: read.required("item"),
        pcicSection: read.required("grammar_pcic_section"),
        category: read.required("grammar_category"),
        kind: read.required("grammar_kind"),
      };
      const existing = grammarUnitsById.get(targetId);
      if (existing === undefined) {
        grammarUnitsById.set(targetId, unit);
      } else if (existing.item !== unit.item) {
        issues.push(
          issue(
            "CURRICULUM_DUPLICATE_ID",
            "grammar unit id is allocated twice with different content",
            {
              sourceFile: allocFile.file,
              row: record.row,
              line: record.line,
              recordId: allocationId,
              referencedId: targetId,
            },
          ),
        );
      }
    }

    const assertionRefs: SourceAssertionId[] = [];
    const catalogueRefs: string[] = [];
    for (const ref of splitList(read.raw("source_assertion_ids"))) {
      if (matchesIdPattern("SourceAssertionId", ref)) {
        assertionRefs.push(asId("SourceAssertionId", ref));
      } else {
        catalogueRefs.push(ref);
      }
    }

    allocations.push({
      allocationId,
      targetType,
      targetId,
      item: read.required("item"),
      lexemeId: read.optionalId("LexemeId", "lexeme_id"),
      senseId: read.optionalId("SenseId", "sense_id"),
      objectClass: read.required("object_class"),
      senseStatus: read.required("sense_status"),
      expectedReceptive: read.required("expected_receptive"),
      expectedProductive: read.required("expected_productive"),
      formulaicExpectation: read.optional("formulaic_expectation") ?? "",
      regionalPolicy: read.optional("regional_policy"),
      introSalience: read.enum("intro_salience", INTRO_SALIENCES),
      allocationAuthority: read.required("allocation_authority"),
      allocationBasis: read.required("allocation_basis"),
      allocationReason: read.required("allocation_reason"),
      sourceAssertionIds: assertionRefs,
      sourceCatalogueRefs: catalogueRefs,
      firstIntroductionModuleId: read.id("ModuleId", "module_id"),
      firstIntroductionIslandId: read.id("IslandId", "island_id"),
      firstIntroductionStoryId: read.id("StoryBlueprintId", "story_id"),
      storyBlueprintStatus: read.required("story_blueprint_status"),
    });
  }

  allocations.sort(compareBy((value) => value.allocationId));

  // ------------------------------------------------------------ recycle edges
  const recFile = get("recyclingEdges");
  const recycleEdges: RecycleEdge[] = [];
  for (const record of recFile.records) {
    const read = new RowReader(recFile.file, record, issues);
    const id = read.id("RecycleEdgeId", "edge_id");
    read.identify(id);
    recycleEdges.push({
      id,
      targetType: read.enum("target_type", TARGET_TYPES),
      targetId: read.required("target_id"),
      introductionStoryId: read.id("StoryBlueprintId", "introduction_story"),
      returnStage: read.enum("return_stage", RETURN_STAGES),
      returnStoryId: read.id("StoryBlueprintId", "return_story"),
      relationScope: read.enum("relation_scope", RELATION_SCOPES),
      evidenceDemand: read.required("evidence_demand"),
      expectedReceptive: read.required("expected_receptive"),
      expectedProductive: read.required("expected_productive"),
      masteryClaim: read.required("mastery_claim"),
    });
  }
  recycleEdges.sort(compareBy((value) => value.id));

  // ------------------------------------------------------------- cross-links
  const stageRank = new Map(RETURN_STAGES.map((stage, index) => [stage, index]));
  const edgesByTarget = new Map<string, RecycleEdge[]>();
  for (const edge of recycleEdges) {
    const bucket = edgesByTarget.get(edge.targetId);
    if (bucket === undefined) edgesByTarget.set(edge.targetId, [edge]);
    else bucket.push(edge);
  }
  for (const bucket of edgesByTarget.values()) {
    bucket.sort(
      compareBy((edge) => `${stageRank.get(edge.returnStage) ?? 9}#${edge.id}`),
    );
  }

  const targets: CurriculumTarget[] = allocations.map((draft) => ({
    ...draft,
    recycleEdgeIds: (edgesByTarget.get(draft.targetId) ?? []).map(
      (edge) => edge.id as RecycleEdgeId,
    ),
  }));

  const storyIdsByIsland = new Map<string, StoryBlueprintId[]>();
  for (const story of storyBlueprints) {
    const bucket = storyIdsByIsland.get(story.islandId);
    if (bucket === undefined) storyIdsByIsland.set(story.islandId, [story.id]);
    else bucket.push(story.id);
  }
  const islandsWithStories: Island[] = islands.map((island) => ({
    ...island,
    storyIds: storyIdsByIsland.get(island.id) ?? [],
  }));

  const islandIdsByModule = new Map<string, IslandId[]>();
  for (const island of islandsWithStories) {
    const bucket = islandIdsByModule.get(island.moduleId);
    if (bucket === undefined) islandIdsByModule.set(island.moduleId, [island.id]);
    else bucket.push(island.id);
  }

  const modules: CurriculumModule[] = [...moduleDrafts.values()]
    .sort(compareBy((value) => padOrder(value.order)))
    .map((draft) => {
      const checkpoints = [...draft.checkpointStoryIds].sort();
      if (checkpoints.length > 1) {
        issues.push(
          issue(
            "CURRICULUM_SEQUENCE_INVALID",
            `module ${draft.id} declares more than one module checkpoint story`,
            {
              sourceFile: SEQUENCING_ARCHITECTURE.file,
              recordId: draft.id,
              field: "module_checkpoint_story_id",
              actual: checkpoints.join(", "),
            },
          ),
        );
      }
      return {
        id: draft.id,
        order: draft.order,
        name: draft.name,
        moduleGate: draft.moduleGate,
        checkpointStoryId:
          checkpoints.length === 1
            ? asId("StoryBlueprintId", checkpoints[0])
            : null,
        declaredStoryCount: draft.declaredStoryCount,
        islandIds: islandIdsByModule.get(draft.id) ?? [],
      };
    });

  const grammarUnits: GrammarUnit[] = [...grammarUnitsById.values()].sort(
    compareBy((value) => value.id),
  );

  const data: CurriculumData = {
    level: LEVEL_CODE,
    modules,
    islands: islandsWithStories,
    storyBlueprints,
    lexemes: lexemes.slice().sort(compareBy((value) => value.id)),
    lexemeForms: lexemeForms.slice().sort(compareBy((value) => value.id)),
    senses: senses.slice().sort(compareBy((value) => value.id)),
    mwuUnits: mwuUnits.slice().sort(compareBy((value) => value.id)),
    grammarUnits,
    sourceAssertions: sourceAssertions
      .slice()
      .sort(compareBy((value) => value.id)),
    targets,
    recycleEdges,
  };

  // ------------------------------------------------------------- validation
  const validation = validateCurriculum(data, {
    normalizationFile: NORMALIZATION_MASTER.file,
    sourceAssertionsFile: SOURCE_ASSERTIONS.file,
    architectureFile: SEQUENCING_ARCHITECTURE.file,
    allocationFile: SEQUENCING_ALLOCATION.file,
    storyFile: STORY_BLUEPRINTS.file,
    recycleFile: RECYCLING_EDGES.file,
  });
  issues.push(...validation.issues);

  // ----------------------------------------------------------------- counts
  const actualCounts = countCurriculum(data, {
    ...validation.observed,
    versionStampedColumns,
  });
  const publishedExpectations = readPublishedExpectations(
    get("sequencingAudit").records,
  );
  const countChecks: CountCheck[] = [];

  for (const key of Object.keys(ARCHITECTURE_EXPECTED_COUNTS) as CountKey[]) {
    const expected = ARCHITECTURE_EXPECTED_COUNTS[key];
    const actual = actualCounts[key];
    const matches = expected === actual;
    countChecks.push({
      key,
      expected,
      actual,
      matches,
      expectationSource: "engine architecture, phase 1 acceptance criteria",
    });
    if (!matches) {
      issues.push(
        issue(
          "CURRICULUM_COUNT_MISMATCH",
          `count ${key} does not match the architecture acceptance criterion`,
          { expected, actual },
        ),
      );
    }
  }

  for (const expectation of publishedExpectations) {
    const actual = actualCounts[expectation.countKey];
    const matches = expectation.expected === actual;
    countChecks.push({
      key: expectation.countKey,
      expected: expectation.expected,
      actual,
      matches,
      expectationSource: `${SEQUENCING_AUDIT.file} ${expectation.auditId} (${expectation.control})`,
    });
    if (!matches) {
      issues.push(
        issue(
          "CURRICULUM_COUNT_MISMATCH",
          `count ${expectation.countKey} contradicts the published audit control ${expectation.auditId}`,
          {
            sourceFile: SEQUENCING_AUDIT.file,
            recordId: expectation.auditId,
            expected: expectation.expected,
            actual,
          },
        ),
      );
    }
  }

  // ---------------------------------------------------------------- release
  const releaseVersion = SEQUENCING_ALLOCATION.filenameVersion;
  const releaseId = `A1-CURRICULUM-v${releaseVersion}`;
  const contentHash = computeContentHash(data, manifests);

  const release: CurriculumRelease = {
    releaseId,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    level: LEVEL_CODE,
    curriculumVersions: curriculumVersions,
    sourceFiles: manifests,
    sourceHashes: Object.fromEntries(
      manifests.map((value) => [value.file, value.sha256]),
    ),
    generatedAt: now().toISOString(),
    contentHash,
    expectedCounts: ARCHITECTURE_EXPECTED_COUNTS,
    actualCounts,
    countChecks,
    validationResult: {
      status: issues.length === 0 ? "PASS" : "FAIL",
      issueCount: issues.length,
      issues,
      invariants: validation.invariants,
    },
  };

  if (issues.length > 0) {
    return { status: "IMPORT_FAIL", issues, release };
  }
  return { status: "IMPORT_OK", release, data, issues: [] };
}

/** Strict entrypoint: throws `CurriculumImportError` on IMPORT FAIL. */
export function importCurriculumOrThrow(options: ImportOptions = {}): {
  readonly release: CurriculumRelease;
  readonly data: CurriculumData;
} {
  const result = importCurriculum(options);
  if (result.status === "IMPORT_FAIL") {
    throw new CurriculumImportError(result.issues);
  }
  return { release: result.release, data: result.data };
}

function declaredVersion(
  source: CanonicalSource,
  file: ParsedCsv,
  issues: CurriculumIssue[],
): string | null {
  if (source.versionColumn === null) return null;
  const values = new Set(
    file.records.map((record) => record.values[source.versionColumn as string] ?? ""),
  );
  values.delete("");
  if (values.size === 0) return null;
  if (values.size > 1) {
    issues.push(
      issue(
        "CURRICULUM_RELEASE_MISMATCH",
        `file declares more than one curriculum version: ${[...values].sort().join(", ")}`,
        { sourceFile: source.file, field: source.versionColumn },
      ),
    );
    return null;
  }
  const declared = [...values][0];
  if (declared !== source.filenameVersion) {
    issues.push(
      issue(
        "CURRICULUM_RELEASE_MISMATCH",
        "curriculum version declared inside the file disagrees with the published filename",
        {
          sourceFile: source.file,
          field: source.versionColumn,
          expected: source.filenameVersion,
          actual: declared,
        },
      ),
    );
  }
  return declared;
}

function countCurriculum(
  data: CurriculumData,
  observed: Readonly<Record<string, number>>,
): Record<CountKey, number> {
  const storyById = new Map(data.storyBlueprints.map((value) => [value.id, value]));

  const focusByStory = new Map<string, number>();
  let capstoneFirstIntroductions = 0;
  for (const target of data.targets) {
    if (target.introSalience === "FOCUS") {
      focusByStory.set(
        target.firstIntroductionStoryId,
        (focusByStory.get(target.firstIntroductionStoryId) ?? 0) + 1,
      );
    }
    if (storyById.get(target.firstIntroductionStoryId)?.role === "CAPSTONE") {
      capstoneFirstIntroductions += 1;
    }
  }

  const deleTaskIds = new Set<string>();
  for (const story of data.storyBlueprints) {
    for (const taskId of story.deleTaskIds) deleTaskIds.add(taskId);
  }

  const stageCount = (stage: string): number =>
    data.recycleEdges.filter((value) => value.returnStage === stage).length;

  return {
    lexemes: data.lexemes.length,
    lexemeForms: data.lexemeForms.length,
    senseRegistry: data.senses.length,
    a1Senses: data.senses.filter((value) => value.isA1).length,
    a2BoundarySenses: data.senses.filter((value) => !value.isA1).length,
    mwuUnits: data.mwuUnits.length,
    grammarUnits: data.grammarUnits.length,
    modules: data.modules.length,
    islands: data.islands.length,
    storyBlueprints: data.storyBlueprints.length,
    firstIntroductions: data.targets.length,
    focusFirstIntroductions: data.targets.filter(
      (value) => value.introSalience === "FOCUS",
    ).length,
    supportedFirstIntroductions: data.targets.filter(
      (value) => value.introSalience === "SUPPORTED",
    ).length,
    maxFocusPerStory:
      focusByStory.size === 0 ? 0 : Math.max(...focusByStory.values()),
    islandCheckpoints: data.storyBlueprints.filter((v) => v.isIslandCheckpoint).length,
    moduleCheckpoints: data.storyBlueprints.filter((v) => v.isModuleCheckpoint).length,
    dedicatedFinalTransferStories: data.storyBlueprints.filter(
      (v) => v.isFinalTransferStory,
    ).length,
    capstoneFirstIntroductions,
    deleTaskStructures: deleTaskIds.size,
    recycleEdges: data.recycleEdges.length,
    firstReturnEdges: stageCount("FIRST_RETURN"),
    secondReturnEdges: stageCount("SECOND_RETURN"),
    thirdReturnEdges: stageCount("THIRD_RETURN"),
    orphanSenses: observed["orphanSenses"] ?? 0,
    orphanForms: observed["orphanForms"] ?? 0,
    a2BoundaryScheduledAsA1: observed["a2BoundaryScheduledAsA1"] ?? 0,
    backwardRecycleEdges: observed["backwardRecycleEdges"] ?? 0,
    routeOrderViolations: observed["routeOrderViolations"] ?? 0,
    duplicatePublishedIds: observed["duplicatePublishedIds"] ?? 0,
    regionalTargetsWithUniversalProductiveDemand:
      observed["regionalTargetsWithUniversalProductiveDemand"] ?? 0,
    recycleEdgesClaimingMastery: observed["recycleEdgesClaimingMastery"] ?? 0,
    versionStampedColumns: observed["versionStampedColumns"] ?? 0,
    regionalReceptiveTargets: observed["regionalReceptiveTargets"] ?? 0,
  };
}

/**
 * Hash of everything that must be reproducible.
 *
 * Covers the canonical data and the source hashes; excludes `generatedAt` and
 * anything else derived from the moment of execution.
 */
export function computeContentHash(
  data: CurriculumData,
  sources: readonly SourceFileManifest[],
): string {
  const payload = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    sources: sources.map((value) => ({ file: value.file, sha256: value.sha256 })),
    data,
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export type { CurriculumData, CurriculumRelease, SenseId };
