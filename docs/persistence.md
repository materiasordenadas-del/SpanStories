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

## 3. Swapping PGlite for a real server later

```text
features/persistence/db/pglite-database.ts   (implements SqlDatabase)
                    |
                    v
        features/persistence/db/sql-client.ts   <-- the only seam
                    ^
                    |
future: features/persistence/db/pg-server-database.ts  (wraps pg.Pool)
```

A `PgServerDatabase` implementing `SqlDatabase` against `pg.Pool` needs:
`query(sql, params)` → `pool.query(sql, params)`; `exec(sql)` →
`pool.query(sql)` (no params — `pg` runs multi-statement SQL the same way
PGlite's `exec` does, via the simple-query protocol); `transaction(fn)` →
checkout a client, `BEGIN`/`COMMIT`/`ROLLBACK` around `fn`. No repository,
migration or seed file changes: they all depend on `SqlClient`/`SqlDatabase`
only, never on `@electric-sql/pglite` (`pglite-database.ts` is the only file
in this feature that imports it).

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
