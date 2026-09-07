/**
 * `AnnotationDecisionRepository` implemented against PostgreSQL — see
 * `features/nlp/domain/decision-repository.ts` for the exactly-once contract
 * this must uphold, and `db/migrations/0005_nlp_annotation_decisions.sql` for
 * the table (`candidate_id` is the primary key, which is the enforcement
 * mechanism: `INSERT ... ON CONFLICT (candidate_id) DO NOTHING` either wins
 * the race or is told it lost, atomically, with no separate "does it exist"
 * round trip in between).
 */

import { NlpError, nlpIssue } from "../../nlp/domain/errors.ts";
import type { AnnotationCandidateDecision } from "../../nlp/domain/decision.ts";
import type { AnnotationDecisionRepository, RecordAcceptedInput, RecordRejectedInput } from "../../nlp/domain/decision-repository.ts";
import type { AnnotationCandidateId } from "../../nlp/domain/ids.ts";
import type { SqlClient, SqlDatabase } from "../db/sql-client.ts";

type DecisionRow = {
  candidate_id: string;
  decision: "ACCEPTED" | "REJECTED";
  decided_at: string;
  reason: string;
  editorial_reference: string | null;
  result_kind: "NEW_OCCURRENCE" | "REVISION" | "NONE";
  resulting_occurrence_id: string | null;
  resulting_revision_id: string | null;
  materialization: { readonly occurrenceId: string; readonly anchorIds: readonly string[]; readonly targetBindingId: string | null } | null;
};

function toDecision(row: DecisionRow): AnnotationCandidateDecision {
  return {
    candidateId: row.candidate_id as AnnotationCandidateId,
    decision: row.decision,
    decidedAt: row.decided_at,
    reason: row.reason,
    editorialReference: row.editorial_reference,
    resultKind: row.result_kind,
    resultingOccurrenceId: row.resulting_occurrence_id,
    resultingRevisionId: row.resulting_revision_id,
    materialization: row.materialization,
  };
}

function alreadyDecided(candidateId: string): never {
  throw new NlpError([
    nlpIssue("CANDIDATE_ALREADY_DECIDED", `candidate ${candidateId} already has a recorded decision`, { recordId: candidateId }),
  ]);
}

/**
 * The insert half of both `recordAccepted`/`recordRejected` — factored out so
 * `PostgresAnnotationAcceptanceUnitOfWork` can run it inside the *same*
 * transaction as a `StoryOccurrence`/`OccurrenceAnnotationRevision` write
 * (Corrección B §17's crash-safety requirement), instead of two separate
 * round trips that could commit independently.
 */
export async function insertDecisionRow(
  client: SqlClient,
  input:
    | { readonly kind: "ACCEPTED"; readonly data: RecordAcceptedInput }
    | { readonly kind: "REJECTED"; readonly data: RecordRejectedInput },
): Promise<AnnotationCandidateDecision> {
  const values =
    input.kind === "REJECTED"
      ? {
          candidateId: input.data.candidateId,
          decision: "REJECTED" as const,
          decidedAt: input.data.decidedAt,
          reason: input.data.reason,
          editorialReference: null as string | null,
          resultKind: "NONE" as const,
          occurrenceId: null as string | null,
          revisionId: null as string | null,
          materialization: null as unknown,
        }
      : input.data.resultKind === "NEW_OCCURRENCE"
        ? {
            candidateId: input.data.candidateId,
            decision: "ACCEPTED" as const,
            decidedAt: input.data.decidedAt,
            reason: input.data.reason,
            editorialReference: input.data.editorialReference,
            resultKind: "NEW_OCCURRENCE" as const,
            occurrenceId: input.data.occurrenceId,
            revisionId: null as string | null,
            materialization: JSON.stringify({
              occurrenceId: input.data.occurrenceId,
              anchorIds: input.data.anchorIds,
              targetBindingId: input.data.targetBindingId,
            }),
          }
        : {
            candidateId: input.data.candidateId,
            decision: "ACCEPTED" as const,
            decidedAt: input.data.decidedAt,
            reason: input.data.reason,
            editorialReference: input.data.editorialReference,
            resultKind: "REVISION" as const,
            occurrenceId: null as string | null,
            revisionId: input.data.revisionId,
            materialization: null as unknown,
          };

  const result = await client.query<DecisionRow>(
    `INSERT INTO annotation_candidate_decisions
       (candidate_id, decision, decided_at, reason, editorial_reference, result_kind, resulting_occurrence_id, resulting_revision_id, materialization)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (candidate_id) DO NOTHING
     RETURNING *`,
    [
      values.candidateId,
      values.decision,
      values.decidedAt,
      values.reason,
      values.editorialReference,
      values.resultKind,
      values.occurrenceId,
      values.revisionId,
      values.materialization,
    ],
  );

  if (result.rows.length === 0) alreadyDecided(values.candidateId);
  return toDecision(result.rows[0]);
}

export class PostgresAnnotationDecisionRepository implements AnnotationDecisionRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async getByCandidateId(candidateId: AnnotationCandidateId): Promise<AnnotationCandidateDecision | null> {
    const result = await this.db.query<DecisionRow>(
      "SELECT * FROM annotation_candidate_decisions WHERE candidate_id = $1",
      [candidateId],
    );
    return result.rows.length === 0 ? null : toDecision(result.rows[0]);
  }

  recordAccepted(input: RecordAcceptedInput): Promise<AnnotationCandidateDecision> {
    return insertDecisionRow(this.db, { kind: "ACCEPTED", data: input });
  }

  recordRejected(input: RecordRejectedInput): Promise<AnnotationCandidateDecision> {
    return insertDecisionRow(this.db, { kind: "REJECTED", data: input });
  }
}
