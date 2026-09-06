/**
 * Happy path: the published A1 release imports, validates and counts out.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { ARCHITECTURE_EXPECTED_COUNTS } from "../import/expectations.ts";
import { importCurriculum, importCurriculumOrThrow } from "../import/importer.ts";
import { REGISTRY_SCHEMA_VERSION } from "../domain/release.ts";
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

  test("exposes modules, islands and stories in curricular sequence", () => {
    assert.deepEqual(
      data.modules.map((value) => value.order),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(
      data.islands.map((value) => value.globalIslandOrder),
      Array.from({ length: 32 }, (_, i) => i + 1),
    );
    assert.deepEqual(
      data.storyBlueprints.map((value) => value.sequenceIndex),
      Array.from({ length: 103 }, (_, i) => i + 1),
    );
    assert.equal(data.modules[0].islandIds.length, 4);
    assert.equal(data.storyBlueprints[0].id, "A1-M01-I01-S1");
  });

  test("records exactly one first introduction per target", () => {
    const seen = new Set(data.targets.map((value) => value.targetId));
    assert.equal(seen.size, data.targets.length);
    assert.equal(seen.size, 985);
  });

  test("schedules three ordered recycle edges for every target", () => {
    const sequence = new Map(
      data.storyBlueprints.map((value) => [value.id, value.sequenceIndex]),
    );
    for (const target of data.targets) {
      assert.equal(
        target.recycleEdgeIds.length,
        3,
        `${target.targetId} must have three recycle edges`,
      );
    }
    for (const edge of data.recycleEdges) {
      const from = sequence.get(edge.fromStoryId);
      const to = sequence.get(edge.toStoryId);
      assert.ok(from !== undefined && to !== undefined);
      assert.ok(to > from, `edge ${edge.id} must move forward in the sequence`);
    }
  });

  test("publishes a manifest with SHA-256 hashes of every source", () => {
    assert.equal(release.schemaVersion, REGISTRY_SCHEMA_VERSION);
    assert.equal(release.releaseId, "A1-CURRICULUM-v1.44");
    assert.equal(release.sourceFiles.length, 8);
    for (const source of release.sourceFiles) {
      assert.match(source.sha256, /^[0-9a-f]{64}$/, `${source.file} needs a sha256`);
      assert.equal(release.sourceHashes[source.file], source.sha256);
      assert.ok(source.byteLength > 0);
    }
    assert.match(release.contentHash, /^[0-9a-f]{64}$/);
    assert.equal(release.validationResult.status, "PASS");
  });

  test("records the curriculum version each source declares", () => {
    assert.equal(release.curriculumVersions["normalizationMaster"], "1.37");
    assert.equal(release.curriculumVersions["sourceAssertions"], "1.40");
    assert.equal(release.curriculumVersions["recyclingEdges"], "1.44");
  });
});
