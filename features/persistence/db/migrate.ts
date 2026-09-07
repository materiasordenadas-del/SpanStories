/**
 * Apply `db/migrations/*.sql` in filename order, tracked in
 * `schema_migrations` so a second run is a no-op (section 51 of the
 * governing plan: "empty database -> migrate -> seed -> run tests" must
 * work, and migrations must be idempotent).
 *
 * Migrations are plain, standard PostgreSQL DDL — nothing here is
 * PGlite-specific. If a migration ever needs a WASM-only workaround, that is
 * `BLOCKER_PGLITE_PORTABILITY` and must be reported, not hidden (per the
 * authorization for this phase — see `docs/persistence.md`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SqlDatabase } from "./sql-client.ts";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations",
);

export function listMigrationFiles(): readonly string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export type MigrationResult = {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
};

export async function migrate(db: SqlDatabase): Promise<MigrationResult> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const already = await db.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const appliedSet = new Set(already.rows.map((r) => r.filename));

  const applied: string[] = [];
  for (const filename of listMigrationFiles()) {
    if (appliedSet.has(filename)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });
    applied.push(filename);
  }

  return { applied, alreadyApplied: [...appliedSet] };
}
