/**
 * `SqlDatabase` adapter over `@electric-sql/pglite`.
 *
 * This is the *only* file in `features/persistence` that imports
 * `@electric-sql/pglite`. Everything else (migrations, seed, the two
 * repositories) depends on `./sql-client.ts`'s interfaces.
 */

import { PGlite } from "@electric-sql/pglite";
import type { SqlClient, SqlDatabase, SqlResult } from "./sql-client.ts";

export type PGliteDatabaseOptions = {
  /**
   * Omit (or `undefined`) for an in-memory, ephemeral database — what every
   * integration test in this feature uses. Pass a filesystem directory path
   * to persist across process restarts (see `docs/persistence.md`
   * §"Running it yourself").
   */
  readonly dataDir?: string;
};

export async function openPGliteDatabase(options: PGliteDatabaseOptions = {}): Promise<SqlDatabase> {
  const client = await PGlite.create(options.dataDir);
  return new PGliteDatabase(client);
}

class PGliteDatabase implements SqlDatabase {
  private readonly client: PGlite;

  constructor(client: PGlite) {
    this.client = client;
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<SqlResult<T>> {
    const result = await this.client.query<T>(sql, params as unknown[]);
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.client.exec(sql);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.client.transaction(async (tx) => {
      const wrapped: SqlClient = {
        query: async <U,>(sql: string, params: readonly unknown[] = []): Promise<SqlResult<U>> => {
          const result = await tx.query<U>(sql, params as unknown[]);
          return { rows: result.rows };
        },
        exec: async (sql: string) => {
          await tx.exec(sql);
        },
      };
      return fn(wrapped);
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
