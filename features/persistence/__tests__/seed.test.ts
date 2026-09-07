import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { loadLexicalEngine } from "../../lexical-engine/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { seedCurriculum } from "../seed/seed-curriculum.ts";

const registry = loadCurriculumRegistry();
const lexicalEngine = loadLexicalEngine();

describe("persistence / seed", () => {
  test("seeding the v1.51 release produces the exact published counts", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const result = await seedCurriculum(db, registry, lexicalEngine);

      assert.equal(result.curriculumReleaseId, "A1-CURRICULUM-v1.51");
      assert.equal(result.lexiconReleaseId, "A1-LEXICON-v1.0");
      assert.equal(result.counts.modules, 8);
      assert.equal(result.counts.islands, 11);
      assert.equal(result.counts.storyBlueprints, 32);
      assert.equal(result.counts.recycleEdges, 2867);
      assert.equal(result.counts.lexemes, 599);
      assert.equal(result.counts.lexemeForms, 666);
      assert.equal(result.counts.senses, 608);
      assert.equal(result.counts.mwuUnits, 214);
      assert.equal(result.counts.grammarUnits, 169);

      const targetsCount = await db.query<{ count: string }>("SELECT count(*)::text FROM curriculum_targets");
      assert.equal(targetsCount.rows[0].count, "985");

      const focusCount = await db.query<{ count: string }>(
        "SELECT count(*)::text FROM curriculum_targets WHERE intro_salience = 'FOCUS'",
      );
      assert.equal(focusCount.rows[0].count, "448");
      const supportedCount = await db.query<{ count: string }>(
        "SELECT count(*)::text FROM curriculum_targets WHERE intro_salience = 'SUPPORTED'",
      );
      assert.equal(supportedCount.rows[0].count, "537");

      const a1Senses = await db.query<{ count: string }>("SELECT count(*)::text FROM senses WHERE is_a1 = true");
      assert.equal(a1Senses.rows[0].count, "602");
      const a2Senses = await db.query<{ count: string }>("SELECT count(*)::text FROM senses WHERE is_a1 = false");
      assert.equal(a2Senses.rows[0].count, "6");
    } finally {
      await db.close();
    }
  });

  test("a duplicate published id is rejected by the primary key, not silently overwritten", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      await seedCurriculum(db, registry, lexicalEngine);
      await assert.rejects(
        () => db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", ["LEX-A1-000001", "dup", "ATOMIC", "{}"]),
        /duplicate key|unique/i,
      );
    } finally {
      await db.close();
    }
  });

  test("a dangling foreign key is rejected", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      await assert.rejects(
        () => db.query("INSERT INTO senses (id, lexeme_id, status, is_a1, data) VALUES ($1, $2, $3, $4, $5)", ["SENSE-X", "LEX-DOES-NOT-EXIST", "A1_CORE_NORMATIVE", true, "{}"]),
        /foreign key/i,
      );
    } finally {
      await db.close();
    }
  });

  test("a failed seed leaves no partial data: transaction rollback", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      // Seed once for real, then attempt a second seed of the same release,
      // which must fail on the very first (curriculum_releases PK) row —
      // proving nothing from the second attempt's lexical inserts survives.
      await seedCurriculum(db, registry, lexicalEngine);
      await assert.rejects(() => seedCurriculum(db, registry, lexicalEngine));

      const lexemeCount = await db.query<{ count: string }>("SELECT count(*)::text FROM lexemes");
      assert.equal(lexemeCount.rows[0].count, "599", "the second, failed seed must not have inserted a second copy of the lexemes");
    } finally {
      await db.close();
    }
  });
});
