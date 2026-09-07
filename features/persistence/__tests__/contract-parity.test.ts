/**
 * One shared assertion suite, run against `InMemoryStoryRepository` /
 * `InMemoryLearnerEventRepository` and their PostgreSQL counterparts here —
 * the literal "in-memory adapter contract == Postgres adapter contract"
 * check section 47/52 of the governing plan asks for, rather than two
 * independently-written test files that merely look similar.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  asId,
  assembleStoryVersion,
  createStory,
  InMemoryStoryRepository,
  type StoryRepository,
} from "../../story-engine/index.ts";
import {
  asId as asLearnerId,
  InMemoryLearnerEventRepository,
  recordStateDeclared,
  type LearnerEventRepository,
} from "../../learner-progress/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";
import { PostgresLearnerEventRepository } from "../repository/postgres-learner-event-repository.ts";

class FixedClock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

async function assertStoryRepositoryContract(repo: StoryRepository): Promise<void> {
  const clock = new FixedClock();
  const storyId = asId("StoryId", "story-parity-1");
  assert.equal(await repo.getStory(storyId), null);

  const story = createStory(storyId, null, clock);
  await repo.saveStory(story);
  assert.deepEqual(await repo.getStory(storyId), story);

  const vId = asId("StoryVersionId", "storyver-parity-1");
  const sentence = { id: asId("SentenceId", "sent-parity-1"), storyVersionId: vId, order: 1, text: "hola", tokens: [] };
  const version = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
  await repo.saveNewVersion({ version, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });

  assert.equal((await repo.listVersions(storyId)).length, 1);
  assert.equal(await repo.getPublishedVersion(storyId), null);
  assert.equal((await repo.listSentences(vId)).length, 1);
}

async function assertLearnerEventRepositoryContract(repo: LearnerEventRepository, seedFk: (storyVersionId: string) => Promise<void>): Promise<void> {
  const learnerId = asLearnerId("LearnerId", "learner-parity-1");
  const storyVersionId = asId("StoryVersionId", "storyver-parity-2") as never;
  await seedFk(storyVersionId as unknown as string);

  const event = recordStateDeclared(
    {
      eventId: asLearnerId("LearnerEventId", "levt-parity-1"),
      learnerId,
      storyId: asId("StoryId", "story-parity-2") as never,
      storyVersionId,
      curriculumReleaseId: "A1-CURRICULUM-v1.51",
      lexiconReleaseId: "A1-LEXICON-v1.0" as never,
      occurrenceId: null,
      recordedLexemeId: "LEX-TEST-000001" as never,
      recordedSenseId: null,
      declaredState: "LEARNING",
    },
    new FixedClock(),
  );

  assert.equal(await repo.getById(event.eventId), null);
  await repo.append(event);
  assert.deepEqual(await repo.getById(event.eventId), event);
  assert.equal((await repo.listForLearner(learnerId)).length, 1);
  assert.equal((await repo.listForLearnerAndLexeme(learnerId, "LEX-TEST-000001" as never)).length, 1);
  assert.equal((await repo.listForStoryVersion(storyVersionId)).length, 1);
  await assert.rejects(() => repo.append(event), /DUPLICATE_LEARNER_EVENT_ID/);
}

describe("persistence / contract parity (in-memory vs PostgreSQL)", () => {
  test("StoryRepository: InMemory and PostgreSQL satisfy the identical contract", async () => {
    await assertStoryRepositoryContract(new InMemoryStoryRepository());

    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      await assertStoryRepositoryContract(new PostgresStoryRepository(db));
    } finally {
      await db.close();
    }
  });

  test("LearnerEventRepository: InMemory and PostgreSQL satisfy the identical contract", async () => {
    await assertLearnerEventRepositoryContract(new InMemoryLearnerEventRepository(), async () => {});

    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-TEST-000001", "test", "ATOMIC", "{}"]);
      await db.query("INSERT INTO learners (id) VALUES ($1)", ["learner-parity-1"]);
      const storyRepo = new PostgresStoryRepository(db);
      await assertLearnerEventRepositoryContract(new PostgresLearnerEventRepository(db), async (storyVersionId) => {
        const clock = new FixedClock();
        const storyId = asId("StoryId", "story-parity-2");
        await storyRepo.saveStory(createStory(storyId, null, clock));
        const vId = storyVersionId as never;
        const sentence = { id: asId("SentenceId", "sent-parity-2"), storyVersionId: vId, order: 1, text: "hola", tokens: [] };
        const version = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
        await storyRepo.saveNewVersion({ version, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
      });
    } finally {
      await db.close();
    }
  });
});
