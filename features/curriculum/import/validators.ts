/**
 * Structural and cross-artefact invariants.
 *
 * Each invariant is named, evaluated against the canonical data and reported
 * with its observed value, so a release states not only that it passed but
 * what was actually measured. Every violation is an ERROR: there is no
 * "warning" tier that would let a broken release import successfully.
 */

import { issue, type CurriculumIssue } from "../domain/errors.ts";
import type {
  CurriculumData,
  CurriculumTarget,
  RecycleEdge,
} from "../domain/model.ts";

export type ValidationContext = {
  readonly normalizationFile: string;
  readonly sourceAssertionsFile: string;
  readonly architectureFile: string;
  readonly allocationFile: string;
  readonly storyFile: string;
  readonly recycleFile: string;
};

export type InvariantReport = {
  readonly name: string;
  readonly status: "PASS" | "FAIL";
  readonly observed: number | string;
};

export type ValidationOutcome = {
  readonly issues: readonly CurriculumIssue[];
  /** Named measurements the release manifest reports as actual counts. */
  readonly observed: Readonly<Record<string, number>>;
  readonly invariants: readonly InvariantReport[];
};

/** Productive-demand rule that keeps a regional target receptive-only. */
const RECEPTIVE_ONLY_DEMAND = "NO_UNIVERSAL_PRODUCTIVE_DEMAND";
const REGIONAL_SENSE_STATUS = "A1_REGIONAL_RECEPTIVE";

