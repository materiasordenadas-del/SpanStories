/**
 * Query API over the generated registry.
 *
 * These tests read the committed registry from `generated/curriculum/a1`, which
 * is what runtime consumes. They therefore also prove the generated tree is in
 * step with the published sources.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../index.ts";
import { importCurriculumOrThrow } from "../import/importer.ts";

const registry = loadCurriculumRegistry();

describe("curriculum registry / query API", () => {
  test("the committed registry matches the published sources", () => {
    const fresh = importCurriculumOrThrow();
    assert.equal(
      registry.release.contentHash,
      fresh.release.contentHash,
      "generated registry is stale: run `npm run curriculum:import`",
    );
  });

  test("LEX-A1-* lookup", () => {
    const lexeme = registry.getLexemeById("LEX-A1-000001");
    assert.ok(lexeme);
    assert.equal(lexeme.lemma, "a");
    assert.equal(registry.getLexemeById("LEX-A1-999999"), null);
  });

  test("FORM-A1-* lookup and Form -> Lexeme", () => {
    const form = registry.getFormById("FORM-A1-000001");
    assert.ok(form);
    assert.equal(form.surface, "a");
    const lexeme = registry.getLexemeOfForm("FORM-A1-000001");
    assert.ok(lexeme);
    assert.equal(lexeme.id, form.lexemeId);
    assert.equal(registry.getFormById("FORM-A1-999999"), null);
  });

  test("SENSE-A1-* lookup and Sense -> Lexeme", () => {
    const sense = registry.getSenseById("SENSE-A1-000001");
    assert.ok(sense);
    assert.equal(sense.isA1, true);
    const lexeme = registry.getLexemeOfSense("SENSE-A1-000001");
    assert.ok(lexeme);
    assert.equal(lexeme.id, sense.lexemeId);
    assert.equal(registry.getSenseById("SENSE-A1-999999"), null);
  });

  test("forms and senses of a lexeme", () => {
    const forms = registry.getFormsOfLexeme("LEX-A1-000001");
    assert.equal(forms.status, "FOUND");
    assert.ok(forms.status === "FOUND" && forms.value.length >= 1);
    const senses = registry.getSensesOfLexeme("LEX-A1-000001");
    assert.ok(senses.status === "FOUND" && senses.value.length >= 1);
    assert.equal(registry.getFormsOfLexeme("LEX-A1-999999").status, "NOT_FOUND");
  });

  test("SourceAssertions of a sense", () => {
    const result = registry.getSourceAssertionsForSense("SENSE-A1-000001");
    assert.equal(result.status, "FOUND");
    assert.ok(result.status === "FOUND" && result.value.length > 0);
    if (result.status === "FOUND") {
      for (const assertion of result.value) {
        assert.equal(assertion.senseId, "SENSE-A1-000001");
        assert.match(assertion.id, /^SA-A1-\d{6}$/);
      }
    }
    assert.equal(
      registry.getSourceAssertionsForSense("SENSE-A1-999999").status,
      "NOT_FOUND",
    );
  });

  test("an unknown target and a valid empty result are different answers", () => {
    // A grammar unit exists but is addressed by no published assertion.
    const grammar = registry.data.grammarUnits[0];
    const empty = registry.getSourceAssertionsForTarget(grammar.id);
    assert.equal(empty.status, "FOUND");
    assert.deepEqual(empty.status === "FOUND" ? empty.value : null, []);

    const missing = registry.getSourceAssertionsForTarget("GRAM-A1-999");
    assert.equal(missing.status, "NOT_FOUND");
    assert.equal(missing.status === "NOT_FOUND" ? missing.id : null, "GRAM-A1-999");
  });

  test("modules and islands come back in curricular order", () => {
    const modules = registry.getModulesInOrder();
    assert.equal(modules.length, 8);
    assert.deepEqual(
      modules.map((value) => value.id),
      ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"],
    );
    const islands = registry.getIslandsInOrder();
    assert.equal(islands.length, 11);
    assert.equal(islands[0].id, "A1-M01-I05");
    assert.equal(islands[10].globalIslandOrder, 11);

    const ofModule = registry.getIslandsOfModule("M01");
    assert.ok(ofModule.status === "FOUND" && ofModule.value.length === 1);
    const ofM02 = registry.getIslandsOfModule("M02");
    assert.ok(ofM02.status === "FOUND" && ofM02.value.length === 2);
    assert.equal(registry.getIslandsOfModule("M99").status, "NOT_FOUND");
  });

  test("stories come back in the single canonical sequence", () => {
    const stories = registry.getStoriesInSequence();
    assert.equal(stories.length, 32);
    assert.equal(stories[0].id, "A1-M01-I05-S1");
    stories.forEach((story, index) => assert.equal(story.sequenceIndex, index + 1));

    const byId = registry.getStoryBlueprintById("A1-M01-I05-S1");
    assert.ok(byId);
    assert.equal(byId.moduleId, "M01");
    assert.equal(registry.getStoryBlueprintById("A1-M09-I09-S9"), null);

    const ofIsland = registry.getStoriesOfIsland("A1-M01-I05");
    assert.ok(ofIsland.status === "FOUND" && ofIsland.value.length === 4);
  });

  test("a CurriculumTarget resolves to its registry object", () => {
    const sense = registry.resolveTarget("SENSE-A1-000015");
    assert.ok(sense);
    assert.equal(sense.targetType, "SENSE");
    assert.ok(sense.sense);
    assert.equal(sense.grammarUnit, null);

    const grammar = registry.resolveTarget(registry.data.grammarUnits[0].id);
    assert.ok(grammar);
    assert.equal(grammar.targetType, "GRAMMAR_UNIT");
    assert.ok(grammar.grammarUnit);
    assert.equal(grammar.sense, null);

    const mwu = registry.data.targets.find((t) => t.targetType === "MWU_SOURCE_UNIT");
    assert.ok(mwu);
    const resolvedMwu = registry.resolveTarget(mwu.targetId);
    assert.ok(resolvedMwu?.mwuUnit);

    assert.equal(registry.resolveTarget("SENSE-A1-999999"), null);
  });

  test("first introduction of a target", () => {
    const result = registry.getFirstIntroduction("SENSE-A1-000015");
    assert.equal(result.status, "FOUND");
    if (result.status !== "FOUND") return;
    assert.equal(result.value.island.id, result.value.story.islandId);
    assert.equal(result.value.module.id, result.value.island.moduleId);
    assert.equal(result.value.story.id, result.value.allocation.firstIntroductionStoryId);
    assert.equal(registry.getFirstIntroduction("SENSE-A1-999999").status, "NOT_FOUND");
  });

  test("every A1 sense has exactly one first introduction", () => {
    const a1 = registry.data.senses.filter((value) => value.isA1);
    assert.equal(a1.length, 602);
    for (const sense of a1) {
      assert.equal(
        registry.getFirstIntroduction(sense.id).status,
        "FOUND",
        `${sense.id} must be scheduled`,
      );
    }
    for (const sense of registry.data.senses.filter((value) => !value.isA1)) {
      assert.equal(
        registry.getFirstIntroduction(sense.id).status,
        "NOT_FOUND",
        `${sense.id} is an A2 boundary sense and must not be scheduled`,
      );
    }
  });

  test("the registry exposes the v1.51 release identity", () => {
    assert.equal(registry.release.releaseId, "A1-CURRICULUM-v1.51");
    assert.equal(registry.release.schemaVersion, "curriculum-registry/2.0.0");
    assert.equal(registry.release.validationResult.status, "PASS");
  });

  test("checkpoints are reachable from the topology", () => {
    for (const island of registry.getIslandsInOrder()) {
      const checkpoint = registry.getStoryBlueprintById(island.checkpointStoryId);
      assert.ok(checkpoint, `${island.id} checkpoint must resolve`);
      assert.equal(checkpoint.islandId, island.id);
      assert.equal(checkpoint.isIslandCheckpoint, true);
    }
    for (const curriculumModule of registry.getModulesInOrder()) {
      const checkpointId = curriculumModule.checkpointStoryId;
      assert.ok(checkpointId, `${curriculumModule.id} needs a module checkpoint`);
      const checkpoint = registry.getStoryBlueprintById(checkpointId);
      assert.ok(checkpoint);
      assert.equal(checkpoint.moduleId, curriculumModule.id);
      assert.equal(checkpoint.isModuleCheckpoint, true);
    }
  });

  test("targets carry their FOCUS or SUPPORTED salience through the query API", () => {
    const resolved = registry.resolveTarget("SENSE-A1-000015");
    assert.ok(resolved);
    assert.equal(resolved.allocation.introSalience, "SUPPORTED");
    const salience = new Set(registry.data.targets.map((value) => value.introSalience));
    assert.deepEqual([...salience].sort(), ["FOCUS", "SUPPORTED"]);
  });

  test("recycle edges and recycle path of a target", () => {
    const edges = registry.getRecycleEdgesForTarget("SENSE-A1-000015");
    assert.ok(edges.status === "FOUND" && edges.value.length === 3);

    const path = registry.getRecyclePath("SENSE-A1-000015");
    assert.equal(path.status, "FOUND");
    if (path.status !== "FOUND") return;
    assert.deepEqual(
      path.value.steps.map((step) => step.returnStage),
      ["FIRST_RETURN", "SECOND_RETURN", "THIRD_RETURN"],
    );
    let previous = path.value.introduction.sequenceIndex;
    for (const step of path.value.steps) {
      assert.ok(
        step.story.sequenceIndex > previous,
        "each recycling leg must come later in the sequence",
      );
      previous = step.story.sequenceIndex;
    }
    assert.equal(registry.getRecyclePath("SENSE-A1-999999").status, "NOT_FOUND");
  });

  test("targets introduced in a story match its declared load", () => {
    for (const story of registry.getStoriesInSequence()) {
      const result = registry.getTargetsIntroducedIn(story.id);
      assert.equal(result.status, "FOUND");
      if (result.status !== "FOUND") continue;
      assert.equal(result.value.length, story.declaredFirstIntroTargetCount, story.id);
    }
    assert.equal(registry.getTargetsIntroducedIn("A1-M09-I09-S9").status, "NOT_FOUND");
  });
});
