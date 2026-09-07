import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeTestDatabaseUrl, resolveTestDatabaseUrl, TEST_DATABASE_URL_ENV } from "../testing/server-parity.ts";

describe("persistence / server parity safety guard", () => {
  test("resolveTestDatabaseUrl returns null when unset", () => {
    assert.equal(resolveTestDatabaseUrl({}), null);
  });

  test("resolveTestDatabaseUrl returns null for an empty/whitespace value", () => {
    assert.equal(resolveTestDatabaseUrl({ [TEST_DATABASE_URL_ENV]: "  " }), null);
  });

  test("resolveTestDatabaseUrl returns the value when set", () => {
    const url = "postgres://user:pass@localhost:5432/spanstories_test";
    assert.equal(resolveTestDatabaseUrl({ [TEST_DATABASE_URL_ENV]: url }), url);
  });

  test("a plainly-named test database is accepted", () => {
    assert.doesNotThrow(() => assertSafeTestDatabaseUrl("postgres://user:pass@localhost:5432/spanstories_test", {}));
  });

  test("a URL whose database name mentions production is refused", () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl("postgres://user:pass@localhost:5432/spanstories_production", {}),
      /REFUSING_LIKELY_PRODUCTION_DATABASE/,
    );
  });

  test("a URL whose hostname mentions prod is refused", () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl("postgres://user:pass@prod-db.internal:5432/spanstories_test", {}),
      /REFUSING_LIKELY_PRODUCTION_DATABASE/,
    );
  });

  test("a database name with no 'test' marker at all is refused", () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl("postgres://user:pass@localhost:5432/spanstories", {}),
      /REFUSING_NON_TEST_DATABASE_NAME/,
    );
  });

  test("the explicit override bypasses both heuristics", () => {
    assert.doesNotThrow(() =>
      assertSafeTestDatabaseUrl("postgres://user:pass@prod-db.internal:5432/spanstories_production", {
        SPANSTORIES_ALLOW_UNSAFE_TEST_DB: "1",
      }),
    );
  });

  test("an invalid URL is refused with a clear error", () => {
    assert.throws(() => assertSafeTestDatabaseUrl("not-a-url", {}), /TEST_DATABASE_URL_INVALID/);
  });
});
