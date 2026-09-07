/**
 * `POSTGRES_SERVER_PARITY_TEST` — the same `registerDatabaseContractSuite`
 * (`../testing/database-contract-suite.ts`) `./database-contract-pglite.test.ts`
 * runs against PGlite, run here against a real networked PostgreSQL server.
 *
 * Requires `TEST_DATABASE_URL` (a connection string whose database name
 * contains "test" — see `../testing/server-parity.ts`'s
 * `assertSafeTestDatabaseUrl`). Without it, this suite is an explicit,
 * visible SKIP — never a silent or false PASS, and never silently omitted
 * from `npm test`'s output. Run explicitly with:
 *
 *   TEST_DATABASE_URL=postgres://user:pass@host:5432/spanstories_test npm run db:test:server
 *
 * Every test runs against its own freshly created, then dropped, PostgreSQL
 * schema (`openIsolatedTestDatabase`) — this suite never touches the target
 * server's `public` schema or any data outside the schema it creates for
 * itself.
 */

import { test } from "node:test";
import { registerDatabaseContractSuite } from "../testing/database-contract-suite.ts";
import { assertSafeTestDatabaseUrl, openIsolatedTestDatabase, resolveTestDatabaseUrl } from "../testing/server-parity.ts";

const url = resolveTestDatabaseUrl();

if (url === null) {
  test("persistence / server parity (real PostgreSQL) — SKIPPED", { skip: "TEST_DATABASE_URL is not set; see this file's header for how to run it" }, () => {});
} else {
  assertSafeTestDatabaseUrl(url); // throws (failing the whole file loudly) rather than silently running against a database that looks unsafe.
  registerDatabaseContractSuite("persistence / server parity (real PostgreSQL)", openIsolatedTestDatabase(url));
}
