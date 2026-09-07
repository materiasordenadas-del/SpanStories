import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { InMemoryStoryRepository } from "../repository/in-memory-story-repository.ts";
import { assembleStoryVersion, createLexicalOccurrence, createStory, createTextAnchor, publishStoryVersion } from "../engine/story-service.ts";
import type { StorySentence } from "../domain/model.ts";
import type { StoryVersionId } from "../domain/ids.ts";
import { FixedClock, PLACEHOLDER_LEXEME_ID } from "./fixtures.ts";

const storyId = asId("StoryId", "story-1");

function sentenceFor(versionId: StoryVersionId, text: string): StorySentence {
  return { id: asId("SentenceId", "sent-1"), storyVersionId: versionId, order: 1, text, tokens: [] };
}

describe("story engine / repository contract", () => {
  test("getStory/saveStory round-trip; an unknown id is null, not undefined", async () => {
    const repo = new InMemoryStoryRepository();
    assert.equal(await repo.getStory(storyId), null);
    const clock = new FixedClock();
    const story = createStory(storyId, null, clock);
    await repo.saveStory(story);
    assert.deepEqual(await repo.getStory(storyId), story);
  });

  test("a published StoryVersion's text is never mutated in place; new text is a new version", async () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const v1Id = asId("StoryVersionId", "storyver-1");
    const sentence1 = sentenceFor(v1Id, "Version uno.");
    const v1 = assembleStoryVersion({ id: v1Id, storyId, versionNumber: 1, title: "T1", sentences: [sentence1], status: "DRAFT", clock });
    await repo.saveNewVersion({ version: v1, sentences: [sentence1], anchors: [], occurrences: [], targetBindings: [] });

    const published1 = publishStoryVersion(v1, clock);
    await repo.markPublished(published1);
    assert.equal((await repo.getStoryVersion(v1Id))?.status, "PUBLISHED");
    assert.equal((await repo.getStoryVersion(v1Id))?.text, "Version uno.");

    const v2Id = asId("StoryVersionId", "storyver-2");
    const sentence2 = sentenceFor(v2Id, "Version dos, distinta.");
    const v2 = assembleStoryVersion({ id: v2Id, storyId, versionNumber: 2, title: "T2", sentences: [sentence2], status: "DRAFT", clock });
    await repo.saveNewVersion({ version: v2, sentences: [sentence2], anchors: [], occurrences: [], targetBindings: [] });
    await repo.markPublished(publishStoryVersion(v2, clock));

    // The old version's text is exactly as it was; anchors into it stay valid forever.
    assert.equal((await repo.getStoryVersion(v1Id))?.text, "Version uno.");
    assert.equal((await repo.listVersions(storyId)).length, 2);
    assert.equal((await repo.getPublishedVersion(storyId))?.id, v2Id);
  });

  test("saving a version under an id that already exists is rejected, not merged", async () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "Texto.");
    const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
    await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
    await assert.rejects(
      () => repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] }),
      /DUPLICATE_STORY_VERSION_ID/,
    );
  });

  test("markPublished cannot be used to change text or title", async () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "Original.");
    const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
    await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
    const tampered = { ...publishStoryVersion(v, clock), text: "Cambiado." };
    await assert.rejects(() => repo.markPublished(tampered), /STORY_VERSION_TEXT_IMMUTABLE/);
  });

  test("listOccurrences/getOccurrence expose what saveNewVersion stored", async () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), vId, sentence, { start: 0, end: 4 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId: vId,
      sentenceId: sentence.id,
      surface: "hola",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
    });
    const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
    await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });

    assert.deepEqual(await repo.getOccurrence(occurrence.id), occurrence);
    assert.equal((await repo.listOccurrences(vId)).length, 1);
    assert.equal((await repo.listSentences(vId)).length, 1);
    assert.equal((await repo.listAnchors(vId)).length, 1);
  });

  test("appendAnnotationRevision/listAnnotationRevisions is append-only in practice: nothing removes a prior entry", async () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const revision1 = {
      id: asId("OccurrenceAnnotationRevisionId", "rev-1"),
      occurrenceId: asId("StoryOccurrenceId", "occ-1"),
      previousLexemeId: null,
      newLexemeId: PLACEHOLDER_LEXEME_ID,
      previousSenseId: null,
      newSenseId: null,
      reason: "first",
      lexiconReleaseId: "A1-LEXICON-v1.0" as never,
      editorialReference: null,
      createdAt: clock.now().toISOString(),
    };
    await repo.appendAnnotationRevision(revision1);
    assert.equal((await repo.listAnnotationRevisions(revision1.occurrenceId)).length, 1);
    await repo.appendAnnotationRevision({ ...revision1, id: asId("OccurrenceAnnotationRevisionId", "rev-2"), reason: "second" });
    assert.equal((await repo.listAnnotationRevisions(revision1.occurrenceId)).length, 2);
  });

  test("a failed construction never reaches the repository: corruption produces no partial write", async () => {
    const repo = new InMemoryStoryRepository();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "hola mundo");
    const a = createTextAnchor(asId("TextAnchorId", "anchor-1"), vId, sentence, { start: 0, end: 4 });
    const b = createTextAnchor(asId("TextAnchorId", "anchor-2"), vId, sentence, { start: 2, end: 6 });

    assert.throws(() =>
      createLexicalOccurrence({
        id: asId("StoryOccurrenceId", "occ-1"),
        storyVersionId: vId,
        sentenceId: sentence.id,
        surface: "hola mundo",
        lexemeId: PLACEHOLDER_LEXEME_ID,
        senseId: null,
        lexemeFormId: null,
        senseResolutionStatus: "NOT_REQUIRED",
        parts: [
          { id: asId("OccurrencePartId", "part-1"), anchor: a, role: "HEAD" },
          { id: asId("OccurrencePartId", "part-2"), anchor: b, role: "FIXED" },
        ],
      }),
    );
    // Nothing was ever handed to the repository, so nothing was stored.
    assert.equal((await repo.listVersions(storyId)).length, 0);
  });
});
