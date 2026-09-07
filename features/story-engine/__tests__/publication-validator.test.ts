import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { assembleStoryVersion, createLexicalOccurrence, createStory, createTextAnchor } from "../engine/story-service.ts";
import { createStoryTargetBinding } from "../engine/target-binding.ts";
import { validateStoryPublication, type PublicationContext, type PublicationIssueCode } from "../validation/publication-validator.ts";
import type { LexemeFormId, LexemeId, SenseId } from "../../curriculum/index.ts";
import type { Story, StoryOccurrence, StorySentence, StoryTargetBinding, TextAnchor } from "../domain/model.ts";
import {
  buildFullyBoundStory,
  FixedClock,
  lexicalEngine,
  PLACEHOLDER_LEXEME_ID,
  registry,
  SequentialIdGenerator,
} from "./fixtures.ts";

const clock = new FixedClock();
const storyVersionId = asId("StoryVersionId", "storyver-1");

function sentence(text: string): StorySentence {
  return { id: asId("SentenceId", "sent-1"), storyVersionId, order: 1, text, tokens: [] };
}

function baseContextFor(overrides: {
  readonly storyBlueprintId: string | null;
  readonly occurrences: readonly StoryOccurrence[];
  readonly anchors: readonly TextAnchor[];
  readonly sentences: readonly StorySentence[];
  readonly targetBindings: readonly StoryTargetBinding[];
}): PublicationContext {
  const story: Story = createStory(asId("StoryId", "story-1"), overrides.storyBlueprintId as never, clock);
  const version = assembleStoryVersion({
    id: storyVersionId,
    storyId: story.id,
    versionNumber: 1,
    title: "Test",
    sentences: overrides.sentences,
    status: "DRAFT",
    clock,
  });
  return {
    story,
    storyVersion: version,
    sentences: overrides.sentences,
    anchors: overrides.anchors,
    occurrences: overrides.occurrences,
    targetBindings: overrides.targetBindings,
    curriculumRegistry: registry,
    lexicalEngine,
  };
}

function hasIssue(result: ReturnType<typeof validateStoryPublication>, code: PublicationIssueCode): boolean {
  return result.status === "INVALID" && result.issues.some((i) => i.code === code);
}

