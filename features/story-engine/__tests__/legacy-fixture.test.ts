import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildLegacyFixtureStory } from "../fixtures/la-compra-olvidada.ts";
import { validateStoryPublication } from "../validation/publication-validator.ts";
import { registry, lexicalEngine } from "./fixtures.ts";

describe("story engine / legacy fixture (La compra olvidada)", () => {
  test("the fixture builds with the phase-3 engine and stays a TECHNICAL_FIXTURE (no StoryBlueprint)", () => {
    const fixture = buildLegacyFixtureStory();
    assert.equal(fixture.story.storyBlueprintId, null);
    assert.equal(fixture.version.title, "La compra olvidada");
  });

  test("the discontinuous 'se dio [finalmente] cuenta' occurrence reproduces the original prototype's behaviour", () => {
    const fixture = buildLegacyFixtureStory();
    const occurrence = fixture.occurrences.find((o) => o.id === "occ-se-dio-cuenta");
    assert.ok(occurrence);
    assert.equal(occurrence!.parts.length, 3);
    assert.deepEqual(occurrence!.parts.map((p) => p.role), ["CLITIC", "HEAD", "FIXED"]);
  });

  test("the fixture's ids share no namespace with the v1.51 canonical curriculum ids", () => {
    const fixture = buildLegacyFixtureStory();
    for (const occurrence of fixture.occurrences) {
      if (occurrence.kind === "LEXICAL") {
        assert.doesNotMatch(occurrence.lexemeId, /^LEX-A1-\d{6}$/);
      }
    }
  });

  test("the fixture can never be published as curricular content", () => {
    const fixture = buildLegacyFixtureStory();
    const result = validateStoryPublication({
      story: fixture.story,
      storyVersion: fixture.version,
      sentences: fixture.sentences,
      anchors: fixture.anchors,
      occurrences: fixture.occurrences,
      targetBindings: [],
      curriculumRegistry: registry,
      lexicalEngine,
    });
    assert.equal(result.status, "INVALID");
    assert.ok(result.status === "INVALID" && result.issues.some((i) => i.code === "STORY_HAS_NO_BLUEPRINT"));
  });
});
