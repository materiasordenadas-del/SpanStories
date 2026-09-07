/**
 * Public contract of the persistence layer (engine phase 5).
 *
 * Downstream code should import from here rather than reaching into `db/`,
 * `repository/` or `seed/` directly.
 *
 * Phase 5 scope: PostgreSQL-backed implementations of
 * `features/story-engine`'s `StoryRepository` and
 * `features/learner-progress`'s `LearnerEventRepository`, SQL migrations,
 * and a seed importer from the canonical curriculum registry. The database
 * chosen for this phase is `@electric-sql/pglite` (real PostgreSQL compiled
 * to WASM, embedded in-process) — see `docs/persistence.md` for why, and for
 * `POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`, the explicit
 * list of what this phase does not prove about a networked server.
 */

export type { SqlClient, SqlDatabase, SqlResult } from "./db/sql-client.ts";
export { openPGliteDatabase, type PGliteDatabaseOptions } from "./db/pglite-database.ts";
export { openPgServerDatabase, type PgServerDatabaseOptions } from "./db/pg-server-database.ts";
export { migrate, listMigrationFiles, type MigrationResult } from "./db/migrate.ts";

export { seedCurriculum, type SeedResult } from "./seed/seed-curriculum.ts";

export { PostgresStoryRepository, insertAnnotationRevisionRow } from "./repository/postgres-story-repository.ts";
export { PostgresLearnerEventRepository } from "./repository/postgres-learner-event-repository.ts";
export { insertLineageEvent } from "./repository/lineage-repository.ts";
export { PostgresAnnotationDecisionRepository, insertDecisionRow } from "./repository/postgres-annotation-decision-repository.ts";
export { PostgresAnnotationAcceptanceUnitOfWork } from "./repository/postgres-annotation-acceptance-unit-of-work.ts";
export { PostgresCurrentStoryVersionResolver } from "./repository/postgres-current-story-version-resolver.ts";
