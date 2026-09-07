import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asLexicalId, type LexemeLineageEvent } from "../../lexical-engine/index.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { insertLineageEvent } from "../repository/lineage-repository.ts";

async function freshDb() {
  const db = await openPGliteDatabase();
  await migrate(db);
  for (const id of ["LEX-TEST-A", "LEX-TEST-B", "LEX-TEST-C"]) {
    await db.query("INSERT INTO lexemes (id, lemma, type, data) VALUES ($1, $2, $3, $4)", [id, id, "ATOMIC", "{}"]);
  }
  return db;
}

function event(id: string, kind: LexemeLineageEvent["kind"], sources: string[], targets: string[]): LexemeLineageEvent {
  return {
    id: asLexicalId("LineageEventId", id) as never,
    kind,
    sourceLexemeIds: sources as never,
    targetLexemeIds: targets as never,
    semantics: "EQUIVALENT_IDENTITY",
    transferPolicy: "CONTEXTUAL",
    effectiveRelease: asLexicalId("LexiconReleaseId", "A1-LEXICON-v9.9") as never,
    reason: "fixture",
  };
}

const KNOWN = new Set(["LEX-TEST-A", "LEX-TEST-B", "LEX-TEST-C"]);

describe("persistence / lineage acyclicity", () => {
  test("a valid split inserts cleanly", async () => {
    const db = await freshDb();
    try {
      await insertLineageEvent(db, event("LIN-A1-900001", "SPLIT", ["LEX-TEST-A"], ["LEX-TEST-B", "LEX-TEST-C"]), KNOWN);
      const rows = await db.query("SELECT * FROM lexeme_lineage_events");
      assert.equal(rows.rows.length, 1);
    } finally {
      await db.close();
    }
  });

  test("a direct cycle (A -> B, B -> A) is rejected", async () => {
    const db = await freshDb();
    try {
      await insertLineageEvent(db, event("LIN-A1-900001", "REPLACED_BY", ["LEX-TEST-A"], ["LEX-TEST-B"]), KNOWN);
      await assert.rejects(
        () => insertLineageEvent(db, event("LIN-A1-900002", "REPLACED_BY", ["LEX-TEST-B"], ["LEX-TEST-A"]), KNOWN),
        /LINEAGE_VALIDATION_FAILED/,
      );
      // The cyclic event must not have been committed.
      const rows = await db.query("SELECT id FROM lexeme_lineage_events");
      assert.deepEqual(rows.rows, [{ id: "LIN-A1-900001" }]);
    } finally {
      await db.close();
    }
  });

  test("a lineage event naming an unpublished lexeme is rejected", async () => {
    const db = await freshDb();
    try {
      await assert.rejects(
        () => insertLineageEvent(db, event("LIN-A1-900001", "REPLACED_BY", ["LEX-TEST-A"], ["LEX-DOES-NOT-EXIST"]), KNOWN),
        /LINEAGE_VALIDATION_FAILED/,
      );
    } finally {
      await db.close();
    }
  });
});
