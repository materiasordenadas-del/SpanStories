import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  asId,
  assembleStoryVersion,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
} from "../../story-engine/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";

class FixedClock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

describe("persistence / corruption must fail loudly", () => {
  test("a dangling foreign key (StoryVersion naming an unknown Story) is rejected", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      await assert.rejects(
        () =>
          db.query(
            "INSERT INTO story_versions (id, story_id, version_number, title, text, status, created_at, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            ["storyver-x", "story-does-not-exist", 1, "T", "text", "DRAFT", new Date().toISOString(), null],
          ),
        /foreign key/i,
      );
    } finally {
      await db.close();
    }
  });

  test("a duplicate (story_id, version_number) is rejected by the unique constraint", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const repo = new PostgresStoryRepository(db);
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));
      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = { id: asId("SentenceId", "sent-1"), storyVersionId: vId, order: 1, text: "hola", tokens: [] };
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
      await repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });

      // Same story, same version_number, different id — the unique constraint
      // must catch this even though the primary key differs.
      const vId2 = asId("StoryVersionId", "storyver-2");
      const v2 = { ...v, id: vId2 };
      await assert.rejects(() =>
        db.query(
          "INSERT INTO story_versions (id, story_id, version_number, title, text, status, created_at, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [v2.id, v2.storyId, v2.versionNumber, v2.title, v2.text, v2.status, v2.createdAt, v2.publishedAt],
        ),
      );
    } finally {
      await db.close();
    }
  });

  test("a corrupt saveNewVersion call rolls back completely: no sentence, anchor or occurrence survives", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const repo = new PostgresStoryRepository(db);
      const clock = new FixedClock();
      const storyId = asId("StoryId", "story-1");
      await repo.saveStory(createStory(storyId, null, clock));

      const vId = asId("StoryVersionId", "storyver-1");
      const sentence = { id: asId("SentenceId", "sent-1"), storyVersionId: vId, order: 1, text: "hola", tokens: [] };
      const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), vId, sentence, { start: 0, end: 4 });
      // References a lexeme that was never inserted -> the occurrence insert
      // fails on its FK, and the whole saveNewVersion transaction must roll
      // back, including the sentence and anchor rows that "succeeded" first.
      const occurrence = createLexicalOccurrence({
        id: asId("StoryOccurrenceId", "occ-1"),
        storyVersionId: vId,
        sentenceId: sentence.id,
        surface: "hola",
        lexemeId: "LEX-DOES-NOT-EXIST" as never,
        senseId: null,
        lexemeFormId: null,
        senseResolutionStatus: "NOT_REQUIRED",
        parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
      });
      const v = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });

      await assert.rejects(() =>
        repo.saveNewVersion({ version: v, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] }),
      );

      const versions = await db.query("SELECT * FROM story_versions WHERE id = $1", [vId]);
      const sentences = await db.query("SELECT * FROM story_sentences WHERE story_version_id = $1", [vId]);
      const anchors = await db.query("SELECT * FROM text_anchors WHERE story_version_id = $1", [vId]);
      assert.equal(versions.rows.length, 0, "the version itself must not have been committed");
      assert.equal(sentences.rows.length, 0, "the sentence must not have survived the rollback");
      assert.equal(anchors.rows.length, 0, "the anchor must not have survived the rollback");
    } finally {
      await db.close();
    }
  });
});
