import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assembleStoryVersion, createStory } from "../engine/story-service.ts";
import { FixedClock, SequentialIdGenerator, buildFullyBoundStory } from "./fixtures.ts";

/**
 * Same content, same clock, same id generator -> byte-identical output.
 *
 * Two independent runs must serialize identically; `versionNumber`,
 * `createdAt` and every generated id are injected, never ambient, so nothing
 * here can vary between runs except a genuine content change.
 */
function buildOnce() {
  const ids = new SequentialIdGenerator();
  const clock = new FixedClock();
  const built = buildFullyBoundStory("A1-M01-I05-S2", ids);
  const story = createStory(built.storyId, "A1-M01-I05-S2" as never, clock);
  const version = assembleStoryVersion({
    id: built.storyVersionId,
    storyId: story.id,
    versionNumber: 1,
    title: "Determinism fixture",
    sentences: built.sentences,
    status: "DRAFT",
    clock,
  });
  return { story, version, ...built };
}

describe("story engine / determinism", () => {
  test("two builds of the same story, same clock and same id generator, serialize identically", () => {
    const a = buildOnce();
    const b = buildOnce();
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  test("a different id generator start state changes the ids but not the structural shape", () => {
    const ids = new SequentialIdGenerator();
    ids.next("StoryId"); // burn one id so the sequence starts elsewhere
    const built = buildFullyBoundStory("A1-M01-I05-S2", ids);
    const again = buildOnce();
    assert.notEqual(built.storyId, again.storyId);
    assert.equal(built.occurrences.length, again.occurrences.length);
    assert.equal(built.targetBindings.length, again.targetBindings.length);
  });
});
