/**
 * CLI: migrate an empty (or partially migrated) database, then seed it from
 * the canonical A1 registry. Node-only.
 *
 * Usage:
 *   npm run db:setup                    # in-memory, ephemeral (for a quick check)
 *   npm run db:setup -- ./data/spanstories-db   # persists to that directory
 */

import { loadCurriculumRegistry } from "../../features/curriculum/index.ts";
import { loadLexicalEngine } from "../../features/lexical-engine/index.ts";
import { migrate, openPGliteDatabase, seedCurriculum } from "../../features/persistence/index.ts";

async function main(): Promise<void> {
  const dataDir = process.argv[2];
  const db = await openPGliteDatabase({ dataDir });

  const migration = await migrate(db);
  console.log(`migrations applied: ${migration.applied.length > 0 ? migration.applied.join(", ") : "(none — already up to date)"}`);

  const registry = loadCurriculumRegistry();
  const lexicalEngine = loadLexicalEngine();
  const result = await seedCurriculum(db, registry, lexicalEngine);

  console.log(`seeded ${result.curriculumReleaseId} / ${result.lexiconReleaseId}`);
  console.log(JSON.stringify(result.counts, null, 2));

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
