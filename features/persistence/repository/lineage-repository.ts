/**
 * Insert a `LexemeLineageEvent` with acyclicity re-validated in the same
 * transaction as the insert.
 *
 * `db/migrations/0001_lexical.sql` cannot express "the source/target graph
 * has no cycle" as a plain constraint (section 44 of the governing plan
 * anticipates exactly this: "PostgreSQL debe preservar esa regla mediante
 * repository/service transaction validation si un simple constraint no
 * basta"). This function re-runs the same `validateLineage` phase 2 already
 * uses — over every lineage event currently in the table plus the candidate
 * — before the insert is allowed to commit.
 */

import { validateLineage, type LexemeLineageEvent } from "../../lexical-engine/index.ts";
import type { SqlClient, SqlDatabase } from "../db/sql-client.ts";

type LineageRow = {
  id: string;
  kind: string;
  source_lexeme_ids: string[];
  target_lexeme_ids: string[];
  semantics: string;
  transfer_policy: string;
  effective_release: string;
  reason: string;
};

function toLineageEvent(row: LineageRow): LexemeLineageEvent {
  return {
    id: row.id as never,
    kind: row.kind as LexemeLineageEvent["kind"],
    sourceLexemeIds: row.source_lexeme_ids as never,
    targetLexemeIds: row.target_lexeme_ids as never,
    semantics: row.semantics as LexemeLineageEvent["semantics"],
    transferPolicy: row.transfer_policy as LexemeLineageEvent["transferPolicy"],
    effectiveRelease: row.effective_release as never,
    reason: row.reason,
  };
}

async function loadLineageEvents(client: SqlClient): Promise<LexemeLineageEvent[]> {
  const result = await client.query<LineageRow>("SELECT * FROM lexeme_lineage_events");
  return result.rows.map(toLineageEvent);
}

export async function insertLineageEvent(
  db: SqlDatabase,
  event: LexemeLineageEvent,
  knownLexemeIds: ReadonlySet<string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await loadLineageEvents(tx);
    const validation = validateLineage([...existing, event], knownLexemeIds);
    if (validation.status === "FAIL") {
      throw new Error(`LINEAGE_VALIDATION_FAILED: ${JSON.stringify(validation.issues)}`);
    }
    await tx.query(
      "INSERT INTO lexeme_lineage_events (id, kind, source_lexeme_ids, target_lexeme_ids, semantics, transfer_policy, effective_release, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [event.id, event.kind, event.sourceLexemeIds, event.targetLexemeIds, event.semantics, event.transferPolicy, event.effectiveRelease, event.reason],
    );
  });
}
