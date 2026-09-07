/**
 * The only interface a repository in this feature depends on.
 *
 * Every `Postgres*Repository` (and the migration runner and seed importer)
 * takes a `SqlDatabase`, never a concrete driver. Today's implementation
 * (`./pglite-database.ts`) wraps `@electric-sql/pglite` — real PostgreSQL
 * compiled to WASM, chosen because this environment has neither a system
 * PostgreSQL install nor Docker available (see `docs/persistence.md`
 * §"Why PGlite"). `PGlite.query`/`.transaction` were deliberately designed to
 * mirror `pg` (node-postgres)'s own client shape, so a future
 * `PgServerDatabase` wrapping a real `pg.Pool` against a networked server
 * implements this exact same interface with no change to any repository,
 * migration or seed code — only this one file's implementation changes.
 *
 * `POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`: everything here
 * runs real PostgreSQL SQL semantics (constraints, triggers, transactions),
 * but never against a networked server, SSL, a real connection pool under
 * concurrent load, or a deployment/backup/replication topology. See
 * `docs/persistence.md` for what this phase does and does not prove.
 */

export type SqlResult<T> = {
  readonly rows: readonly T[];
};

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<SqlResult<T>>;
  /**
   * Run one or more statements with no parameters (the "simple query"
   * protocol both PGlite and `pg` support) — used only by the migration
   * runner, which applies whole `.sql` files.
   */
  exec(sql: string): Promise<void>;
}

export interface SqlDatabase extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
