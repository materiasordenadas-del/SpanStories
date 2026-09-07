import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate, listMigrationFiles } from "../db/migrate.ts";

describe("persistence / migrations", () => {
  test("an empty database migrates cleanly", async () => {
    const db = await openPGliteDatabase();
    try {
      const result = await migrate(db);
      assert.deepEqual([...result.applied].sort(), [...listMigrationFiles()].sort());
      assert.deepEqual(result.alreadyApplied, []);
    } finally {
      await db.close();
    }
  });

  test("every expected table exists after migration", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      );
      const names = tables.rows.map((r) => r.table_name);
      for (const expected of [
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
      ]) {
        assert.ok(names.includes(expected), `missing table ${expected}`);
      }
    } finally {
      await db.close();
    }
  });

  test("migrations are idempotent: running twice applies nothing new the second time", async () => {
    const db = await openPGliteDatabase();
    try {
      const first = await migrate(db);
      assert.ok(first.applied.length > 0);
      const second = await migrate(db);
      assert.deepEqual(second.applied, []);
      assert.deepEqual([...second.alreadyApplied].sort(), [...listMigrationFiles()].sort());
    } finally {
      await db.close();
    }
  });
});
