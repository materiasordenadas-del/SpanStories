/**
 * `SqlDatabase` adapter over a real networked PostgreSQL server, via `pg`
 * (node-postgres).
 *
 * This is the adapter `./pglite-database.ts`'s own doc comment predicted:
 * `PGlite.query`/`.transaction` were deliberately shaped to mirror `pg`'s
 * client, so this file implements the exact same `SqlClient`/`SqlDatabase`
 * interface with no change to any migration, seed or repository code —
 * `db/migrations/*.sql`, `features/persistence/seed/seed-curriculum.ts`,
 * `PostgresStoryRepository` and `PostgresLearnerEventRepository` do not know,
 * and must never be made to know, whether they are talking to PGlite or a
 * networked server.
 *
 * `POSTGRES_SERVER_PARITY_TEST` (`docs/persistence.md`) is what actually
 * exercises this file against a real server; this module by itself only
 * proves it type-checks and satisfies the interface — see
 * `scripts/db/server-parity-harness.ts` for the safety-checked runner.
 */

import { Pool, type PoolClient } from "pg";
import type { SqlClient, SqlDatabase, SqlResult } from "./sql-client.ts";

export type PgServerDatabaseOptions = {
  readonly connectionString: string;
  /**
   * Isolate every statement this database issues to one PostgreSQL schema,
   * via `search_path` — the isolated-schema strategy
   * `scripts/db/server-parity-harness.ts` uses so a parity run never reads or
   * writes the server's `public` schema. Omit for the default `search_path`
   * (whatever the connection's role/database already resolves to).
   */
  readonly schema?: string;
  /** Passed straight through to `pg.Pool` — SSL, pool size, etc. */
  readonly poolConfig?: Omit<ConstructorParameters<typeof Pool>[0], "connectionString">;
};

export async function openPgServerDatabase(options: PgServerDatabaseOptions): Promise<SqlDatabase> {
  const pool = new Pool({
    connectionString: options.connectionString,
    ...(options.schema !== undefined ? { options: `-c search_path=${options.schema}` } : {}),
    ...options.poolConfig,
  });
  // Fail fast if the server is unreachable, rather than on the first query a
  // caller happens to issue.
  const probe = await pool.connect();
  probe.release();
  return new PgServerDatabase(pool);
}

function wrapClient(client: Pool | PoolClient): SqlClient {
  return {
    query: async <T,>(sql: string, params: readonly unknown[] = []): Promise<SqlResult<T>> => {
      const result = await client.query(sql, params as unknown[]);
      return { rows: result.rows as T[] };
    },
    exec: async (sql: string): Promise<void> => {
      // No params -> pg's simple query protocol, which (like PGlite's
      // `.exec`) supports multiple `;`-separated statements in one call —
      // required for applying a whole migration file verbatim.
      await client.query(sql);
    },
  };
}

class PgServerDatabase implements SqlDatabase {
  private readonly pool: Pool;
  private readonly client: SqlClient;

  constructor(pool: Pool) {
    this.pool = pool;
    this.client = wrapClient(pool);
  }

  query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<SqlResult<T>> {
    return this.client.query<T>(sql, params);
  }

  exec(sql: string): Promise<void> {
    return this.client.exec(sql);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = wrapClient(client);
    try {
      await tx.exec("BEGIN");
      const result = await fn(tx);
      await tx.exec("COMMIT");
      return result;
    } catch (error) {
      await tx.exec("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
