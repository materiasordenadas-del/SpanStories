import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { loadLexicalEngine } from "../../lexical-engine/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { seedCurriculum } from "../seed/seed-curriculum.ts";

const registry = loadCurriculumRegistry();
const lexicalEngine = loadLexicalEngine();

/**
 * Same canonical registry seed -> same logical DB content.
 *
 * `created_at` on `curriculum_releases`/`lexicon_releases` defaults to
 * `now()` at insert time and is the only column allowed to differ between
 * two seeds, mirroring `CurriculumRelease.generatedAt`'s exclusion from
 * `contentHash` in phase 1 — everything else (every row's `data`, every
 * promoted column, every count) must match exactly.
 */
async function dumpTable(db: Awaited<ReturnType<typeof openPGliteDatabase>>, table: string, orderBy: string) {
  const result = await db.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
  return result.rows.map((row) =>
    Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([key]) => key !== "created_at")),
  );
}

describe("persistence / determinism", () => {
  test("two independent seeds of the same release produce the same logical content", async () => {
    const dbA = await openPGliteDatabase();
    const dbB = await openPGliteDatabase();
    try {
      await migrate(dbA);
      await migrate(dbB);
      await seedCurriculum(dbA, registry, lexicalEngine);
      await seedCurriculum(dbB, registry, lexicalEngine);

      for (const [table, orderBy] of [
        ["lexemes", "id"],
        ["lexeme_forms", "id"],
        ["senses", "id"],
        ["mwu_units", "id"],
        ["grammar_units", "id"],
        ["modules", "id"],
        ["islands", "id"],
        ["story_blueprints", "id"],
        ["curriculum_targets", "allocation_id"],
        ["recycle_edges", "id"],
      ] as const) {
        const a = await dumpTable(dbA, table, orderBy);
        const b = await dumpTable(dbB, table, orderBy);
        assert.deepEqual(a, b, `table ${table} diverged between two seeds of the same release`);
      }
    } finally {
      await dbA.close();
      await dbB.close();
    }
  });
});
