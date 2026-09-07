import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  asId,
  assembleStoryVersion,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
} from "../../story-engine/index.ts";
import { asId as asLearnerId, recordOccurrenceOpened, recordStateDeclared } from "../../learner-progress/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";
import { PostgresLearnerEventRepository } from "../repository/postgres-learner-event-repository.ts";

class FixedClock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

const learnerId = asLearnerId("LearnerId", "learner-1");
const otherLearnerId = asLearnerId("LearnerId", "learner-2");

async function freshRepository() {
  const db = await openPGliteDatabase();
  await migrate(db);
  await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-TEST-000001", "test", "ATOMIC", "{}"]);
  await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-TEST-000002", "test2", "ATOMIC", "{}"]);
  await db.query("INSERT INTO learners (id) VALUES ($1), ($2)", [learnerId, otherLearnerId]);

  const storyRepo = new PostgresStoryRepository(db);
  const clock = new FixedClock();
  const storyId = asId("StoryId", "story-1");
  await storyRepo.saveStory(createStory(storyId, null, clock));
  const storyVersionId = asId("StoryVersionId", "storyver-1");
  const sentence = { id: asId("SentenceId", "sent-1"), storyVersionId, order: 1, text: "hola", tokens: [] };
  const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, sentence, { start: 0, end: 4 });
  const occurrence = createLexicalOccurrence({
    id: asId("StoryOccurrenceId", "occ-1"),
    storyVersionId,
    sentenceId: sentence.id,
    surface: "hola",
    lexemeId: "LEX-TEST-000001" as never,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "UNRESOLVED",
    parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
  });
  const version = assembleStoryVersion({ id: storyVersionId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
  await storyRepo.saveNewVersion({ version, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });

  return { db, repo: new PostgresLearnerEventRepository(db), storyId, storyVersionId, occurrenceId: occurrence.id };
}

function makeEvent(
  ctx: Awaited<ReturnType<typeof freshRepository>>,
  eventId: string,
  learner = learnerId,
  lexemeId = "LEX-TEST-000001",
) {
  return recordStateDeclared(
    {
      eventId: asLearnerId("LearnerEventId", eventId),
      learnerId: learner,
      storyId: ctx.storyId,
      storyVersionId: ctx.storyVersionId,
      curriculumReleaseId: "A1-CURRICULUM-v1.51",
      lexiconReleaseId: "A1-LEXICON-v1.0" as never,
      occurrenceId: null,
      recordedLexemeId: lexemeId as never,
      recordedSenseId: null,
      declaredState: "LEARNING",
    },
    new FixedClock(),
  );
}

describe("persistence / PostgresLearnerEventRepository contract", () => {
  test("append then getById round-trips", async () => {
    const ctx = await freshRepository();
    try {
      const event = makeEvent(ctx, "levt-1");
      await ctx.repo.append(event);
      assert.deepEqual(await ctx.repo.getById(event.eventId), event);
    } finally {
      await ctx.db.close();
    }
  });

  test("an unknown id is null, not undefined", async () => {
    const ctx = await freshRepository();
    try {
      assert.equal(await ctx.repo.getById(asLearnerId("LearnerEventId", "levt-missing") as never), null);
    } finally {
      await ctx.db.close();
    }
  });

  test("a raw UPDATE against learner_events is rejected by the database trigger (append-only)", async () => {
    const ctx = await freshRepository();
    try {
      const event = makeEvent(ctx, "levt-1");
      await ctx.repo.append(event);
      await assert.rejects(
        () => ctx.db.query("UPDATE learner_events SET declared_state = 'KNOWN' WHERE event_id = $1", [event.eventId]),
        /LEARNER_EVENT_APPEND_ONLY/,
      );
    } finally {
      await ctx.db.close();
    }
  });

  test("a raw DELETE against learner_events is rejected by the database trigger (append-only)", async () => {
    const ctx = await freshRepository();
    try {
      const event = makeEvent(ctx, "levt-1");
      await ctx.repo.append(event);
      await assert.rejects(
        () => ctx.db.query("DELETE FROM learner_events WHERE event_id = $1", [event.eventId]),
        /LEARNER_EVENT_APPEND_ONLY/,
      );
    } finally {
      await ctx.db.close();
    }
  });

  test("listForLearner only returns that learner's events", async () => {
    const ctx = await freshRepository();
    try {
      const mine = makeEvent(ctx, "levt-1", learnerId);
      const theirs = makeEvent(ctx, "levt-2", otherLearnerId);
      await ctx.repo.append(mine);
      await ctx.repo.append(theirs);
      const result = await ctx.repo.listForLearner(learnerId);
      assert.equal(result.length, 1);
      assert.equal(result[0].eventId, mine.eventId);
    } finally {
      await ctx.db.close();
    }
  });

  test("listForLearnerAndLexeme filters on both", async () => {
    const ctx = await freshRepository();
    try {
      const a = makeEvent(ctx, "levt-1", learnerId, "LEX-TEST-000001");
      const b = makeEvent(ctx, "levt-2", learnerId, "LEX-TEST-000002");
      await ctx.repo.append(a);
      await ctx.repo.append(b);
      const result = await ctx.repo.listForLearnerAndLexeme(learnerId, "LEX-TEST-000001" as never);
      assert.equal(result.length, 1);
      assert.equal(result[0].eventId, a.eventId);
    } finally {
      await ctx.db.close();
    }
  });

  test("listForStoryVersion returns every event on that version", async () => {
    const ctx = await freshRepository();
    try {
      const event = makeEvent(ctx, "levt-1");
      await ctx.repo.append(event);
      const result = await ctx.repo.listForStoryVersion(ctx.storyVersionId);
      assert.equal(result.length, 1);
    } finally {
      await ctx.db.close();
    }
  });

  test("an OCCURRENCE_OPENED event with a null recorded lexeme (UNRESOLVED) round-trips", async () => {
    const ctx = await freshRepository();
    try {
      const event = recordOccurrenceOpened(
        {
          eventId: asLearnerId("LearnerEventId", "levt-1"),
          learnerId,
          storyId: ctx.storyId,
          storyVersionId: ctx.storyVersionId,
          curriculumReleaseId: "A1-CURRICULUM-v1.51",
          lexiconReleaseId: "A1-LEXICON-v1.0" as never,
          occurrenceId: ctx.occurrenceId,
          recordedLexemeId: null,
          recordedSenseId: null,
          recordedFormId: null,
        },
        new FixedClock(),
      );
      await ctx.repo.append(event);
      const reread = await ctx.repo.getById(event.eventId);
      assert.equal(reread?.recordedLexemeId, null);
      assert.equal(reread?.occurrenceId, ctx.occurrenceId);
    } finally {
      await ctx.db.close();
    }
  });
});
