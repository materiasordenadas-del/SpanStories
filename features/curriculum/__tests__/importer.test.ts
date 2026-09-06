/**
 * Happy path: the published A1 release imports, validates and counts out.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import {
  ARCHITECTURE_EXPECTED_COUNTS,
  MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY,
} from "../import/expectations.ts";
import { importCurriculum, importCurriculumOrThrow } from "../import/importer.ts";
import { REGISTRY_SCHEMA_VERSION } from "../domain/release.ts";
import { CANONICAL_SOURCES } from "../import/sources.ts";
import type { CurriculumData } from "../domain/model.ts";
import type { CurriculumRelease } from "../domain/release.ts";

describe("curriculum importer / A1 release", () => {
  let release: CurriculumRelease;
  let data: CurriculumData;

  before(() => {
    const imported = importCurriculumOrThrow();
    release = imported.release;
    data = imported.data;
  });

  test("imports the complete release without issues", () => {
    const result = importCurriculum();
    assert.equal(result.status, "IMPORT_OK");
    assert.deepEqual(result.issues, []);
  });

  test("every architecture count matches the published data", () => {
    for (const [key, expected] of Object.entries(ARCHITECTURE_EXPECTED_COUNTS)) {
      assert.equal(
        release.actualCounts[key],
        expected,
        `count ${key}: expected ${expected}, imported ${release.actualCounts[key]}`,
      );
    }
  });

  test("counts also match the audit ledger the curriculum publishes", () => {
    const published = release.countChecks.filter((check) =>
      check.expectationSource.includes("sequencing_final_audit"),
    );
    assert.ok(published.length >= 10, "expected the published audit to be read");
    for (const check of published) {
      assert.ok(check.matches, `${check.expectationSource}: ${check.expected} != ${check.actual}`);
    }
    // The H-* controls replaced the v1.44 SEQ16D-* ones.
    assert.ok(
      published.every((check) => /\sH-\d{3}\s/.test(check.expectationSource)),
      "audit controls must be the published H-* series",
    );
  });

  test("has no orphan references anywhere", () => {
    assert.equal(release.actualCounts["orphanSenses"], 0);
    assert.equal(release.actualCounts["orphanForms"], 0);
    assert.equal(release.actualCounts["duplicatePublishedIds"], 0);
    for (const invariant of release.validationResult.invariants) {
      assert.equal(invariant.status, "PASS", `invariant failed: ${invariant.name}`);
    }
  });

  test("resolves a real LEX-A1-* lexeme", () => {
    const lexeme = data.lexemes.find((value) => value.id === "LEX-A1-000001");
    assert.ok(lexeme, "LEX-A1-000001 must exist");
    assert.equal(lexeme.lemma, "a");
    assert.equal(lexeme.type, "ATOMIC");
    assert.equal(lexeme.release, "A1-LEXICON-v1.37");
  });

  test("resolves a real FORM-A1-* form and its lexeme", () => {
    const form = data.lexemeForms.find((value) => value.id === "FORM-A1-000001");
    assert.ok(form, "FORM-A1-000001 must exist");
    assert.equal(form.surface, "a");
    const lexeme = data.lexemes.find((value) => value.id === form.lexemeId);
    assert.ok(lexeme, "every form resolves to a lexeme");
  });

  test("resolves a real SENSE-A1-* sense and its lexeme", () => {
    const sense = data.senses.find((value) => value.id === "SENSE-A1-000001");
    assert.ok(sense, "SENSE-A1-000001 must exist");
    assert.equal(sense.isA1, true);
    const lexeme = data.lexemes.find((value) => value.id === sense.lexemeId);
    assert.ok(lexeme, "every sense resolves to a lexeme");
  });

  test("keeps the six A2 boundary senses out of the A1 schedule", () => {
    const boundary = data.senses.filter((value) => !value.isA1);
    assert.equal(boundary.length, 6);
    const scheduled = new Set(
      data.targets.filter((t) => t.targetType === "SENSE").map((t) => t.targetId),
    );
    for (const sense of boundary) {
      assert.equal(scheduled.has(sense.id), false, `${sense.id} must not be scheduled`);
    }
  });

  test("exposes 8 modules, 11 islands and 32 stories in curricular sequence", () => {
    assert.deepEqual(
      data.modules.map((value) => value.order),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(
      data.islands.map((value) => value.globalIslandOrder),
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
    assert.deepEqual(
      data.storyBlueprints.map((value) => value.sequenceIndex),
      Array.from({ length: 32 }, (_, i) => i + 1),
    );
    assert.equal(data.islands[0].id, "A1-M01-I05");
    assert.equal(data.storyBlueprints[0].id, "A1-M01-I05-S1");
  });

  test("reconstructs modules from the island rows, with no MODULE row published", () => {
    // The architecture ledger carries eleven ISLAND rows and nothing else.
    assert.equal(data.modules.length, 8);
    const islandsPerModule = data.modules.map((value) => value.islandIds.length);
    assert.deepEqual(islandsPerModule, [1, 2, 2, 1, 1, 1, 1, 2]);
    assert.equal(
      islandsPerModule.reduce((total, value) => total + value, 0),
      data.islands.length,
    );
    for (const curriculumModule of data.modules) {
      for (const islandId of curriculumModule.islandIds) {
        const island = data.islands.find((value) => value.id === islandId);
        assert.ok(island);
        assert.equal(island.moduleId, curriculumModule.id);
      }
    }
  });

  test("the island chain is linear and gapless", () => {
    assert.equal(data.islands[0].hardPrerequisiteIslandId, null);
    for (let i = 1; i < data.islands.length; i += 1) {
      assert.equal(
        data.islands[i].hardPrerequisiteIslandId,
        data.islands[i - 1].id,
        `island ${data.islands[i].id} must follow ${data.islands[i - 1].id}`,
      );
    }
  });

  test("records exactly one first introduction per target", () => {
    const seen = new Set(data.targets.map((value) => value.targetId));
    assert.equal(seen.size, data.targets.length);
    assert.equal(seen.size, 985);
  });

  test("splits the 985 first introductions into 448 FOCUS and 537 SUPPORTED", () => {
    const focus = data.targets.filter((value) => value.introSalience === "FOCUS");
    const supported = data.targets.filter((value) => value.introSalience === "SUPPORTED");
    assert.equal(focus.length, 448);
    assert.equal(supported.length, 537);
    assert.equal(focus.length + supported.length, data.targets.length);
  });

  test("no story exceeds the published FOCUS guardrail", () => {
    const focusByStory = new Map<string, number>();
    for (const target of data.targets) {
      if (target.introSalience !== "FOCUS") continue;
      focusByStory.set(
        target.firstIntroductionStoryId,
        (focusByStory.get(target.firstIntroductionStoryId) ?? 0) + 1,
      );
    }
    for (const [storyId, count] of focusByStory) {
      assert.ok(
        count <= MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY,
        `${storyId} carries ${count} FOCUS introductions`,
      );
    }
    assert.equal(Math.max(...focusByStory.values()), 20);
  });

  test("schedules one to three ordered returns per target", () => {
    const sequence = new Map(
      data.storyBlueprints.map((value) => [value.id, value.sequenceIndex]),
    );
    const stages = ["FIRST_RETURN", "SECOND_RETURN", "THIRD_RETURN"] as const;
    const edgeById = new Map(data.recycleEdges.map((value) => [value.id, value]));

    for (const target of data.targets) {
      const count = target.recycleEdgeIds.length;
      assert.ok(
        count >= 1 && count <= 3,
        `${target.targetId} has ${count} returns; the published horizon allows 1..3`,
      );
      // The stages present must be a prefix of FIRST -> SECOND -> THIRD.
      const present = target.recycleEdgeIds.map(
        (id) => edgeById.get(id)?.returnStage,
      );
      assert.deepEqual(present, stages.slice(0, count));

      let previous = sequence.get(target.firstIntroductionStoryId) ?? 0;
      for (const id of target.recycleEdgeIds) {
        const edge = edgeById.get(id);
        assert.ok(edge);
        const to = sequence.get(edge.returnStoryId);
        assert.ok(to !== undefined && to > previous, `${edge.id} must move forward`);
        previous = to;
      }
    }
  });

  test("the return graph totals 2867 edges over the published horizon", () => {
    assert.equal(data.recycleEdges.length, 2867);
    const byStage = (stage: string): number =>
      data.recycleEdges.filter((value) => value.returnStage === stage).length;
    assert.equal(byStage("FIRST_RETURN"), 985);
    assert.equal(byStage("SECOND_RETURN"), 950);
    assert.equal(byStage("THIRD_RETURN"), 932);
    for (const edge of data.recycleEdges) {
      assert.equal(edge.masteryClaim, "NONE", `${edge.id} must not claim mastery`);
    }
  });

  test("checkpoints and the final transfer story are where the architecture says", () => {
    const islandCheckpoints = data.storyBlueprints.filter((v) => v.isIslandCheckpoint);
    const moduleCheckpoints = data.storyBlueprints.filter((v) => v.isModuleCheckpoint);
    const finalTransfer = data.storyBlueprints.filter((v) => v.isFinalTransferStory);
    assert.equal(islandCheckpoints.length, 11);
    assert.equal(moduleCheckpoints.length, 8);
    assert.equal(finalTransfer.length, 1);

    for (const island of data.islands) {
      const checkpoint = data.storyBlueprints.find(
        (value) => value.id === island.checkpointStoryId,
      );
      assert.ok(checkpoint, `${island.id} checkpoint must exist`);
      assert.equal(checkpoint.islandId, island.id);
      assert.equal(checkpoint.isIslandCheckpoint, true);
    }
  });

  test("the capstone consolidates and introduces nothing new", () => {
    const capstones = data.storyBlueprints.filter((value) => value.role === "CAPSTONE");
    assert.equal(capstones.length, 1);
    const capstone = capstones[0];
    assert.equal(capstone.id, "A1-M08-I06-S3");
    assert.equal(capstone.isFinalTransferStory, true);
    assert.equal(capstone.declaredFirstIntroTargetCount, 0);
    assert.equal(
      data.targets.filter((v) => v.firstIntroductionStoryId === capstone.id).length,
      0,
    );
  });

  test("the blueprints carry the 13 published DELE task structures", () => {
    const tasks = new Set<string>();
    for (const story of data.storyBlueprints) {
      for (const id of story.deleTaskIds) tasks.add(id);
    }
    assert.equal(tasks.size, 13);
    for (const id of tasks) assert.match(id, /^DELE-A1-[RLWO]\d$/);
  });

  test("the active sequencing schema carries no version-stamped column", () => {
    // Published audit control H-024, enforced rather than trusted.
    assert.equal(release.actualCounts["versionStampedColumns"], 0);
    const sequencing = CANONICAL_SOURCES.filter((source) =>
      source.file.includes("sequencing") || source.file.includes("story_blueprints") || source.file.includes("recycling"),
    );
    for (const source of sequencing) {
      for (const column of [
        ...(source.requiredColumns ?? []),
        ...(source.knownUnusedColumns ?? []),
      ]) {
        assert.doesNotMatch(column, /^v\d+_\d+_/, `${source.file}: ${column}`);
      }
    }
  });

  test("publishes a manifest with SHA-256 hashes of every source", () => {
    assert.equal(release.schemaVersion, REGISTRY_SCHEMA_VERSION);
    assert.equal(release.schemaVersion, "curriculum-registry/2.0.0");
    assert.equal(release.releaseId, "A1-CURRICULUM-v1.51");
    assert.equal(release.sourceFiles.length, 8);
    for (const source of release.sourceFiles) {
      assert.match(source.sha256, /^[0-9a-f]{64}$/, `${source.file} needs a sha256`);
      assert.equal(release.sourceHashes[source.file], source.sha256);
      assert.ok(source.byteLength > 0);
    }
    assert.match(release.contentHash, /^[0-9a-f]{64}$/);
    assert.equal(release.validationResult.status, "PASS");
  });

  test("reads the v1.51 sequencing sources and the shared v1.37/v1.40 inventory", () => {
    const files = release.sourceFiles.map((value) => value.file);
    for (const file of [
      "spanishstories_a1_ws_sequencing_architecture_v1.51.csv",
      "spanishstories_a1_ws_sequencing_allocation_v1.51.csv",
      "spanishstories_a1_ws_story_blueprints_v1.51.csv",
      "spanishstories_a1_ws_recycling_edges_v1.51.csv",
      "spanishstories_a1_ws_sequencing_final_audit_v1.51.csv",
      "spanishstories_a1_ws_normalization_master_v1.37.csv",
      "spanishstories_a1_ws_source_assertions_modes_v1.40.csv",
      "spanishstories_a1_ws_coverage_final_v1.40.csv",
    ]) {
      assert.ok(files.includes(file), `${file} must be a canonical source`);
    }
    assert.ok(
      files.every((file) => !file.includes("v1.44")),
      "no v1.44 sequencing artefact may remain in the active release",
    );
  });

  test("records the curriculum version each source declares", () => {
    assert.equal(release.curriculumVersions["normalizationMaster"], "1.37");
    assert.equal(release.curriculumVersions["sourceAssertions"], "1.40");
    // The v1.51 recycling ledger dropped its self-declared version column; the
    // release version now comes from the allocation filename alone.
    assert.equal(release.curriculumVersions["recyclingEdges"], undefined);
  });
});
