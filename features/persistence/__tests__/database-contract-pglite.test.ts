/**
 * The reusable `SqlDatabase` contract suite (`../testing/database-contract-suite.ts`),
 * run against PGlite. `../__tests__/server-parity.test.ts` runs the exact
 * same function against a real networked PostgreSQL server when
 * `TEST_DATABASE_URL` is set — same function, two backends, no copied tests.
 */

import { registerDatabaseContractSuite } from "../testing/database-contract-suite.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";

registerDatabaseContractSuite("persistence / database contract (PGlite)", () => openPGliteDatabase());
