/**
 * `LearnerEventRepository` implemented against PostgreSQL.
 *
 * Contract-identical to
 * `features/learner-progress/repository/in-memory-learner-event-repository.ts`
 * — `../__tests__/learner-event-repository.test.ts` runs the same
 * assertions against both. Append-only is enforced twice: this class issues
 * no `UPDATE`/`DELETE` against `learner_events`, and
 * `db/migrations/0004_learner_progress.sql`'s triggers reject either at the
 * database level even if some future code tried.
 */

import type {
  LearnerEvent,
  LearnerEventId,
  LearnerEventRepository,
  LearnerId,
} from "../../learner-progress/index.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryVersionId } from "../../story-engine/index.ts";
import type { SqlDatabase } from "../db/sql-client.ts";

type EventRow = {
  event_id: string;
  event_type: "OCCURRENCE_OPENED" | "STATE_DECLARED";
  occurred_at: string;
  learner_id: string;
  story_id: string;
  story_version_id: string;
  occurrence_id: string | null;
  recorded_lexeme_id: string | null;
  recorded_sense_id: string | null;
  recorded_form_id: string | null;
  curriculum_release_id: string;
  lexicon_release_id: string;
  declared_state: string | null;
};

function toEvent(row: EventRow): LearnerEvent {
  const base = {
    eventId: row.event_id as never,
    occurredAt: new Date(row.occurred_at).toISOString(),
    learnerId: row.learner_id as never,
    storyId: row.story_id as never,
    storyVersionId: row.story_version_id as never,
    curriculumReleaseId: row.curriculum_release_id,
    lexiconReleaseId: row.lexicon_release_id as never,
  };
  if (row.event_type === "OCCURRENCE_OPENED") {
    return Object.freeze({
      ...base,
      eventType: "OCCURRENCE_OPENED",
      occurrenceId: row.occurrence_id as never,
      recordedLexemeId: row.recorded_lexeme_id as never,
      recordedSenseId: row.recorded_sense_id as never,
      recordedFormId: row.recorded_form_id as never,
    });
  }
  return Object.freeze({
    ...base,
    eventType: "STATE_DECLARED",
    occurrenceId: row.occurrence_id as never,
    recordedLexemeId: row.recorded_lexeme_id as never,
    recordedSenseId: row.recorded_sense_id as never,
    declaredState: row.declared_state as never,
  });
}

export class PostgresLearnerEventRepository implements LearnerEventRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async append(event: LearnerEvent): Promise<void> {
    try {
      await this.appendRow(event);
    } catch (error) {
      // Postgres's own unique-violation error (SQLSTATE 23505) is the same
      // observable fact `InMemoryLearnerEventRepository` reports with this
      // message — normalising it here is what makes "same contract" mean
      // the same thing for a caller catching a specific error, not just
      // "both adapters throw something."
      if (error !== null && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
        throw new Error(`DUPLICATE_LEARNER_EVENT_ID: ${event.eventId} was already appended`);
      }
      throw error;
    }
  }

  private async appendRow(event: LearnerEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO learner_events
        (event_id, event_type, occurred_at, learner_id, story_id, story_version_id, occurrence_id,
         recorded_lexeme_id, recorded_sense_id, recorded_form_id, curriculum_release_id, lexicon_release_id, declared_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        event.eventId,
        event.eventType,
        event.occurredAt,
        event.learnerId,
        event.storyId,
        event.storyVersionId,
        event.occurrenceId,
        event.recordedLexemeId,
        event.recordedSenseId,
        event.eventType === "OCCURRENCE_OPENED" ? event.recordedFormId : null,
        event.curriculumReleaseId,
        event.lexiconReleaseId,
        event.eventType === "STATE_DECLARED" ? event.declaredState : null,
      ],
    );
  }

  async getById(eventId: LearnerEventId): Promise<LearnerEvent | null> {
    const result = await this.db.query<EventRow>("SELECT * FROM learner_events WHERE event_id = $1", [eventId]);
    return result.rows.length === 0 ? null : toEvent(result.rows[0]);
  }

  async listForLearner(learnerId: LearnerId): Promise<readonly LearnerEvent[]> {
    const result = await this.db.query<EventRow>(
      "SELECT * FROM learner_events WHERE learner_id = $1 ORDER BY occurred_at, event_id",
      [learnerId],
    );
    return result.rows.map(toEvent);
  }

  async listForLearnerAndLexeme(learnerId: LearnerId, lexemeId: LexemeId): Promise<readonly LearnerEvent[]> {
    const result = await this.db.query<EventRow>(
      "SELECT * FROM learner_events WHERE learner_id = $1 AND recorded_lexeme_id = $2 ORDER BY occurred_at, event_id",
      [learnerId, lexemeId],
    );
    return result.rows.map(toEvent);
  }

  async listForStoryVersion(storyVersionId: StoryVersionId): Promise<readonly LearnerEvent[]> {
    const result = await this.db.query<EventRow>(
      "SELECT * FROM learner_events WHERE story_version_id = $1 ORDER BY occurred_at, event_id",
      [storyVersionId],
    );
    return result.rows.map(toEvent);
  }
}
