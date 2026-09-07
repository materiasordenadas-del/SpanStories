/**
 * One reusable contract suite for `SqlDatabase`, registered against whatever
 * `openDb` factory it is handed — the literal "same function validates both"
 * PGlite and a real networked PostgreSQL server asks for (§16-18 of the
 * governing brief), not two independently written test files that merely
 * look similar (same convention as
 * `../__tests__/contract-parity.test.ts`'s in-memory/PostgreSQL parity).
 *
 * `openDb` must hand back a **fresh, empty** database on every call —
 * `openPGliteDatabase` already satisfies this trivially (a brand-new
 * in-memory instance); `../testing/server-parity.ts`'s
 * `openIsolatedTestDatabase` satisfies it against a real server by creating
 * (and, on `close()`, dropping) a randomly-named schema per call. This
 * function never creates or drops a schema itself — it only ever calls
 * `openDb()`/`db.close()`, so it has no idea, and does not need to know,
 * whether a schema is involved at all.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { loadLexicalEngine } from "../../lexical-engine/index.ts";
import {
  asId,
  assembleStoryVersion,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
  type StoryRepository,
} from "../../story-engine/index.ts";
import { asId as asLearnerId, recordStateDeclared, type LearnerEventRepository } from "../../learner-progress/index.ts";
import { migrate, listMigrationFiles } from "../db/migrate.ts";
import { seedCurriculum } from "../seed/seed-curriculum.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";
import { PostgresLearnerEventRepository } from "../repository/postgres-learner-event-repository.ts";
import type { SqlDatabase } from "../db/sql-client.ts";

class FixedClock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

const EXPECTED_TABLES = [
  "curriculum_releases",
  "modules",
  "islands",
  "story_blueprints",
  "curriculum_targets",
  "recycle_edges",
  "lexicon_releases",
  "lexemes",
  "lexeme_forms",
  "senses",
  "mwu_units",
  "grammar_units",
  "source_assertions",
  "lexeme_lineage_events",
  "stories",
  "story_versions",
  "story_sentences",
  "text_anchors",
  "story_occurrences",
  "occurrence_parts",
  "occurrence_annotation_revisions",
  "story_target_bindings",
  "learners",
  "learner_events",
  "schema_migrations",
] as const;

async function assertStoryRepositoryContract(db: SqlDatabase, repo: StoryRepository): Promise<void> {
  const clock = new FixedClock();
  const storyId = asId("StoryId", "story-suite-1");
  assert.equal(await repo.getStory(storyId), null);

  const story = createStory(storyId, null, clock);
  await repo.saveStory(story);
  assert.deepEqual(await repo.getStory(storyId), story);

  const vId = asId("StoryVersionId", "storyver-suite-1");
  const sentence = { id: asId("SentenceId", "sent-suite-1"), storyVersionId: vId, order: 1, text: "hola mundo", tokens: [] };
  const anchor = createTextAnchor(asId("TextAnchorId", "anchor-suite-1"), vId, sentence, { start: 0, end: 4 });
  const occurrence = createLexicalOccurrence({
    id: asId("StoryOccurrenceId", "occ-suite-1"),
    storyVersionId: vId,
    sentenceId: sentence.id,
    surface: "hola",
    lexemeId: "LEX-SUITE-000001" as never,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "NOT_REQUIRED",
    parts: [{ id: asId("OccurrencePartId", "part-suite-1"), anchor, role: "HEAD" }],
  });
  const version = assembleStoryVersion({ id: vId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });

  // The occurrence names a lexeme this suite never inserted — proves the
  // insert is rejected (FK) and, crucially, that the whole saveNewVersion
  // transaction rolls back: nothing partial survives.
  await assert.rejects(() =>
    repo.saveNewVersion({ version, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] }),
  );
  assert.equal((await db.query("SELECT 1 FROM story_versions WHERE id = $1", [vId])).rows.length, 0);

  await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-SUITE-000001", "hola", "ATOMIC", "{}"]);
  await repo.saveNewVersion({ version, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });
  assert.equal((await repo.listVersions(storyId)).length, 1);
  assert.equal(await repo.getPublishedVersion(storyId), null);
  assert.equal((await repo.listOccurrences(vId)).length, 1);

  await assert.rejects(() =>
    repo.saveNewVersion({ version, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] }),
  );
}

async function assertLearnerEventRepositoryContract(db: SqlDatabase, repo: LearnerEventRepository): Promise<void> {
  await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-SUITE-000002", "adios", "ATOMIC", "{}"]);
  await db.query("INSERT INTO learners (id) VALUES ($1)", ["learner-suite-1"]);
  const storyRepo = new PostgresStoryRepository(db);
  const clock = new FixedClock();
  const storyId = asId("StoryId", "story-suite-2");
  const storyVersionId = asId("StoryVersionId", "storyver-suite-2");
  await storyRepo.saveStory(createStory(storyId, null, clock));
  const sentence = { id: asId("SentenceId", "sent-suite-2"), storyVersionId, order: 1, text: "hola", tokens: [] };
  const version = assembleStoryVersion({ id: storyVersionId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
  await storyRepo.saveNewVersion({ version, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });

  const learnerId = asLearnerId("LearnerId", "learner-suite-1");
  const event = recordStateDeclared(
    {
      eventId: asLearnerId("LearnerEventId", "levt-suite-1"),
      learnerId,
      storyId,
      storyVersionId,
      curriculumReleaseId: "A1-CURRICULUM-v1.51",
      lexiconReleaseId: "A1-LEXICON-v1.0" as never,
      occurrenceId: null,
      recordedLexemeId: "LEX-SUITE-000002" as never,
      recordedSenseId: null,
      declaredState: "LEARNING",
    },
    clock,
  );

  assert.equal(await repo.getById(event.eventId), null);
  await repo.append(event);
  assert.deepEqual(await repo.getById(event.eventId), event);
  assert.equal((await repo.listForLearner(learnerId)).length, 1);
  assert.equal((await repo.listForLearnerAndLexeme(learnerId, "LEX-SUITE-000002" as never)).length, 1);
  assert.equal((await repo.listForStoryVersion(storyVersionId)).length, 1);
  await assert.rejects(() => repo.append(event), /DUPLICATE_LEARNER_EVENT_ID/);

  // Append-only in the database itself, not only through the interface:
  // a raw UPDATE/DELETE must be rejected by trigger, on either backend.
  await assert.rejects(() => db.query("UPDATE learner_events SET recorded_lexeme_id = $1 WHERE id = $2", ["LEX-SUITE-000002", event.eventId]));
  await assert.rejects(() => db.query("DELETE FROM learner_events WHERE id = $1", [event.eventId]));
}

/**
 * Register the full suite under `describeName`, calling `openDb()` fresh for
 * every `test()` and always `close()`-ing afterward — same shape as every
 * existing `openPGliteDatabase()`-per-test file in `../__tests__/`.
 */