export function validateCurriculum(
  data: CurriculumData,
  context: ValidationContext,
): ValidationOutcome {
  const issues: CurriculumIssue[] = [];
  const observed: Record<string, number> = {};
  const invariants: InvariantReport[] = [];

  const record = (name: string, count: number, expectZero = true): void => {
    invariants.push({
      name,
      status: expectZero ? (count === 0 ? "PASS" : "FAIL") : "PASS",
      observed: count,
    });
  };

  // ------------------------------------------------------- duplicate id sets
  let duplicateIds = 0;
  const uniqueIn = <T>(
    label: string,
    file: string,
    rows: readonly T[],
    key: (value: T) => string,
  ): Map<string, T> => {
    const index = new Map<string, T>();
    for (const row of rows) {
      const id = key(row);
      if (index.has(id)) {
        duplicateIds += 1;
        issues.push(
          issue("CURRICULUM_DUPLICATE_ID", `duplicate published ${label} id`, {
            sourceFile: file,
            recordId: id,
          }),
        );
        continue;
      }
      index.set(id, row);
    }
    return index;
  };

  const lexemeById = uniqueIn("Lexeme", context.normalizationFile, data.lexemes, (v) => v.id);
  uniqueIn("LexemeForm", context.normalizationFile, data.lexemeForms, (v) => v.id);
  const senseById = uniqueIn("Sense", context.normalizationFile, data.senses, (v) => v.id);
  const mwuById = uniqueIn("MwuUnit", context.normalizationFile, data.mwuUnits, (v) => v.id);
  const grammarById = uniqueIn("GrammarUnit", context.allocationFile, data.grammarUnits, (v) => v.id);
  const assertionById = uniqueIn("SourceAssertion", context.sourceAssertionsFile, data.sourceAssertions, (v) => v.id);
  const moduleById = uniqueIn("Module", context.architectureFile, data.modules, (v) => v.id);
  const islandById = uniqueIn("Island", context.architectureFile, data.islands, (v) => v.id);
  const storyById = uniqueIn("StoryBlueprint", context.storyFile, data.storyBlueprints, (v) => v.id);
  const targetByAllocation = uniqueIn("allocation", context.allocationFile, data.targets, (v) => v.allocationId);
  uniqueIn("RecycleEdge", context.recycleFile, data.recycleEdges, (v) => v.id);
  observed["duplicatePublishedIds"] = duplicateIds;
  record("published id duplicates", duplicateIds);

  // --------------------------------------------------------- lexical linkage
  let orphanSenses = 0;
  for (const sense of data.senses) {
    if (!lexemeById.has(sense.lexemeId)) {
      orphanSenses += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "Sense has no valid Lexeme", {
          sourceFile: context.normalizationFile,
          recordId: sense.id,
          field: "lexeme_id",
          referencedId: sense.lexemeId,
        }),
      );
    }
  }
  observed["orphanSenses"] = orphanSenses;
  record("orphan senses", orphanSenses);

  let orphanForms = 0;
  for (const form of data.lexemeForms) {
    if (!lexemeById.has(form.lexemeId)) {
      orphanForms += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "LexemeForm has no valid Lexeme", {
          sourceFile: context.normalizationFile,
          recordId: form.id,
          field: "lexeme_id",
          referencedId: form.lexemeId,
        }),
      );
    }
  }
  observed["orphanForms"] = orphanForms;
  record("orphan forms", orphanForms);

  let orphanMwuLinks = 0;
  for (const mwu of data.mwuUnits) {
    if (mwu.lexemeId !== null && !lexemeById.has(mwu.lexemeId)) {
      orphanMwuLinks += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "MWU points at an unknown Lexeme", {
          sourceFile: context.normalizationFile,
          recordId: mwu.id,
          field: "lexeme_id",
          referencedId: mwu.lexemeId,
        }),
      );
    }
    if (mwu.senseId !== null && !senseById.has(mwu.senseId)) {
      orphanMwuLinks += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "MWU points at an unknown Sense", {
          sourceFile: context.normalizationFile,
          recordId: mwu.id,
          field: "sense_id",
          referencedId: mwu.senseId,
        }),
      );
    }
  }
  record("MWU identity links resolved", orphanMwuLinks);

  // ------------------------------------------------------- source assertions
  let orphanAssertions = 0;
  for (const assertion of data.sourceAssertions) {
    const resolved =
      assertion.targetType === "SENSE"
        ? senseById.has(assertion.targetId)
        : assertion.targetType === "MWU_SOURCE_UNIT"
          ? mwuById.has(assertion.targetId)
          : // Regional patterns are published provenance objects with no entry
            // in the identity registries; their ids are checked by pattern.
            /^\d{2}C-PAT-\d{4}$/.test(assertion.targetId);
    if (!resolved) {
      orphanAssertions += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "SourceAssertion is orphaned: its target does not exist", {
          sourceFile: context.sourceAssertionsFile,
          recordId: assertion.id,
          field: "target_id",
          referencedId: assertion.targetId,
        }),
      );
    }
    if (assertion.lexemeId !== null && !lexemeById.has(assertion.lexemeId)) {
      orphanAssertions += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "SourceAssertion points at an unknown Lexeme", {
          sourceFile: context.sourceAssertionsFile,
          recordId: assertion.id,
          field: "lexeme_id",
          referencedId: assertion.lexemeId,
        }),
      );
    }
    if (assertion.senseId !== null && !senseById.has(assertion.senseId)) {
      orphanAssertions += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "SourceAssertion points at an unknown Sense", {
          sourceFile: context.sourceAssertionsFile,
          recordId: assertion.id,
          field: "sense_id",
          referencedId: assertion.senseId,
        }),
      );
    }
  }
  observed["orphanSourceAssertions"] = orphanAssertions;
  record("orphan source assertions", orphanAssertions);

  // ------------------------------------------------------------- topology
  let topologyErrors = 0;
  for (const island of data.islands) {
    if (!moduleById.has(island.moduleId)) {
      topologyErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "Island references an unknown Module", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "module_id",
          referencedId: island.moduleId,
        }),
      );
    }
  }
  for (const story of data.storyBlueprints) {
    const island = islandById.get(story.islandId);
    if (island === undefined) {
      topologyErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "StoryBlueprint references an unknown Island", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "island_id",
          referencedId: story.islandId,
        }),
      );
      continue;
    }
    if (island.moduleId !== story.moduleId) {
      topologyErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "StoryBlueprint module disagrees with the module of its island", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "module_id",
          expected: island.moduleId,
          actual: story.moduleId,
        }),
      );
    }
  }
  record("topology reference errors", topologyErrors);

  // ------------------------------------------------------------- targets
  const allocationByTargetId = new Map<string, CurriculumTarget>();
  let duplicateFirstIntroductions = 0;
  let unknownTargets = 0;
  let a2Scheduled = 0;
  let statusMismatches = 0;
  let regionalTargets = 0;
  let regionalViolations = 0;
  let targetReferenceErrors = 0;
  let unresolvedAssertionRefs = 0;

  for (const target of data.targets) {
    const previous = allocationByTargetId.get(target.targetId);
    if (previous !== undefined) {
      duplicateFirstIntroductions += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "target has more than one first introduction", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          referencedId: target.targetId,
          expected: previous.allocationId,
        }),
      );
    } else {
      allocationByTargetId.set(target.targetId, target);
    }

    // The scheduled object must exist in its registry.
    const exists =
      target.targetType === "SENSE"
        ? senseById.has(target.targetId)
        : target.targetType === "MWU_SOURCE_UNIT"
          ? mwuById.has(target.targetId)
          : grammarById.has(target.targetId);
    if (!exists) {
      unknownTargets += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", `scheduled ${target.targetType} target does not exist`, {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          field: "target_id",
          referencedId: target.targetId,
        }),
      );
    }

    if (target.targetType === "SENSE") {
      const sense = senseById.get(target.targetId);
      if (sense !== undefined) {
        if (!sense.isA1) {
          a2Scheduled += 1;
          issues.push(
            issue("CURRICULUM_TARGET_INVALID", "A2 boundary sense is scheduled as an A1 first introduction", {
              sourceFile: context.allocationFile,
              recordId: target.allocationId,
              field: "target_id",
              referencedId: target.targetId,
            }),
          );
        }
        if (sense.status !== target.senseStatus) {
          statusMismatches += 1;
          issues.push(
            issue("CURRICULUM_TARGET_INVALID", "allocation status disagrees with the published sense status", {
              sourceFile: context.allocationFile,
              recordId: target.allocationId,
              field: "sense_status",
              referencedId: target.targetId,
              expected: sense.status,
              actual: target.senseStatus,
            }),
          );
        }
      }
    }

    // Regional receptive targets must not acquire universal productive demand.
    if (target.senseStatus === REGIONAL_SENSE_STATUS) {
      regionalTargets += 1;
      if (target.expectedProductive === "REQUIRED") {
        regionalViolations += 1;
        issues.push(
          issue("CURRICULUM_TARGET_INVALID", "regional receptive target is scheduled with universal productive demand", {
            sourceFile: context.allocationFile,
            recordId: target.allocationId,
            field: "expected_productive",
            actual: target.expectedProductive,
          }),
        );
      }
    }

    // Sequencing references.
    if (!moduleById.has(target.firstIntroductionModuleId)) {
      targetReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "allocation references an unknown Module", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          field: "module_id",
          referencedId: target.firstIntroductionModuleId,
        }),
      );
    }
    const island = islandById.get(target.firstIntroductionIslandId);
    if (island === undefined) {
      targetReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "allocation references an unknown Island", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          field: "first_introduction_island",
          referencedId: target.firstIntroductionIslandId,
        }),
      );
    } else if (island.moduleId !== target.firstIntroductionModuleId) {
      targetReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "allocation module disagrees with the module of its introduction island", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          expected: island.moduleId,
          actual: target.firstIntroductionModuleId,
        }),
      );
    }
    const introStory = storyById.get(target.firstIntroductionStoryId);
    if (introStory === undefined) {
      targetReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "first introduction points at a StoryBlueprint that does not exist", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          field: "first_introduction_story",
          referencedId: target.firstIntroductionStoryId,
        }),
      );
    } else if (introStory.islandId !== target.firstIntroductionIslandId) {
      targetReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "first introduction story does not belong to the declared introduction island", {
          sourceFile: context.allocationFile,
          recordId: target.allocationId,
          expected: target.firstIntroductionIslandId,
          actual: introStory.islandId,
        }),
      );
    }

    for (const assertionId of target.sourceAssertionIds) {
      if (!assertionById.has(assertionId)) {
        unresolvedAssertionRefs += 1;
        issues.push(
          issue("CURRICULUM_REFERENCE_NOT_FOUND", "allocation references a SourceAssertion that does not exist", {
            sourceFile: context.allocationFile,
            recordId: target.allocationId,
            field: "source_assertion_ids",
            referencedId: assertionId,
          }),
        );
      }
    }
  }

  observed["a2BoundaryScheduledAsA1"] = a2Scheduled;
  observed["regionalReceptiveTargets"] = regionalTargets;
  record("duplicate first introductions", duplicateFirstIntroductions);
  record("unknown scheduled targets", unknownTargets);
  record("A2 boundary scheduled as A1", a2Scheduled);
  record("allocation/sense status mismatches", statusMismatches);
  record("regional targets with universal productive demand", regionalViolations);
  record("allocation reference errors", targetReferenceErrors);
  record("unresolved source assertion references", unresolvedAssertionRefs);

  // -------------------------------------------------------------- edges
  let backwardEdges = 0;
  let edgeReferenceErrors = 0;
  let masteryClaims = 0;
  let regionalDemandViolations = 0;
  const edgesByAllocation = new Map<string, RecycleEdge[]>();

  for (const edge of data.recycleEdges) {
    const target = targetByAllocation.get(edge.allocationId);
    if (target === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge references an allocation that does not exist", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "allocation_id",
          referencedId: edge.allocationId,
        }),
      );
    } else if (target.targetId !== edge.targetId) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge target disagrees with the target of its allocation", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          expected: target.targetId,
          actual: edge.targetId,
        }),
      );
    }

    const from = storyById.get(edge.fromStoryId);
    const to = storyById.get(edge.toStoryId);
    if (from === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge starts at a StoryBlueprint that does not exist", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "from_story_id",
          referencedId: edge.fromStoryId,
        }),
      );
    }
    if (to === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge points at a StoryBlueprint that does not exist", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "to_story_id",
          referencedId: edge.toStoryId,
        }),
      );
    }
    if (from !== undefined && to !== undefined && to.sequenceIndex <= from.sequenceIndex) {
      backwardEdges += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge is backward or self-referential in the canonical story sequence", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          expected: `> ${from.sequenceIndex}`,
          actual: to.sequenceIndex,
        }),
      );
    }

    if (edge.masteryClaim !== "NONE") {
      masteryClaims += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge claims mastery; scheduling edges are exposure requirements, not mastery assertions", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "mastery_claim",
          actual: edge.masteryClaim,
        }),
      );
    }

    if (
      target !== undefined &&
      target.senseStatus === REGIONAL_SENSE_STATUS &&
      edge.productiveDemandRule !== RECEPTIVE_ONLY_DEMAND
    ) {
      regionalDemandViolations += 1;
      issues.push(
        issue("CURRICULUM_TARGET_INVALID", "recycle edge of a regional receptive target demands universal productive use", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "productive_demand_rule",
          expected: RECEPTIVE_ONLY_DEMAND,
          actual: edge.productiveDemandRule,
        }),
      );
    }

    const bucket = edgesByAllocation.get(edge.allocationId);
    if (bucket === undefined) edgesByAllocation.set(edge.allocationId, [edge]);
    else bucket.push(edge);
  }

  observed["backwardRecycleEdges"] = backwardEdges;
  observed["recycleEdgesClaimingMastery"] = masteryClaims;
  observed["regionalTargetsWithUniversalProductiveDemand"] = regionalDemandViolations;
  record("backward recycle edges", backwardEdges);
  record("recycle edge reference errors", edgeReferenceErrors);
  record("recycle edges claiming mastery", masteryClaims);
  record("regional edges with universal productive demand", regionalDemandViolations);

  // ------------------------------------------------------- recycling routes
  let routeOrderViolations = 0;
  for (const target of data.targets) {
    const edges = edgesByAllocation.get(target.allocationId) ?? [];
    const intro = storyById.get(target.firstIntroductionStoryId);
    if (intro === undefined) continue;
    let previous = intro.sequenceIndex;
    let ordered = true;
    for (const stage of ["LOCAL", "NEAR", "THIRD"] as const) {
      const edge = edges.find((value) => value.stage === stage);
      if (edge === undefined) {
        ordered = false;
        break;
      }
      const to = storyById.get(edge.toStoryId);
      if (to === undefined || to.sequenceIndex <= previous) {
        ordered = false;
        break;
      }
      previous = to.sequenceIndex;
    }
    if (!ordered) {
      routeOrderViolations += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "recycling route does not run introduction < local < near < third leg", {
          sourceFile: context.recycleFile,
          recordId: target.allocationId,
          referencedId: target.targetId,
        }),
      );
    }
  }
  record("recycling route order violations", routeOrderViolations);

  // ------------------------------------------------- declared vs actual load
  let storyLoadMismatches = 0;
  const introByStory = new Map<string, number>();
  const incomingByStory = new Map<string, number>();
  for (const target of data.targets) {
    introByStory.set(
      target.firstIntroductionStoryId,
      (introByStory.get(target.firstIntroductionStoryId) ?? 0) + 1,
    );
  }
  for (const edge of data.recycleEdges) {
    incomingByStory.set(edge.toStoryId, (incomingByStory.get(edge.toStoryId) ?? 0) + 1);
  }
  for (const story of data.storyBlueprints) {
    const introductions = introByStory.get(story.id) ?? 0;
    if (introductions !== story.declaredNewTargetCount) {
      storyLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "story introduces a different number of new targets than it declares", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "new_target_count",
          expected: story.declaredNewTargetCount,
          actual: introductions,
        }),
      );
    }
    const relations = introductions + (incomingByStory.get(story.id) ?? 0);
    if (relations !== story.declaredScheduledRelationCount) {
      storyLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "story carries a different number of scheduled relations than it declares", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "scheduled_relation_count",
          expected: story.declaredScheduledRelationCount,
          actual: relations,
        }),
      );
    }
    if (story.isFinalTransferStory && introductions > 0) {
      storyLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "final transfer story introduces new targets", {
          sourceFile: context.storyFile,
          recordId: story.id,
          actual: introductions,
        }),
      );
    }
  }
  record("story load mismatches", storyLoadMismatches);

  let islandLoadMismatches = 0;
  for (const island of data.islands) {
    const stories = island.storyIds.length;
    if (stories !== island.declaredStoryBlueprintCount) {
      islandLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "island holds a different number of story blueprints than it declares", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "v1_44_story_blueprint_count",
          expected: island.declaredStoryBlueprintCount,
          actual: stories,
        }),
      );
    }
  }
  record("island load mismatches", islandLoadMismatches);

  /*
   * The architecture file also carries `v1_42_total_first_intro_objects` per
   * island and per module. That column is NOT a v1.44 expectation: phases 16C
   * (capstone integration correction) and 16D (load balancing) redistributed
   * introductions between islands after v1.42 was written, so nine islands and
   * four modules now differ from it. The clearest case is the capstone island
   * A1-M08-I04, which the v1.42 column credits with 20 introductions while all
   * three of its v1.44 story blueprints declare `new_target_count = 0` and the
   * published audit control SEQ16D-011 records "Capstone first introductions:
   * expected 0, observed 0, PASS".
   *
   * What survived the redistribution is the total. Checking that — rather than
   * a superseded distribution — catches a corrupted planning column without
   * asserting a stale layout as truth.
   */
  const plannedTotal = data.islands.reduce(
    (total, island) => total + island.plannedFirstIntroObjectsV142,
    0,
  );
  if (plannedTotal !== data.targets.length) {
    issues.push(
      issue("CURRICULUM_COUNT_MISMATCH", "v1.42 planning budget no longer totals the published allocation ledger", {
        sourceFile: context.architectureFile,
        field: "v1_42_total_first_intro_objects",
        expected: data.targets.length,
        actual: plannedTotal,
      }),
    );
  }
  invariants.push({
    name: "v1.42 planning total reconciles with the v1.44 ledger",
    status: plannedTotal === data.targets.length ? "PASS" : "FAIL",
    observed: plannedTotal,
  });

  return { issues, observed, invariants };
}
