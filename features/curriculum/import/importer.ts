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
  LEVEL_CODE,
  LEXEME_TYPES,
  RECYCLE_EDGE_TYPES,
  RECYCLE_STAGE_BY_EDGE_TYPE,
  RECYCLE_STAGES,
  SENSE_STATUSES,
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
  SOURCE_ASSERTIONS,
  STORY_BLUEPRINTS,
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

const ARCH_RECORD_TYPES = [
  "MODULE",
  "ISLAND",
  "SEQUENCING_RULE",
  "RECYCLING_RULE",
] as const;

const SA_RECORD_TYPES = ["SOURCE_ASSERTION", "ASSERTION_ENVELOPE"] as const;

const SA_TARGET_TYPES = [
  "SENSE",
  "MWU_SOURCE_UNIT",
  "REGIONAL_PATTERN",
] as const;

/** Marks a published assertion as final rather than superseded staging. */
const PUBLISHED_ASSERTION_STATUS = "PUBLISHED_V1.40";

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
  const archFile = get("sequencingArchitecture");
  const moduleRows: {
    id: ModuleId;
    order: number;
    name: string;
    communicativeGoal: string;
    specificDomainFocus: string;
    designRole: string;
    hardPrerequisite: string;
    recyclingPolicy: string;
    moduleGate: string;
    storyMin: number;
    storyPlanningTarget: number;
    storyMax: number;
    plannedFirstIntroObjectsV142: number;
    declaredStoryBlueprintCount: number;
  }[] = [];
  const islands: Island[] = [];

  for (const record of archFile.records) {
    const read = new RowReader(archFile.file, record, issues);
    const recordType = read.enum("record_type", ARCH_RECORD_TYPES);
    if (recordType === "MODULE") {
      const id = read.id("ModuleId", "module_id");
      read.identify(id);
      moduleRows.push({
        id,
        order: read.integer("module_order"),
        name: read.required("module_name"),
        communicativeGoal: read.required("communicative_goal"),
        specificDomainFocus: read.required("specific_domain_focus"),
        designRole: read.required("design_role"),
        hardPrerequisite: read.required("hard_prerequisite"),
        recyclingPolicy: read.required("recycling_policy"),
        moduleGate: read.required("module_gate"),
        storyMin: read.integer("story_min"),
        storyPlanningTarget: read.integer("story_planning_target"),
        storyMax: read.integer("story_max"),
        plannedFirstIntroObjectsV142: read.integer("v1_42_total_first_intro_objects"),
        declaredStoryBlueprintCount: read.integer("v1_44_story_blueprint_count"),
      });
      continue;
    }
    if (recordType !== "ISLAND") continue;
    const id = read.id("IslandId", "island_id");
    read.identify(id);
    islands.push({
      id,
      moduleId: read.id("ModuleId", "module_id"),
      islandOrder: read.integer("island_order"),
      globalIslandOrder: read.integer("global_island_order"),
      name: read.required("island_name"),
      communicativeGoal: read.required("communicative_goal"),
      specificDomainFocus: read.required("specific_domain_focus"),
      designRole: read.required("design_role"),
      grammarFocus: read.required("grammar_focus"),
      genreFocus: read.required("genre_focus"),
      inputModes: read.required("input_modes"),
      hardPrerequisite: read.required("hard_prerequisite"),
      recyclingPolicy: read.required("recycling_policy"),
      senseIntroBudget: read.integer("sense_intro_budget"),
      grammarIntroBudget: read.integer("grammar_intro_budget"),
      mwuIntroBudget: read.integer("mwu_intro_budget"),
      regionalReceptiveIntroBudget: read.integer("regional_receptive_intro_budget"),
      plannedFirstIntroObjectsV142: read.integer("v1_42_total_first_intro_objects"),
      declaredStoryBlueprintCount: read.integer("v1_44_story_blueprint_count"),
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
      role: read.required("story_role"),
      scenarioBrief: read.required("scenario_brief"),
      communicativeGoal: read.required("communicative_goal"),
      genreFocus: read.required("genre_focus"),
      plannedInputMode: read.required("planned_input_mode"),
      taskDemand: read.required("task_demand"),
      isFinalTransferStory: read.yesNo("is_final_transfer_story"),
      declaredNewTargetCount: read.integer("new_target_count"),
      declaredScheduledRelationCount: read.integer("scheduled_relation_count"),
      status: read.required("status"),
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
    for (const ref of (read.raw("source_assertion_ids") || "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value !== "")) {
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
      routeClass: read.required("recycle_route_class"),
      allocationAuthority: read.required("allocation_authority"),
      allocationBasis: read.required("allocation_basis"),
      allocationReason: read.required("allocation_reason"),
      sourceAssertionIds: assertionRefs,
      sourceCatalogueRefs: catalogueRefs,
      firstIntroductionModuleId: read.id("ModuleId", "module_id"),
      firstIntroductionIslandId: read.id("IslandId", "first_introduction_island"),
      firstIntroductionStoryId: read.id("StoryBlueprintId", "first_introduction_story"),
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
    const edgeType = read.enum("edge_type", RECYCLE_EDGE_TYPES);
    recycleEdges.push({
      id,
      allocationId: read.id("AllocationId", "allocation_id"),
      targetType: read.enum("target_type", TARGET_TYPES),
      targetId: read.required("target_id"),
      item: read.required("item"),
      lexemeId: read.optionalId("LexemeId", "lexeme_id"),
      senseId: read.optionalId("SenseId", "sense_id"),
      edgeType,
      stage: RECYCLE_STAGE_BY_EDGE_TYPE[edgeType] ?? "THIRD",
      fromStoryId: read.id("StoryBlueprintId", "from_story_id"),
      toStoryId: read.id("StoryBlueprintId", "to_story_id"),
      fromIslandId: read.id("IslandId", "from_island_id"),
      toIslandId: read.id("IslandId", "to_island_id"),
      routeClass: read.required("route_class"),
      requiredEvidenceClass: read.required("required_evidence_class"),
      productiveDemandRule: read.required("productive_demand_rule"),
      regionalPolicy: read.optional("regional_policy"),
      masteryClaim: read.required("mastery_claim"),
      curriculumVersion: read.required("curriculum_version"),
      status: read.required("status"),
    });
  }
  recycleEdges.sort(compareBy((value) => value.id));

  // ------------------------------------------------------------- cross-links
  const stageRank = new Map(RECYCLE_STAGES.map((stage, index) => [stage, index]));
  const edgesByAllocation = new Map<string, RecycleEdge[]>();
  for (const edge of recycleEdges) {
    const bucket = edgesByAllocation.get(edge.allocationId);
    if (bucket === undefined) edgesByAllocation.set(edge.allocationId, [edge]);
    else bucket.push(edge);
  }
  for (const bucket of edgesByAllocation.values()) {
    bucket.sort(
      compareBy(
        (edge) => `${stageRank.get(edge.stage) ?? 9}#${edge.id}`,
      ),
    );
  }

  const targets: CurriculumTarget[] = allocations.map((draft) => ({
    ...draft,
    recycleEdgeIds: (edgesByAllocation.get(draft.allocationId) ?? []).map(
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
  const modules: CurriculumModule[] = moduleRows
    .slice()
    .sort(compareBy((value) => padOrder(value.order)))
    .map((value) => ({ ...value, islandIds: islandIdsByModule.get(value.id) ?? [] }));

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
  const actualCounts = countCurriculum(data, validation.observed);
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
    recycleEdges: data.recycleEdges.length,
    orphanSenses: observed["orphanSenses"] ?? 0,
    orphanForms: observed["orphanForms"] ?? 0,
    a2BoundaryScheduledAsA1: observed["a2BoundaryScheduledAsA1"] ?? 0,
    backwardRecycleEdges: observed["backwardRecycleEdges"] ?? 0,
    duplicatePublishedIds: observed["duplicatePublishedIds"] ?? 0,
    regionalReceptiveTargets: observed["regionalReceptiveTargets"] ?? 0,
    regionalTargetsWithUniversalProductiveDemand:
      observed["regionalTargetsWithUniversalProductiveDemand"] ?? 0,
    recycleEdgesClaimingMastery: observed["recycleEdgesClaimingMastery"] ?? 0,
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
