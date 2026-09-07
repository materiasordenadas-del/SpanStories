# Persistence feature (engine phase 5)

PostgreSQL repositories, SQL migrations and a seed importer for the domain
contracts phases 1-4 already defined. See `docs/persistence.md` for the
full design rationale (including why `@electric-sql/pglite`, and
`POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`) and
`docs/data-model.md` for the schema; this file is the short orientation.

## Public boundary

Import from [`index.ts`](./index.ts). The file layout below it (`db/`,
`repository/`, `seed/`) is not a contract.

## What phase 5 is

```text
db/migrations/*.sql          plain, versioned PostgreSQL DDL
        |
        v
features/persistence/db/migrate.ts    applies them, tracked in schema_migrations
        |
        v
features/persistence/seed/seed-curriculum.ts
        (canonical registry -> DB, one transaction, exact published counts)
        |
        v
PostgresStoryRepository / PostgresLearnerEventRepository
        (implement features/story-engine's / features/learner-progress's
         own repository interfaces — no new contract invented here)
        |
        v (Corrección post-Fase 6, Corrección B/C)
PostgresAnnotationDecisionRepository / PostgresAnnotationAcceptanceUnitOfWork
        / PostgresCurrentStoryVersionResolver
        (implement features/nlp's own new ports — exactly-once acceptance
         decisions, atomic revision+decision commit, editorial-owned
         "current version" — db/migrations/0005_nlp_annotation_decisions.sql)
```

- **Database identity != published curriculum identity.** Every id column
  is the exact published string as its own `TEXT PRIMARY KEY`; there is no
  surrogate integer/UUID key anywhere. See `docs/data-model.md` §1.
- **`SqlClient`/`SqlDatabase`** (`db/sql-client.ts`) is the only interface a
  repository, migration or seed function depends on. `db/pglite-database.ts`
  and `db/pg-server-database.ts` are the only two files that import a driver
  (`@electric-sql/pglite` and `pg` respectively) — every repository,
  migration and seed file is backend-agnostic by construction. See
  `docs/persistence.md` §9 and `testing/server-parity.ts` for the
  `TEST_DATABASE_URL`-gated harness (`npm run db:test:server`).
- **Lineage acyclicity is re-validated in a transaction**
  (`repository/lineage-repository.ts`), not expressed as a `CHECK`
  constraint — a cycle spans the whole table, not one row.
- **`learner_events` is append-only twice over**: the application interface
  has no update/delete method, and `db/migrations/0004_learner_progress.sql`
  adds triggers that reject a raw `UPDATE`/`DELETE` at the database level
  too.
- **A published `StoryVersion`'s text is protected twice over** the same
  way: no code path issues that `UPDATE`, and a trigger in
  `db/migrations/0003_story_engine.sql` rejects one regardless.
- **`annotation_candidate_decisions.candidate_id` is a real primary key, not
  an app-level convention** — `INSERT ... ON CONFLICT (candidate_id) DO
  NOTHING RETURNING *` (`repository/postgres-annotation-decision-repository.ts`)
  is what makes two concurrent editorial decisions on the same candidate
  produce exactly one row, atomically, with no separate existence check that
  could race. See `docs/nlp-annotation-assistant.md` §11.1.

## What phase 5 does not do

An ORM, auth, or any UI change. `POSTGRES_SERVER_PARITY_TEST` itself
(running against a real networked server, as opposed to the adapter and
harness that make running it trivial) stays `NOT_RUN_ENV_UNAVAILABLE` — no
PostgreSQL server or Docker is available in this environment; see
`docs/persistence.md` §9.

## Tests

`__tests__/*.test.ts`, run via `npm test`. `contract-parity.test.ts` runs one
shared assertion suite against both the in-memory adapters (from
`features/story-engine`/`features/learner-progress`) and the PostgreSQL ones
here — the literal "same interface, same observable behaviour" check.
`database-contract-pglite.test.ts` and `server-parity.test.ts` run a second,
lower-level shared suite (`testing/database-contract-suite.ts`) against
PGlite and — when `TEST_DATABASE_URL` is set — a real server, via the exact
same function (`registerDatabaseContractSuite`); without it,
`server-parity.test.ts` is an explicit, visible `skipped` test, never a
false `pass`. Run it explicitly with `npm run db:test:server`.