export function registerDatabaseContractSuite(describeName: string, openDb: () => Promise<SqlDatabase>): void {
  describe(describeName, () => {
    test("migrations: an empty database migrates cleanly, idempotently, with every expected table", async () => {
      const db = await openDb();
      try {
        const first = await migrate(db);
        assert.deepEqual([...first.applied].sort(), [...listMigrationFiles()].sort());
        assert.deepEqual(first.alreadyApplied, []);

        const second = await migrate(db);
        assert.deepEqual(second.applied, [], "a second migrate() call must apply nothing new");

        for (const table of EXPECTED_TABLES) {
          const result = await db.query<{ exists: boolean }>("SELECT to_regclass($1) IS NOT NULL AS exists", [table]);
          assert.ok(result.rows[0]?.exists, `missing table ${table}`);
        }
      } finally {
        await db.close();
      }
    });

    test("seed: the v1.51 release seeds with the exact published counts", async () => {
      const db = await openDb();
      try {
        await migrate(db);
        const registry = loadCurriculumRegistry();
        const lexicalEngine = loadLexicalEngine();
        const result = await seedCurriculum(db, registry, lexicalEngine);

        assert.equal(result.curriculumReleaseId, "A1-CURRICULUM-v1.51");
        assert.equal(result.counts.storyBlueprints, 32);
        assert.equal(result.counts.mwuUnits, 214);
        assert.equal(result.counts.grammarUnits, 169);

        const targets = await db.query<{ count: string }>("SELECT count(*)::text FROM curriculum_targets");
        assert.equal(targets.rows[0].count, "985");

        // Seeding the same release a second time must fail on the very first
        // (curriculum_releases PK) row and leave no partial second copy.
        await assert.rejects(() => seedCurriculum(db, registry, lexicalEngine));
        const lexemes = await db.query<{ count: string }>("SELECT count(*)::text FROM lexemes");
        assert.equal(lexemes.rows[0].count, "599");
      } finally {
        await db.close();
      }
    });

    test("StoryRepository contract: round-trip, referential integrity, no partial write on corruption", async () => {
      const db = await openDb();
      try {
        await migrate(db);
        await assertStoryRepositoryContract(db, new PostgresStoryRepository(db));
      } finally {
        await db.close();
      }
    });

    test("LearnerEventRepository contract: append-only by interface and by trigger", async () => {
      const db = await openDb();
      try {
        await migrate(db);
        await assertLearnerEventRepositoryContract(db, new PostgresLearnerEventRepository(db));
      } finally {
        await db.close();
      }
    });

    test("transactions: a thrown error inside db.transaction rolls back every statement in it", async () => {
      const db = await openDb();
      try {
        await migrate(db);
        await assert.rejects(() =>
          db.transaction(async (tx) => {
            await tx.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-SUITE-TX", "x", "ATOMIC", "{}"]);
            throw new Error("INTENTIONAL_ROLLBACK_TRIGGER");
          }),
        );
        const rows = await db.query("SELECT 1 FROM lexemes WHERE id = $1", ["LEX-SUITE-TX"]);
        assert.equal(rows.rows.length, 0, "a statement inside a rolled-back transaction must not be visible afterward");
      } finally {
        await db.close();
      }
    });

    test("transactions: a committed transaction's statements are visible afterward", async () => {
      const db = await openDb();
      try {
        await migrate(db);
        await db.transaction(async (tx) => {
          await tx.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-SUITE-TX2", "y", "ATOMIC", "{}"]);
        });
        const rows = await db.query("SELECT 1 FROM lexemes WHERE id = $1", ["LEX-SUITE-TX2"]);
        assert.equal(rows.rows.length, 1);
      } finally {
        await db.close();
      }
    });
  });
}
