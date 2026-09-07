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
```

- **Database identity != published curriculum identity.** Every id column
  is the exact published string as its own `TEXT PRIMARY KEY`; there is no
  surrogate integer/UUID key anywhere. See `docs/data-model.md` §1.
- **`SqlClient`/`SqlDatabase`** (`db/sql-client.ts`) is the only interface a
  repository, migration or seed function depends on.
  `db/pglite-database.ts` is the only file that imports
  `@electric-sql/pglite` — a future real-server adapter implements the same
  two interfaces with no change anywhere else.
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

## What phase 5 does not do

Networked-server concerns (SSL, real connection pooling, concurrent-process
load, deployment/backup/replication — see `docs/persistence.md` §1), an
ORM, auth, or any UI change.

## Tests

`__tests__/*.test.ts`, run via `npm test`. `contract-parity.test.ts` runs one
shared assertion suite against both the in-memory adapters (from
`features/story-engine`/`features/learner-progress`) and the PostgreSQL ones
here — the literal "same interface, same observable behaviour" check.