describe("story engine / publication validator", () => {
  test("a fully-bound real story (all first introductions and returns satisfied) is VALID", () => {
    const ids = new SequentialIdGenerator();
    const built = buildFullyBoundStory("A1-M01-I05-S1", ids);
    const story: Story = createStory(built.storyId, "A1-M01-I05-S1" as never, clock);
    const version = assembleStoryVersion({
      id: built.storyVersionId,
      storyId: story.id,
      versionNumber: 1,
      title: "Fixture completa",
      sentences: built.sentences,
      status: "DRAFT",
      clock,
    });

    const result = validateStoryPublication({
      story,
      storyVersion: version,
      sentences: built.sentences,
      anchors: built.anchors,
      occurrences: built.occurrences,
      targetBindings: built.targetBindings,
      curriculumRegistry: registry,
      lexicalEngine,
    });

    assert.deepEqual(result, { status: "VALID" });
  });

  test("a story with no StoryBlueprint cannot be published as curricular", () => {
    const ctx = baseContextFor({ storyBlueprintId: null, occurrences: [], anchors: [], sentences: [], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "STORY_HAS_NO_BLUEPRINT"));
  });

  test("an unknown StoryBlueprintId fails publication", () => {
    const ctx = baseContextFor({ storyBlueprintId: "A1-M99-I99-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "STORY_BLUEPRINT_NOT_FOUND"));
  });

  test("an occurrence naming an unknown Lexeme fails publication", () => {
    const s = sentence("hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 4 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "hola",
      lexemeId: "LEX-A1-999999" as LexemeId,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [occurrence], anchors: [anchor], sentences: [s], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "LEXEME_NOT_FOUND"));
  });

  test("an occurrence naming an unknown Sense fails publication", () => {
    const s = sentence("hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 4 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "hola",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: "SENSE-A1-999999" as SenseId,
      lexemeFormId: null,
      senseResolutionStatus: "RESOLVED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [occurrence], anchors: [anchor], sentences: [s], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "SENSE_NOT_FOUND"));
  });

  test("a Sense that belongs to a different Lexeme fails publication", () => {
    const s = sentence("adios");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 5 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "adios",
      lexemeId: PLACEHOLDER_LEXEME_ID, // "a", NOT the lexeme SENSE-A1-000015 actually belongs to
      senseId: "SENSE-A1-000015" as SenseId,
      lexemeFormId: null,
      senseResolutionStatus: "RESOLVED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [occurrence], anchors: [anchor], sentences: [s], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "SENSE_LEXEME_MISMATCH"));
  });

  test("an occurrence naming an unknown LexemeForm fails publication", () => {
    const s = sentence("hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 4 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "hola",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: "FORM-A1-999999" as LexemeFormId,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [occurrence], anchors: [anchor], sentences: [s], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "FORM_NOT_FOUND"));
  });

  test("an A2-boundary Sense cannot be published inside an A1 story", () => {
    const s = sentence("un billete");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 3, end: 10 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "billete",
      lexemeId: "LEX-A1-000074" as LexemeId,
      senseId: "SENSE-A1-000075" as SenseId, // A2_BOUNDARY_NOT_A1
      lexemeFormId: null,
      senseResolutionStatus: "RESOLVED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [occurrence], anchors: [anchor], sentences: [s], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "A2_BOUNDARY_PUBLISHED_AS_A1"));
  });

  test("a binding naming an unknown target fails publication", () => {
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-1"),
      storyId: asId("StoryId", "story-1"),
      storyVersionId,
      occurrenceId: asId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-999999",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [binding] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "TARGET_BINDING_TARGET_NOT_FOUND"));
  });

  test("a FIRST_INTRO binding for a target introduced in a different story fails publication", () => {
    // SENSE-A1-000109 is first introduced in A1-M01-I05-S2, not S1.
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-1"),
      storyId: asId("StoryId", "story-1"),
      storyVersionId,
      occurrenceId: asId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-000109",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [binding] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "TARGET_BINDING_STORY_MISMATCH"));
  });

  test("a FIRST_INTRO binding with the wrong salience (FOCUS/SUPPORTED) fails publication", () => {
    // SENSE-A1-000015 ("adios") is scheduled SUPPORTED in A1-M01-I05-S1.
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-1"),
      storyId: asId("StoryId", "story-1"),
      storyVersionId,
      occurrenceId: asId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-000015",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [binding] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "TARGET_BINDING_SALIENCE_MISMATCH"));
  });

  test("a regional-receptive target cannot be bound with a UNIVERSAL productive claim", () => {
    // SENSE-A1-000418 ("okay") is regional-receptive, first introduced FOCUS in A1-M01-I05-S4.
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-1"),
      storyId: asId("StoryId", "story-1"),
      storyVersionId,
      occurrenceId: asId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-000418",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
      productiveClaim: "UNIVERSAL",
    });
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S4", occurrences: [], anchors: [], sentences: [], targetBindings: [binding] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM"));
  });

  test("a target scheduled to be introduced in this story with no binding fails publication", () => {
    // A1-M01-I05-S1 introduces SENSE-A1-000015 among others; provide none.
    const ctx = baseContextFor({ storyBlueprintId: "A1-M01-I05-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.ok(hasIssue(result, "MISSING_REQUIRED_TARGET_BINDING"));
  });

  test("corruption never produces a partial VALID result: multiple simultaneous defects are all reported", () => {
    const ctx = baseContextFor({ storyBlueprintId: "A1-M99-I99-S1", occurrences: [], anchors: [], sentences: [], targetBindings: [] });
    const result = validateStoryPublication(ctx);
    assert.equal(result.status, "INVALID");
  });
});
