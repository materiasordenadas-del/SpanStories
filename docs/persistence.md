# Persistence — implementation notes (engine phase 5)

PostgreSQL repositories, migrations and a seed importer for the domain
contracts phases 1-4 already defined. See `docs/data-model.md` for the
schema itself; this document covers the environment decision, how to run
it, and what this phase does and does not prove.

```text
Curriculum release   A1-CURRICULUM-v1.51   (active baseline, unchanged)
Lexicon release       A1-LEXICON-v1.0      (active baseline, unchanged)
Persistence           phase 5, no release id of its own
```

---

## 1. Why PGlite

Section 40 of the governing plan requires "ejecución contra PostgreSQL
real... no declarar PASS solo con mocks," and offers two acceptable
environments: a local PostgreSQL install, or Docker PostgreSQL. Neither was
available in this environment — no `psql`/`pg_ctl` on `PATH` or in
`Program Files`, no `docker` binary, no matching Windows service. Installing
either requires administrator privileges and a substantial download this
plan does not authorize taking unilaterally.

**`@electric-sql/pglite`** was chosen instead, with the user's explicit
authorization for this phase: it is PostgreSQL itself, compiled to WASM and
embedded in the Node process — not a mock, not SQLite pretending to speak
Postgres, and not an approximate reimplementation of Postgres semantics. Its
`query`/`exec`/`transaction` API was deliberately designed to mirror `pg`
(node-postgres)'s own client shape. Every migration, constraint, trigger,
transaction and rollback in this phase runs against the real Postgres
parser, planner and executor — `psql`-compatible SQL, not a WASM-specific
dialect (see `db/migrations/*.sql`'s own header comments, and
`BLOCKER_PGLITE_PORTABILITY`, §4 below).

### `POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`

What this phase proves: constraint enforcement, triggers, transactions and
rollback, foreign keys, unique/check constraints, JSONB storage, and every
repository contract test — all against the real Postgres engine.

What this phase does **not** prove, because nothing here runs against a
networked server:

```text
network connections (TCP, wire protocol over a socket)
SSL/TLS
a real connection pool under concurrent load
multiple concurrent server connections from separate processes
deployment, backup, replication
```

Before this schema and these repositories go anywhere near production, run
the same migrations and the same contract tests against an actual
PostgreSQL server (local install or Docker) once one is available in the
target environment. Nothing in the design should need to change to do that
— see §3.

---

## 2. DB access: raw parameterized SQL, no ORM

Evaluated against section 39's criteria:

| Criterion | Raw SQL (chosen) | An ORM (Prisma/Drizzle/Kysely) |
| --- | --- | --- |
| TypeScript safety | Manual row-mapper functions per table (`to*` in `repository/*.ts`) — explicit, not generated | Generated types, but tied to the ORM's own schema DSL |
| Migrations explicit | Plain, hand-written, git-diffable `.sql` files | Usually generated from a schema file; less direct |
| Constraints/FKs real | Written directly in SQL, no abstraction gap | Varies; some ORMs under-support triggers/complex checks |
| JSONB | Passed as a JS object, `JSON.stringify`d, stored as `jsonb` | Usually supported, another layer to trust |
| Transactions | `SqlDatabase.transaction()`, thin wrapper over PGlite's/`pg`'s own | Supported, another abstraction layer |
| Bulk seed | Hand-rolled chunked multi-row `INSERT`s (`seed/seed-curriculum.ts`) | Usually fine, but another code path to verify |
| Testability | Works against PGlite with zero adapter-specific test code | Most ORMs' PGlite support is immature or absent |
| Lock-in | None — the SQL is portable, `SqlClient`/`SqlDatabase` is the only seam | An ORM's query API and migration format are both lock-in |
| No paid service | ✓ | ✓ (all three candidates are free/OSS) |
| Windows local | ✓, no native build step | Some ORMs need native bindings that complicate Windows setup |

The deciding factor was PGlite compatibility and the existing domain shape:
`StoryRepository`/`LearnerEventRepository` are already fully-specified
interfaces (phases 3-4) with row shapes that don't map cleanly onto a
generic ORM schema (discriminated unions like `StoryOccurrence`, JSONB
`data` columns holding the full domain object). Hand-written SQL against a
thin `SqlClient`/`SqlDatabase` seam (`db/sql-client.ts`) gives full control
over exactly this shape with no ORM dialect to fight, and — because that
seam is the *only* PGlite-specific surface — swapping the adapter for a real
`pg.Pool`-backed one later touches one file, not the repositories.

