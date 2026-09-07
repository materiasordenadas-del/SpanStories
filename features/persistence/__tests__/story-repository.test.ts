import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  asId,
  assembleStoryVersion,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
  publishStoryVersion,
  type StorySentence,
  type StoryVersionId,
} from "../../story-engine/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";

class FixedClock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

function sentenceFor(versionId: StoryVersionId, text: string): StorySentence {
  return { id: asId("SentenceId", `sent-${versionId}`), storyVersionId: versionId, order: 1, text, tokens: [] };
}

async function freshRepository() {
  const db = await openPGliteDatabase();
  await migrate(db);
  // A technical fixture (storyBlueprintId null) needs no curriculum seed and
  // no lexeme row beyond what's inserted ad hoc per test.
  await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-TEST-000001", "test", "ATOMIC", "{}"]);
  return { db, repo: new PostgresStoryRepository(db) };
}

describe("persistence / PostgresStoryRepository contract", () => {
  test("getStory/saveStory round-trip; an unknown id is null, not undefined", async () => {
    const { db, repo } = await freshRepository();
    try {
      const storyId = asId("StoryId", "story-1");
      assert.equal(await repo.getStory(storyId), null);
      const clock = new FixedClock();
      const story = createStory(storyId, null, clock);
      await repo.saveStory(story);
      assert.deepEqual(await repo.getStory(storyId), story);
    } finally {
      await db.close();
    }
  });

  test("a published StoryVersion's text is never mutated in place; new text is a new version", async () => {
    const { db, repo } = await freshRepository();
    try {
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));

      const v1Id = asId("StoryVersionId", "storyver-1");
      const sentence1 = sentenceFor(v1Id, "Version uno.");
      const v1 = assembleStoryVersion({ id: v1Id, storyId, versionNumber: 1, title: "T1", sentences: [sentence1], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v1, sentences: [sentence1], anchors: [], occurrences: [], targetBindings: [] });
      await repo.markPublished(publishStoryVersion(v1, clock));

      const v2Id = asId("StoryVersionId", "storyver-2");
      const sentence2 = sentenceFor(v2Id, "Version dos, distinta.");
      const v2 = assembleStoryVersion({ id: v2Id, storyId, versionNumber: 2, title: "T2", sentences: [sentence2], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v2, sentences: [sentence2], anchors: [], occurrences: [], targetBindings: [] });
      await repo.markPublished(publishStoryVersion(v2, clock));

      assert.equal((await repo.getStoryVersion(v1Id))?.text, "Version uno.");
      assert.equal((await repo.listVersions(storyId)).length, 2);
      assert.equal((await repo.getPublishedVersion(storyId))?.id, v2Id);
    } finally {
      await db.close();
    }
  });

  test("a raw UPDATE against a PUBLISHED version's text is rejected by the database trigger", async () => {
    const { db, repo } = await freshRepository();
    try {
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));
      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = sentenceFor(vId, "Original.");
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
      await repo.markPublished(publishStoryVersion(v, clock));

      await assert.rejects(
        () => db.query("UPDATE story_versions SET text = $2 WHERE id = $1", [vId, "Tampered."]),
        /STORY_VERSION_TEXT_IMMUTABLE/,
      );
    } finally {
      await db.close();
    }
  });

  test("saving a version under an id that already exists is rejected, not merged", async () => {
    const { db, repo } = await freshRepository();
    try {
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));
      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = sentenceFor(vId, "Texto.");
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
      await assert.rejects(() => repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] }));
    } finally {
      await db.close();
    }
  });

  test("listOccurrences/getOccurrence expose what saveNewVersion stored, including discontinuous parts", async () => {
    const { db, repo } = await freshRepository();
    try {
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));
      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = sentenceFor(vId, "hola mundo");
      const anchorA = createTextAnchor(asId("TextAnchorId", "anchor-1"), vId, sentence, { start: 0, end: 4 });
      const anchorB = createTextAnchor(asId("TextAnchorId", "anchor-2"), vId, sentence, { start: 5, end: 10 });
      const occurrence = createLexicalOccurrence({
        id: asId("StoryOccurrenceId", "occ-1"),
        storyVersionId: vId,
        sentenceId: sentence.id,
        surface: "hola mundo",
        lexemeId: "LEX-TEST-000001" as never,
        senseId: null,
        lexemeFormId: null,
        senseResolutionStatus: "NOT_REQUIRED",
        parts: [
          { id: asId("OccurrencePartId", "part-1"), anchor: anchorA, role: "HEAD" },
          { id: asId("OccurrencePartId", "part-2"), anchor: anchorB, role: "FIXED" },
        ],
      });
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [anchorA, anchorB], occurrences: [occurrence], targetBindings: [] });

      const reread = await repo.getOccurrence(occurrence.id);
      assert.deepEqual(reread, occurrence);
      assert.equal((await repo.listOccurrences(vId)).length, 1);
      assert.equal((await repo.listSentences(vId)).length, 1);
      assert.equal((await repo.listAnchors(vId)).length, 2);
    } finally {
      await db.close();
    }
  });

  test("appendAnnotationRevision/listAnnotationRevisions is append-only in practice", async () => {
    const { db, repo } = await freshRepository();
    try {
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));
      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = sentenceFor(vId, "hola");
      const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), vId, sentence, { start: 0, end: 4 });
      const occurrence = createLexicalOccurrence({
        id: asId("StoryOccurrenceId", "occ-1"),
        storyVersionId: vId,
        sentenceId: sentence.id,
        surface: "hola",
        lexemeId: "LEX-TEST-000001" as never,
        senseId: null,
        lexemeFormId: null,
        senseResolutionStatus: "NOT_REQUIRED",
        parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
      });
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });

      await repo.appendAnnotationRevision({
        id: asId("OccurrenceAnnotationRevisionId", "rev-1"),
        occurrenceId: occurrence.id,
        previousLexemeId: "LEX-TEST-000001" as never,
        newLexemeId: "LEX-TEST-000001" as never,
        previousSenseId: null,
        newSenseId: null,
        reason: "first",
        lexiconReleaseId: "A1-LEXICON-v1.0" as never,
        editorialReference: null,
        createdAt: clock.now().toISOString(),
      });
      assert.equal((await repo.listAnnotationRevisions(occurrence.id)).length, 1);
    } finally {
      await db.close();
    }
  });

  test("a failed construction never reaches the repository: corruption produces no partial write", async () => {
    const { db, repo } = await freshRepository();
    try {
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
          lexemeId: "LEX-TEST-000001" as never,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "NOT_REQUIRED",
          parts: [
            { id: asId("OccurrencePartId", "part-1"), anchor: a, role: "HEAD" },
            { id: asId("OccurrencePartId", "part-2"), anchor: b, role: "FIXED" },
          ],
        }),
      );
      const storyId = asId("StoryId", "story-1");
      assert.equal((await repo.listVersions(storyId)).length, 0);
    } finally {
      await db.close();
    }
  });
});
