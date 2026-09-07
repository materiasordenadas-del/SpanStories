/**
 * Safety plumbing for running the persistence contract suite against a real,
 * networked PostgreSQL server — `POSTGRES_SERVER_PARITY_TEST` in
 * `docs/persistence.md`. Everything here is deliberately paranoid: this code
 * runs real `DROP SCHEMA ... CASCADE` against whatever `TEST_DATABASE_URL`
 * points at, so it never runs against a URL that has not been explicitly
 * vetted, and it never touches the target database's default `public` schema.
 */

import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { openPgServerDatabase, type PgServerDatabaseOptions } from "../db/pg-server-database.ts";
import type { SqlDatabase } from "../db/sql-client.ts";

export const TEST_DATABASE_URL_ENV = "TEST_DATABASE_URL";
/** Set to exactly `"1"` to bypass the production-name heuristic in `assertSafeTestDatabaseUrl`. */
export const ALLOW_UNSAFE_TEST_DB_ENV = "SPANSTORIES_ALLOW_UNSAFE_TEST_DB";

/** Reads `TEST_DATABASE_URL` (or the given env map, for testing this function itself). Returns `null`, never `""`, when unset. */
export function resolveTestDatabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = env[TEST_DATABASE_URL_ENV];
  return value === undefined || value.trim() === "" ? null : value;
}

// Plain substring checks, not word-boundary regexes: real database names use
// "_"/"-" as separators ("spanstories_test", "spanstories-production"), and
// "_"/"-" are word characters to `\b` in most engines, so a `\bprod\b`-style
// pattern would never match "spanstories_production" at all.
const PROD_MARKER = /prod(uction)?/i;
const TEST_MARKER = /test/i;

/**
 * Refuse to run against a URL that looks like production.
 *
 * Two independent heuristics, either one enough to refuse:
 *   1. the hostname or database name contains "prod"/"production";
 *   2. the database name does *not* contain "test" at all — a real parity
 *      run is expected to point at something named like
 *      `spanstories_test`, not an unmarked database that might be anything.
 *
 * Both are bypassed only by the explicit `SPANSTORIES_ALLOW_UNSAFE_TEST_DB=1`
 * escape hatch — never silently, and never by a flag this function infers on
 * its own from the URL.
 */
export function assertSafeTestDatabaseUrl(url: string, env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (env[ALLOW_UNSAFE_TEST_DB_ENV] === "1") return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`TEST_DATABASE_URL_INVALID: ${JSON.stringify(url)} is not a valid connection URL`);
  }
  const hostname = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, "");

  if (PROD_MARKER.test(hostname) || PROD_MARKER.test(dbName)) {
    throw new Error(
      `REFUSING_LIKELY_PRODUCTION_DATABASE: host ${JSON.stringify(hostname)} / database ${JSON.stringify(dbName)} looks like production. ` +
        `Set ${ALLOW_UNSAFE_TEST_DB_ENV}=1 to override, only if you are certain this is not production.`,
    );
  }
  if (!TEST_MARKER.test(dbName)) {
    throw new Error(
      `REFUSING_NON_TEST_DATABASE_NAME: database ${JSON.stringify(dbName)} does not look like a test database (expected "test" in its name). ` +
        `Set ${ALLOW_UNSAFE_TEST_DB_ENV}=1 to override.`,
    );
  }
}

function randomSchemaName(): string {
  return `spanstories_parity_${randomBytes(6).toString("hex")}`;
}

export type IsolatedSchemaSession = {
  readonly schema: string;
  readonly db: SqlDatabase;
};

/**
 * Open a `PgServerDatabase` scoped to a brand-new, randomly-named schema on
 * `connectionString`'s server, run `fn`, then always drop the schema —
 * whether `fn` succeeded or threw. This is the isolation strategy §16 of the
 * governing brief asks for: a parity run never reads or writes the target
 * server's `public` schema or any other run's schema, even when several runs
 * share one `TEST_DATABASE_URL` concurrently.
 */
export async function withIsolatedSchema<T>(
  connectionString: string,
  fn: (session: IsolatedSchemaSession) => Promise<T>,
  poolConfig?: PgServerDatabaseOptions["poolConfig"],
): Promise<T> {
  const schema = randomSchemaName();
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }

  const db = await openPgServerDatabase({ connectionString, schema, poolConfig });
  try {
    return await fn({ schema, db });
  } finally {
    await db.close();
    const cleanup = new Client({ connectionString });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await cleanup.end();
    }
  }
}

/**
 * A `SqlDatabase` factory with the exact same "fresh, empty database" contract
 * every existing PGlite test already relies on (`await openPGliteDatabase()`
 * once per test) — except backed by a brand-new, randomly-named schema on a
 * real server, dropped when `close()` is called. This is what lets
 * `../__tests__/database-contract-suite.ts` run unchanged against either
 * backend: it never has to know a schema exists.
 */
export function openIsolatedTestDatabase(
  connectionString: string,
  poolConfig?: PgServerDatabaseOptions["poolConfig"],
): () => Promise<SqlDatabase> {
  return async () => {
    const schema = randomSchemaName();
    const admin = new Client({ connectionString });
    await admin.connect();
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
    } finally {
      await admin.end();
    }

    const inner = await openPgServerDatabase({ connectionString, schema, poolConfig });
    return {
      query: inner.query.bind(inner),
      exec: inner.exec.bind(inner),
      transaction: inner.transaction.bind(inner),
      close: async () => {
        await inner.close();
        const cleanup = new Client({ connectionString });
        await cleanup.connect();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await cleanup.end();
        }
      },
    };
  };
}
