import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { StoryEngineError } from "../domain/errors.ts";
import { createTextAnchor, nextVersionNumber, publishStoryVersion } from "../engine/story-service.ts";
import type { StorySentence, StoryVersion } from "../domain/model.ts";
import { FixedClock } from "./fixtures.ts";

const storyVersionId = asId("StoryVersionId", "storyver-1");

function sentence(text: string): StorySentence {
  return { id: asId("SentenceId", "sent-1"), storyVersionId, order: 1, text, tokens: [] };
}

describe("story engine / corruption must fail loudly", () => {
  test("an id with the wrong technical prefix is rejected, not silently accepted", () => {
    assert.throws(() => asId("StoryId", "storyver-1"), /STORY_ENGINE_ID_PATTERN_INVALID/);
    assert.throws(() => asId("TextAnchorId", "LEX-A1-000001"), /STORY_ENGINE_ID_PATTERN_INVALID/);
  });

  test("an anchor past the end of the sentence throws, it does not clamp", () => {
    const s = sentence("corto");
    assert.throws(
      () => createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 999 }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "ANCHOR_OUT_OF_BOUNDS"),
    );
  });

  test("an inverted or empty anchor throws", () => {
    const s = sentence("hola");
    assert.throws(
      () => createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 2, end: 2 }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "ANCHOR_EMPTY_OR_INVERTED"),
    );
  });

  test("a published StoryVersion cannot be published a second time", () => {
    const clock = new FixedClock();
    const draft: StoryVersion = {
      id: storyVersionId,
      storyId: asId("StoryId", "story-1"),
      versionNumber: 1,
      title: "T",
      text: "hola",
      status: "DRAFT",
      createdAt: clock.now().toISOString(),
      publishedAt: null,
    };
    const published = publishStoryVersion(draft, clock);
    assert.throws(() => publishStoryVersion(published, clock), /STORY_VERSION_ALREADY_PUBLISHED/);
  });

  test("nextVersionNumber never reuses or skips a number", () => {
    const clock = new FixedClock();
    const v1: StoryVersion = {
      id: storyVersionId,
      storyId: asId("StoryId", "story-1"),
      versionNumber: 1,
      title: "T",
      text: "a",
      status: "PUBLISHED",
      createdAt: clock.now().toISOString(),
      publishedAt: clock.now().toISOString(),
    };
    assert.equal(nextVersionNumber([]), 1);
    assert.equal(nextVersionNumber([v1]), 2);
    assert.equal(nextVersionNumber([v1, { ...v1, versionNumber: 3 }]), 4);
  });
});
