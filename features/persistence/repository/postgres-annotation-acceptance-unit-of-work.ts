/**
 * `AnnotationAcceptanceUnitOfWork` implemented against PostgreSQL — the real
 * crash-safety guarantee Corrección B §17 asks for. Both writes run inside
 * one `SqlDatabase.transaction`: either both the `occurrence_annotation_revisions`
 * row and the `annotation_candidate_decisions` row commit, or neither does.
 * A crash mid-transaction leaves nothing for a retry to find — the candidate
 * is still undecided and the same accept() call is safe to run again with
 * the same generated revision id.
 */

import type { OccurrenceAnnotationRevision } from "../../story-engine/index.ts";
import type { AnnotationAcceptanceUnitOfWork } from "../../nlp/domain/acceptance-unit-of-work.ts";
import type { AnnotationCandidateDecision } from "../../nlp/domain/decision.ts";
import type { RecordAcceptedInput } from "../../nlp/domain/decision-repository.ts";
import type { SqlDatabase } from "../db/sql-client.ts";
import { insertAnnotationRevisionRow } from "./postgres-story-repository.ts";
import { insertDecisionRow } from "./postgres-annotation-decision-repository.ts";

export class PostgresAnnotationAcceptanceUnitOfWork implements AnnotationAcceptanceUnitOfWork {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async runRevisionAcceptance(
    revision: OccurrenceAnnotationRevision,
    decision: RecordAcceptedInput & { readonly resultKind: "REVISION" },
  ): Promise<AnnotationCandidateDecision> {
    return this.db.transaction(async (tx) => {
      // Insert order matters here even though the transaction is atomic:
      // `annotation_candidate_decisions.resulting_revision_id` has a foreign
      // key into `occurrence_annotation_revisions`, so the revision row must
      // exist first within this same transaction. Atomicity (not ordering)
      // is what gives §17 its crash-safety guarantee: either both rows
      // commit or neither does.
      await insertAnnotationRevisionRow(tx, revision);
      return insertDecisionRow(tx, { kind: "ACCEPTED", data: decision });
    });
  }
}