## 3. Swapping PGlite for a real server

```text
features/persistence/db/pglite-database.ts      (implements SqlDatabase)
features/persistence/db/pg-server-database.ts   (implements SqlDatabase, wraps pg.Pool)
                    |                    |
                    v                    v
              features/persistence/db/sql-client.ts   <-- the only seam
```

Implemented (§9): `PgServerDatabase` in `db/pg-server-database.ts`, exactly as
predicted here — `query(sql, params)` → `pool.query(sql, params)`; `exec(sql)`
→ `pool.query(sql)` (no params — `pg` runs multi-statement SQL the same way
PGlite's `exec` does, via the simple-query protocol); `transaction(fn)` →
checkout a client, `BEGIN`/`COMMIT`/`ROLLBACK` around `fn`. No repository,
migration or seed file changed to make this work: they all depend on
`SqlClient`/`SqlDatabase` only. `pglite-database.ts` and `pg-server-database.ts`
are the only two files in this feature that import a driver
(`@electric-sql/pglite` and `pg` respectively) — every other file, including
every repository, is backend-agnostic by construction.

## 4. `BLOCKER_PGLITE_PORTABILITY` — none encountered

Every migration in `db/migrations/*.sql` is plain PostgreSQL DDL: standard
types, `CHECK`/`UNIQUE`/`FOREIGN KEY` constraints, `plpgsql` trigger
functions, `GIN` indexes on `TEXT[]` columns. Nothing required a WASM-only
workaround. The one syntax issue hit during development —
`INSERT INTO modules (..., order, ...)` failing because `order` is a
reserved word — is standard PostgreSQL behavior (`order` must be quoted
as `"order"` in any Postgres, not a PGlite quirk) and was fixed by quoting
the column, not by changing the schema.

## 5. Running it yourself

```bash
npm run db:setup                       # migrate + seed an in-memory, ephemeral database
npm run db:setup -- ./data/spanstories-db   # migrate + seed, persisted to that directory
```

`scripts/db/migrate-and-seed.ts` prints the applied migrations and the
seeded counts. Re-running against the same persisted directory re-applies
no migration (idempotent) but **will** fail the seed step with a duplicate
published-id error, because the release is already there — this is correct:
re-seeding an already-seeded release is exactly the "duplicate id" case
tested in `features/persistence/__tests__/seed.test.ts`, not a bug in the
script.

Integration tests: `npm test` runs everything under
`features/persistence/__tests__/*.test.ts` alongside every other feature's
tests (each test opens its own fresh, in-memory PGlite instance — see
`openPGliteDatabase()`, no shared state between tests).

## 6. What changed in phases 3-4 to make this possible

`StoryRepository` and `LearnerEventRepository` (defined in phases 3 and 4)
were originally synchronous interfaces. A real persistence adapter cannot
answer synchronously, so both interfaces — and their in-memory
implementations (`InMemoryStoryRepository`, `InMemoryLearnerEventRepository`,
`LocalStorageLearnerEventRepository`) and every call site that used them —
were converted to return `Promise`s as part of this phase, *before* writing
the PostgreSQL adapters. This is a necessary characteristic of any real I/O
boundary, not a redesign of either engine's domain: no type, invariant, or
public export changed shape beyond "returns a `Promise` now." See
`docs/story-engine-implementation.md` and
`docs/learner-progress-implementation.md`'s repository sections, both
updated to describe the `Promise`-based contract.

---

## 7. Regression status

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  294/294 (263 phases 1-4 + 31 phase 5)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 pre-existing warning
npm run build              PASS
```

(§9 below records the addendum's own regression status — the numbers above
are phase 5's original snapshot, kept as written at the time.)

The single lint warning is pre-existing and out of scope (same
`_ds_bundle.js` warning phases 1-4 already recorded). No new warnings were
introduced.

---

## 8. Deliberately not done

A real networked PostgreSQL server was never available in this environment
and was not used — see `POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`
above. No ORM, no ongoing connection pool management beyond what one PGlite
instance needs, no ownership/multi-tenant isolation beyond `learner_id` as
an opaque column, no backup/replication/deployment tooling, no auth. React
never imports this feature or a database driver directly — nothing under
`app/`, `components/` or `lib/` was touched. `SurfaceToken` persistence is
the same deliberate gap `docs/data-model.md` §6 records.

---

## 9. Addendum (deuda B): the PostgreSQL server parity harness

```text
POSTGRES_SERVER_ADAPTER         = IMPLEMENTED
POSTGRES_SERVER_PARITY_HARNESS  = READY
POSTGRES_SERVER_PARITY_TEST     = NOT_RUN_ENV_UNAVAILABLE
```

`POSTGRES_SERVER_PARITY_TEST` stays `PENDING_BEFORE_PRODUCTION` (§1) in
spirit, but is now backed by real, runnable infrastructure rather than an
open question. This environment still has no `docker`/`psql`/`pg_ctl` on
`PATH` (re-checked, same result as §1) — the addendum does not install
either unilaterally, per its own brief. What changed is that the moment a
real server *is* available, running the parity test is one command, not a
design exercise.

### 9.1 `PgServerDatabase` — the adapter §3 predicted

`features/persistence/db/pg-server-database.ts` implements `SqlDatabase`
over `pg.Pool`. No repository, migration or seed file was touched to add it
— `PostgresStoryRepository`/`PostgresLearnerEventRepository`, `db/migrate.ts`
and `seed/seed-curriculum.ts` still only import `./sql-client.ts`'s
interfaces (verified by grep: `pglite-database.ts` and `pg-server-database.ts`
are the only two files in this feature importing a driver package at all).
`openPgServerDatabase({ connectionString, schema? })` accepts an optional
`schema`, applied via `-c search_path=<schema>` on every pooled connection —
the mechanism the isolation strategy in §9.2 depends on.

### 9.2 One reusable contract suite, not two test files

`features/persistence/testing/database-contract-suite.ts` exports
`registerDatabaseContractSuite(describeName, openDb)` — migrations (clean +
idempotent + every expected table, via `to_regclass`, which resolves through
whatever schema `search_path` names, so the same check works unmodified
against PGlite's `public` schema and a server's isolated one),
`seedCurriculum`'s exact published counts, the `StoryRepository` and
`LearnerEventRepository` contracts (round-trip, referential integrity, no
partial write on corruption, append-only by trigger), and two direct
`SqlDatabase.transaction` tests (rollback on throw, visible on commit). One
function, registered twice:

- `__tests__/database-contract-pglite.test.ts` — always runs, against
  `openPGliteDatabase()` (a fresh in-memory instance per test, same as every
  other PGlite test in this feature).
- `__tests__/server-parity.test.ts` — the same function, against
  `openIsolatedTestDatabase(url)` from `testing/server-parity.ts`, when
  `TEST_DATABASE_URL` is set.

Nothing was copied: the exact same test bodies run against both backends,
via the same `openDb: () => Promise<SqlDatabase>` seam the repositories
themselves depend on.

### 9.3 Isolation and safety

`testing/server-parity.ts`:

- `resolveTestDatabaseUrl()` reads `TEST_DATABASE_URL`; `null` (not `""`)
  when unset or blank.
- `assertSafeTestDatabaseUrl(url)` refuses to run — throwing, not warning —
  when the hostname or database name contains "prod"/"production", or when
  the database name contains no "test" marker at all. Both checks are
  bypassed only by the explicit `SPANSTORIES_ALLOW_UNSAFE_TEST_DB=1`
  escape hatch, never inferred automatically. Tested directly in
  `__tests__/server-parity-safety.test.ts` — these are pure functions, so
  the refusal behaviour itself is proven without needing a real server.
- `openIsolatedTestDatabase(url)` returns an `openDb` factory: every call
  creates a brand-new, randomly-named PostgreSQL schema, opens a
  `PgServerDatabase` scoped to it via `search_path`, and its `close()` drops
  that schema (`DROP SCHEMA ... CASCADE`) before returning. A parity run
  therefore never reads or writes the target server's `public` schema, and
  concurrent runs against the same `TEST_DATABASE_URL` never collide.

### 9.4 Running it

```bash
TEST_DATABASE_URL=postgres://user:pass@host:5432/spanstories_test npm run db:test:server
```

Without `TEST_DATABASE_URL`, `server-parity.test.ts` registers one visibly
**skipped** test (node's test runner reports it as `skipped`, not `pass`) —
`npm test` therefore never reports a false `PASS` for server parity; the
skip is explicit and named, per the brief's "no un falso PASS."

### 9.5 Regression status

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  327 passing, 1 skipped (328 total; server-parity itself is the explicit SKIP — TEST_DATABASE_URL unavailable)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 pre-existing warning
npm run build              PASS
```
