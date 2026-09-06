/**
 * Structural and cross-artefact invariants.
 *
 * Each invariant is named, evaluated against the canonical data and reported
 * with its observed value, so a release states not only that it passed but
 * what was actually measured. Every violation is an ERROR: there is no
 * "warning" tier that would let a broken release import successfully.
 */

import { issue, type CurriculumIssue } from "../domain/errors.ts";
import { MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY } from "./expectations.ts";
import {
  RETURN_STAGES,
  type CurriculumData,
  type CurriculumTarget,
  type RecycleEdge,
  type ReturnStage,
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

const REGIONAL_SENSE_STATUS = "A1_REGIONAL_RECEPTIVE";
/** Productive expectation a regional receptive target must never carry. */
const UNIVERSAL_PRODUCTIVE_DEMAND = "REQUIRED";

/** Report a flag the way the sources publish it, so both sides read alike. */
function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

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
  uniqueIn("allocation", context.allocationFile, data.targets, (v) => v.allocationId);
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

  /*
   * Island ordering.
   *
   * `global_island_order` is the single linear reading order of the level and
   * must be exactly 1..N with no gap or repeat; `island_order` restarts at 1
   * inside each module. A gap here would silently reorder the curriculum.
   */
  let orderingErrors = 0;
  const globalOrders = data.islands.map((value) => value.globalIslandOrder);
  const sortedGlobal = [...globalOrders].sort((a, b) => a - b);
  sortedGlobal.forEach((value, index) => {
    if (value !== index + 1) {
      orderingErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "global island order is not a gapless 1..N sequence", {
          sourceFile: context.architectureFile,
          field: "global_island_order",
          expected: index + 1,
          actual: value,
        }),
      );
    }
  });
  const islandOrdersByModule = new Map<string, number[]>();
  for (const island of data.islands) {
    const bucket = islandOrdersByModule.get(island.moduleId);
    if (bucket === undefined) islandOrdersByModule.set(island.moduleId, [island.islandOrder]);
    else bucket.push(island.islandOrder);
  }
  for (const [moduleId, orders] of islandOrdersByModule) {
    [...orders].sort((a, b) => a - b).forEach((value, index) => {
      if (value !== index + 1) {
        orderingErrors += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "island order inside a module is not a gapless 1..N sequence", {
            sourceFile: context.architectureFile,
            recordId: moduleId,
            field: "island_order",
            expected: index + 1,
            actual: value,
          }),
        );
      }
    });
  }
  record("island ordering errors", orderingErrors);

  /*
   * Prerequisite chain: every island but the first names an earlier island.
   * A prerequisite pointing forward would make the sequence unreachable.
   */
  let prerequisiteErrors = 0;
  for (const island of data.islands) {
    if (island.hardPrerequisiteIslandId === null) {
      if (island.globalIslandOrder !== 1) {
        prerequisiteErrors += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "island declares no prerequisite but does not open the level", {
            sourceFile: context.architectureFile,
            recordId: island.id,
            field: "hard_prerequisite",
            actual: island.globalIslandOrder,
          }),
        );
      }
      continue;
    }
    const previous = islandById.get(island.hardPrerequisiteIslandId);
    if (previous === undefined) {
      prerequisiteErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "island prerequisite points at an Island that does not exist", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "hard_prerequisite",
          referencedId: island.hardPrerequisiteIslandId,
        }),
      );
    } else if (previous.globalIslandOrder >= island.globalIslandOrder) {
      prerequisiteErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "island prerequisite does not precede it in the level sequence", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "hard_prerequisite",
          expected: `< ${island.globalIslandOrder}`,
          actual: previous.globalIslandOrder,
        }),
      );
    }
  }
  record("island prerequisite errors", prerequisiteErrors);

  /*
   * Checkpoints.
   *
   * The architecture names the story that closes each island and each module;
   * the blueprint ledger flags the same stories. Both statements are checked,
   * in both directions: a checkpoint outside its own island or module is a
   * broken sequence, and a flag that disagrees with the architecture means one
   * of the two files was edited alone.
   */
  let checkpointErrors = 0;
  const islandCheckpointOf = new Map<string, string>();
  const moduleCheckpointOf = new Map<string, string>();
  for (const island of data.islands) {
    islandCheckpointOf.set(island.id, island.checkpointStoryId);
    const checkpoint = storyById.get(island.checkpointStoryId);
    if (checkpoint === undefined) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "island checkpoint points at a StoryBlueprint that does not exist", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "island_checkpoint_story_id",
          referencedId: island.checkpointStoryId,
        }),
      );
    } else if (checkpoint.islandId !== island.id) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "island checkpoint story belongs to a different island", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "island_checkpoint_story_id",
          expected: island.id,
          actual: checkpoint.islandId,
        }),
      );
    }
  }
  for (const curriculumModule of data.modules) {
    if (curriculumModule.checkpointStoryId === null) continue;
    moduleCheckpointOf.set(curriculumModule.id, curriculumModule.checkpointStoryId);
    const checkpoint = storyById.get(curriculumModule.checkpointStoryId);
    if (checkpoint === undefined) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "module checkpoint points at a StoryBlueprint that does not exist", {
          sourceFile: context.architectureFile,
          recordId: curriculumModule.id,
          field: "module_checkpoint_story_id",
          referencedId: curriculumModule.checkpointStoryId,
        }),
      );
    } else if (checkpoint.moduleId !== curriculumModule.id) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "module checkpoint story belongs to a different module", {
          sourceFile: context.architectureFile,
          recordId: curriculumModule.id,
          field: "module_checkpoint_story_id",
          expected: curriculumModule.id,
          actual: checkpoint.moduleId,
        }),
      );
    }
  }
  for (const story of data.storyBlueprints) {
    const isIslandCheckpoint = islandCheckpointOf.get(story.islandId) === story.id;
    if (isIslandCheckpoint !== story.isIslandCheckpoint) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "story island-checkpoint flag disagrees with the architecture", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "is_island_checkpoint",
          expected: yesNo(isIslandCheckpoint),
          actual: yesNo(story.isIslandCheckpoint),
        }),
      );
    }
    const isModuleCheckpoint = moduleCheckpointOf.get(story.moduleId) === story.id;
    if (isModuleCheckpoint !== story.isModuleCheckpoint) {
      checkpointErrors += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", "story module-checkpoint flag disagrees with the architecture", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "is_module_checkpoint",
          expected: yesNo(isModuleCheckpoint),
          actual: yesNo(story.isModuleCheckpoint),
        }),
      );
    }
  }
  record("checkpoint errors", checkpointErrors);

  // ------------------------------------------------------------- targets
  const targetById = new Map<string, CurriculumTarget>();
  let duplicateFirstIntroductions = 0;
  let unknownTargets = 0;
  let a2Scheduled = 0;
  let statusMismatches = 0;
  let regionalTargets = 0;
  let regionalViolations = 0;
  let targetReferenceErrors = 0;
  let unresolvedAssertionRefs = 0;
  let salienceErrors = 0;

  for (const target of data.targets) {
    const previous = targetById.get(target.targetId);
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
      targetById.set(target.targetId, target);
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
      if (target.expectedProductive === UNIVERSAL_PRODUCTIVE_DEMAND) {
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
          field: "island_id",
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
          field: "story_id",
          referencedId: target.firstIntroductionStoryId,
        }),
      );
    } else {
      if (introStory.islandId !== target.firstIntroductionIslandId) {
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
      // A capstone consolidates what the level already introduced; it must not
      // be the place a target is met for the first time.
      if (introStory.role === "CAPSTONE") {
        salienceErrors += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "capstone story carries a first introduction", {
            sourceFile: context.allocationFile,
            recordId: target.allocationId,
            referencedId: introStory.id,
          }),
        );
      }
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
  record("capstone first introductions", salienceErrors);

  // -------------------------------------------------------------- edges
  let backwardEdges = 0;
  let edgeReferenceErrors = 0;
  let masteryClaims = 0;
  let regionalDemandViolations = 0;
  let modePolicyDrift = 0;
  let scopeMismatches = 0;
  const edgesByTarget = new Map<string, RecycleEdge[]>();

  for (const edge of data.recycleEdges) {
    const target = targetById.get(edge.targetId);
    if (target === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge references a target that is never introduced", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "target_id",
          referencedId: edge.targetId,
        }),
      );
    } else {
      if (target.firstIntroductionStoryId !== edge.introductionStoryId) {
        edgeReferenceErrors += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge names an introduction story that is not where its target is introduced", {
            sourceFile: context.recycleFile,
            recordId: edge.id,
            field: "introduction_story",
            expected: target.firstIntroductionStoryId,
            actual: edge.introductionStoryId,
          }),
        );
      }
      if (target.targetType !== edge.targetType) {
        edgeReferenceErrors += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge target type disagrees with the allocation of its target", {
            sourceFile: context.recycleFile,
            recordId: edge.id,
            field: "target_type",
            expected: target.targetType,
            actual: edge.targetType,
          }),
        );
      }
      // Every edge declares PRESERVE_TARGET_MODE_POLICY; a return that raised
      // or lowered the productive expectation would contradict that claim.
      if (target.expectedProductive !== edge.expectedProductive) {
        modePolicyDrift += 1;
        issues.push(
          issue("CURRICULUM_TARGET_INVALID", "recycle edge changes the productive expectation of its target", {
            sourceFile: context.recycleFile,
            recordId: edge.id,
            field: "expected_productive",
            expected: target.expectedProductive,
            actual: edge.expectedProductive,
          }),
        );
      }
      if (
        target.senseStatus === REGIONAL_SENSE_STATUS &&
        edge.expectedProductive === UNIVERSAL_PRODUCTIVE_DEMAND
      ) {
        regionalDemandViolations += 1;
        issues.push(
          issue("CURRICULUM_TARGET_INVALID", "recycle edge of a regional receptive target demands universal productive use", {
            sourceFile: context.recycleFile,
            recordId: edge.id,
            field: "expected_productive",
            actual: edge.expectedProductive,
          }),
        );
      }
    }

    const from = storyById.get(edge.introductionStoryId);
    const to = storyById.get(edge.returnStoryId);
    if (from === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge starts at a StoryBlueprint that does not exist", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "introduction_story",
          referencedId: edge.introductionStoryId,
        }),
      );
    }
    if (to === undefined) {
      edgeReferenceErrors += 1;
      issues.push(
        issue("CURRICULUM_REFERENCE_NOT_FOUND", "recycle edge points at a StoryBlueprint that does not exist", {
          sourceFile: context.recycleFile,
          recordId: edge.id,
          field: "return_story",
          referencedId: edge.returnStoryId,
        }),
      );
    }
    if (from !== undefined && to !== undefined) {
      if (to.sequenceIndex <= from.sequenceIndex) {
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
      // `relation_scope` is a claim about how far the return travels; it is
      // recomputed from the topology rather than trusted.
      const scope =
        from.islandId === to.islandId
          ? "SAME_ISLAND"
          : from.moduleId === to.moduleId
            ? "SAME_MODULE_CROSS_ISLAND"
            : "CROSS_MODULE";
      if (scope !== edge.relationScope) {
        scopeMismatches += 1;
        issues.push(
          issue("CURRICULUM_SEQUENCE_INVALID", "recycle edge relation scope disagrees with the topology it spans", {
            sourceFile: context.recycleFile,
            recordId: edge.id,
            field: "relation_scope",
            expected: scope,
            actual: edge.relationScope,
          }),
        );
      }
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

    const bucket = edgesByTarget.get(edge.targetId);
    if (bucket === undefined) edgesByTarget.set(edge.targetId, [edge]);
    else bucket.push(edge);
  }

  observed["backwardRecycleEdges"] = backwardEdges;
  observed["recycleEdgesClaimingMastery"] = masteryClaims;
  observed["regionalTargetsWithUniversalProductiveDemand"] = regionalDemandViolations;
  record("backward recycle edges", backwardEdges);
  record("recycle edge reference errors", edgeReferenceErrors);
  record("recycle edges claiming mastery", masteryClaims);
  record("regional edges with universal productive demand", regionalDemandViolations);
  record("recycle edges altering target mode policy", modePolicyDrift);
  record("recycle edge relation-scope mismatches", scopeMismatches);

  /*
   * Return routes.
   *
   * A target has one to three returns. The stages present must be a prefix of
   * FIRST -> SECOND -> THIRD (a SECOND with no FIRST is a hole in the route),
   * each stage may appear once, destinations must be distinct, and each return
   * must land strictly later than the previous one. Requiring all three would
   * contradict the published horizon: 950 targets return twice and 932 three
   * times, not 985.
   */
  let routeOrderViolations = 0;
  const stageRank = new Map<ReturnStage, number>(
    RETURN_STAGES.map((stage, index) => [stage, index]),
  );
  for (const target of data.targets) {
    const edges = edgesByTarget.get(target.targetId) ?? [];
    if (edges.length === 0) continue;
    const intro = storyById.get(target.firstIntroductionStoryId);
    if (intro === undefined) continue;

    const problems: string[] = [];
    const seenStages = new Set<ReturnStage>();
    for (const edge of edges) {
      if (seenStages.has(edge.returnStage)) {
        problems.push(`stage ${edge.returnStage} appears more than once`);
      }
      seenStages.add(edge.returnStage);
    }
    for (let i = 1; i < RETURN_STAGES.length; i += 1) {
      if (seenStages.has(RETURN_STAGES[i]) && !seenStages.has(RETURN_STAGES[i - 1])) {
        problems.push(`${RETURN_STAGES[i]} exists without ${RETURN_STAGES[i - 1]}`);
      }
    }
    const destinations = edges.map((edge) => edge.returnStoryId);
    if (new Set(destinations).size !== destinations.length) {
      problems.push("the same story is scheduled twice on one route");
    }
    const ordered = [...edges].sort(
      (a, b) => (stageRank.get(a.returnStage) ?? 9) - (stageRank.get(b.returnStage) ?? 9),
    );
    let previous = intro.sequenceIndex;
    for (const edge of ordered) {
      const to = storyById.get(edge.returnStoryId);
      if (to === undefined) break;
      if (to.sequenceIndex <= previous) {
        problems.push(`${edge.returnStage} does not land after the previous leg`);
        break;
      }
      previous = to.sequenceIndex;
    }

    if (problems.length > 0) {
      routeOrderViolations += 1;
      issues.push(
        issue("CURRICULUM_SEQUENCE_INVALID", `return route is invalid: ${problems.join("; ")}`, {
          sourceFile: context.recycleFile,
          recordId: target.allocationId,
          referencedId: target.targetId,
        }),
      );
    }
  }
  observed["routeOrderViolations"] = routeOrderViolations;
  record("return route violations", routeOrderViolations);

  // ------------------------------------------------- declared vs actual load
  let storyLoadMismatches = 0;
  let focusGuardrailBreaches = 0;

  const introByStory = new Map<string, number>();
  const focusByStory = new Map<string, number>();
  const supportedByStory = new Map<string, number>();
  const regionalReturnsByStory = new Map<string, number>();
  const returnsByStoryStage = new Map<string, number>();
  const incomingByStory = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const target of data.targets) {
    bump(introByStory, target.firstIntroductionStoryId);
    bump(
      target.introSalience === "FOCUS" ? focusByStory : supportedByStory,
      target.firstIntroductionStoryId,
    );
  }
  for (const edge of data.recycleEdges) {
    bump(incomingByStory, edge.returnStoryId);
    bump(returnsByStoryStage, `${edge.returnStoryId}#${edge.returnStage}`);
    if (targetById.get(edge.targetId)?.senseStatus === REGIONAL_SENSE_STATUS) {
      bump(regionalReturnsByStory, edge.returnStoryId);
    }
  }

  const mismatch = (
    storyId: string,
    field: string,
    expected: number,
    actual: number,
    message: string,
  ): void => {
    if (expected === actual) return;
    storyLoadMismatches += 1;
    issues.push(
      issue("CURRICULUM_COUNT_MISMATCH", message, {
        sourceFile: context.storyFile,
        recordId: storyId,
        field,
        expected,
        actual,
      }),
    );
  };

  for (const story of data.storyBlueprints) {
    const introductions = introByStory.get(story.id) ?? 0;
    const focus = focusByStory.get(story.id) ?? 0;
    const supported = supportedByStory.get(story.id) ?? 0;

    mismatch(
      story.id,
      "first_intro_target_count",
      story.declaredFirstIntroTargetCount,
      introductions,
      "story introduces a different number of new targets than it declares",
    );
    mismatch(
      story.id,
      "focus_first_intro_count",
      story.declaredFocusFirstIntroCount,
      focus,
      "story carries a different number of FOCUS first introductions than it declares",
    );
    mismatch(
      story.id,
      "supported_first_intro_count",
      story.declaredSupportedFirstIntroCount,
      supported,
      "story carries a different number of SUPPORTED first introductions than it declares",
    );
    mismatch(
      story.id,
      "first_intro_target_count",
      story.declaredFirstIntroTargetCount,
      story.declaredFocusFirstIntroCount + story.declaredSupportedFirstIntroCount,
      "declared FOCUS and SUPPORTED counts do not add up to the declared first-introduction total",
    );

    for (const [field, stage] of [
      ["first_return_in_count", "FIRST_RETURN"],
      ["second_return_in_count", "SECOND_RETURN"],
      ["third_return_in_count", "THIRD_RETURN"],
    ] as const) {
      const declared =
        stage === "FIRST_RETURN"
          ? story.declaredFirstReturnInCount
          : stage === "SECOND_RETURN"
            ? story.declaredSecondReturnInCount
            : story.declaredThirdReturnInCount;
      mismatch(
        story.id,
        field,
        declared,
        returnsByStoryStage.get(`${story.id}#${stage}`) ?? 0,
        `story receives a different number of ${stage} returns than it declares`,
      );
    }

    mismatch(
      story.id,
      "regional_receptive_return_in_count",
      story.declaredRegionalReceptiveReturnInCount,
      regionalReturnsByStory.get(story.id) ?? 0,
      "story receives a different number of regional receptive returns than it declares",
    );

    mismatch(
      story.id,
      "scheduled_relation_count",
      story.declaredScheduledRelationCount,
      introductions + (incomingByStory.get(story.id) ?? 0),
      "story carries a different number of scheduled relations than it declares",
    );

    if (focus > MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY) {
      focusGuardrailBreaches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "story exceeds the published FOCUS guardrail", {
          sourceFile: context.storyFile,
          recordId: story.id,
          field: "focus_first_intro_count",
          expected: `<= ${MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY}`,
          actual: focus,
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
  record("FOCUS guardrail breaches", focusGuardrailBreaches);

  let islandLoadMismatches = 0;
  for (const island of data.islands) {
    const stories = island.storyIds.length;
    if (stories !== island.declaredStoryCount) {
      islandLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "island holds a different number of story blueprints than it declares", {
          sourceFile: context.architectureFile,
          recordId: island.id,
          field: "story_count",
          expected: island.declaredStoryCount,
          actual: stories,
        }),
      );
    }
  }
  for (const curriculumModule of data.modules) {
    const stories = curriculumModule.islandIds.reduce(
      (total, islandId) => total + (islandById.get(islandId)?.storyIds.length ?? 0),
      0,
    );
    if (stories !== curriculumModule.declaredStoryCount) {
      islandLoadMismatches += 1;
      issues.push(
        issue("CURRICULUM_COUNT_MISMATCH", "module holds a different number of story blueprints than its islands declare", {
          sourceFile: context.architectureFile,
          recordId: curriculumModule.id,
          field: "story_count",
          expected: curriculumModule.declaredStoryCount,
          actual: stories,
        }),
      );
    }
  }
  record("island and module load mismatches", islandLoadMismatches);

  return { issues, observed, invariants };
}
