import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { createStoryTargetBinding } from "../engine/target-binding.ts";

const storyId = asId("StoryId", "story-1");
const storyVersionId = asId("StoryVersionId", "storyver-1");
const occurrenceId = asId("StoryOccurrenceId", "occ-1");

describe("story engine / target binding", () => {
  test("a FIRST_INTRO binding carries its declared salience", () => {
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-1"),
      storyId,
      storyVersionId,
      occurrenceId,
      targetType: "SENSE",
      targetId: "SENSE-A1-000001",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
    });
    assert.equal(binding.salience, "FOCUS");
  });

  test("a return-stage binding never carries a salience, even if one is passed", () => {
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-2"),
      storyId,
      storyVersionId,
      occurrenceId,
      targetType: "SENSE",
      targetId: "SENSE-A1-000001",
      bindingKind: "SECOND_RETURN",
      salience: "FOCUS",
    });
    assert.equal(binding.salience, null);
  });

  test("productiveClaim defaults to NONE", () => {
    const binding = createStoryTargetBinding({
      id: asId("StoryTargetBindingId", "bind-3"),
      storyId,
      storyVersionId,
      occurrenceId,
      targetType: "SENSE",
      targetId: "SENSE-A1-000001",
      bindingKind: "FIRST_RETURN",
    });
    assert.equal(binding.productiveClaim, "NONE");
  });
});
