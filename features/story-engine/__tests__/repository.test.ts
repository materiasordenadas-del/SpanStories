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
  test("getStory/saveStory round-trip; an unknown id is null, not undefined", () => {
    const repo = new InMemoryStoryRepository();
    assert.equal(repo.getStory(storyId), null);
    const clock = new FixedClock();
    const story = createStory(storyId, null, clock);
    repo.saveStory(story);
    assert.deepEqual(repo.getStory(storyId), story);
  });

  test("a published StoryVersion's text is never mutated in place; new text is a new version", () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const v1Id = asId("StoryVersionId", "storyver-1");
    const sentence1 = sentenceFor(v1Id, "Version uno.");
    const v1 = assembleStoryVersion({ id: v1Id, storyId, versionNumber: 1, title: "T1", sentences: [sentence1], status: "DRAFT", clock });
    repo.saveNewVersion({ version: v1, sentences: [sentence1], anchors: [], occurrences: [], targetBindings: [] });

    const published1 = publishStoryVersion(v1, clock);
    repo.markPublished(published1);
    assert.equal(repo.getStoryVersion(v1Id)?.status, "PUBLISHED");
    assert.equal(repo.getStoryVersion(v1Id)?.text, "Version uno.");

    const v2Id = asId("StoryVersionId", "storyver-2");
    const sentence2 = sentenceFor(v2Id, "Version dos, distinta.");
    const v2 = assembleStoryVersion({ id: v2Id, storyId, versionNumber: 2, title: "T2", sentences: [sentence2], status: "DRAFT", clock });
    repo.saveNewVersion({ version: v2, sentences: [sentence2], anchors: [], occurrences: [], targetBindings: [] });
    repo.markPublished(publishStoryVersion(v2, clock));

    // The old version's text is exactly as it was; anchors into it stay valid forever.
    assert.equal(repo.getStoryVersion(v1Id)?.text, "Version uno.");
    assert.equal(repo.listVersions(storyId).length, 2);
    assert.equal(repo.getPublishedVersion(storyId)?.id, v2Id);
  });

  test("saving a version under an id that already exists is rejected, not merged", () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "Texto.");
    const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
    repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
    assert.throws(() => repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] }), /DUPLICATE_STORY_VERSION_ID/);
  });

  test("markPublished cannot be used to change text or title", () => {
    const repo = new InMemoryStoryRepository();
    const clock = new FixedClock();
    const vId = asId("StoryVersionId", "storyver-1");
    const sentence = sentenceFor(vId, "Original.");
    const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
    repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
    const tampered = { ...publishStoryVersion(v, clock), text: "Cambiado." };
    assert.throws(() => repo.markPublished(tampered), /STORY_VERSION_TEXT_IMMUTABLE/);
  });

  test("listOccurrences/getOccurrence expose what saveNewVersion stored", () => {
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
    repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });

    assert.deepEqual(repo.getOccurrence(occurrence.id), occurrence);
    assert.equal(repo.listOccurrences(vId).length, 1);
    assert.equal(repo.listSentences(vId).length, 1);
    assert.equal(repo.listAnchors(vId).length, 1);
  });

  test("appendAnnotationRevision/listAnnotationRevisions is append-only in practice: nothing removes a prior entry", () => {
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
    repo.appendAnnotationRevision(revision1);
    assert.equal(repo.listAnnotationRevisions(revision1.occurrenceId).length, 1);
    repo.appendAnnotationRevision({ ...revision1, id: asId("OccurrenceAnnotationRevisionId", "rev-2"), reason: "second" });
    assert.equal(repo.listAnnotationRevisions(revision1.occurrenceId).length, 2);
  });

  test("a failed construction never reaches the repository: corruption produces no partial write", () => {
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
    assert.equal(repo.listVersions(storyId).length, 0);
  });
});
