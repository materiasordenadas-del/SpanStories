/**
 * `CurrentStoryVersionResolver` implemented against PostgreSQL — see
 * `features/nlp/domain/current-version.ts` and
 * `db/migrations/0005_nlp_annotation_decisions.sql` (`story_authoring_state`).
 * `setCurrentEditableVersion` is the editorial workflow's write path; NLP
 * acceptance only ever calls `currentEditableVersionId`.
 */

import type { CurrentStoryVersionResolver } from "../../nlp/domain/current-version.ts";
import type { SqlDatabase } from "../db/sql-client.ts";

export class PostgresCurrentStoryVersionResolver implements CurrentStoryVersionResolver {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async currentEditableVersionId(storyId: string): Promise<string | null> {
    const result = await this.db.query<{ current_editable_version_id: string }>(
      "SELECT current_editable_version_id FROM story_authoring_state WHERE story_id = $1",
      [storyId],
    );
    return result.rows.length === 0 ? null : result.rows[0].current_editable_version_id;
  }

  async setCurrentEditableVersion(storyId: string, versionId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO story_authoring_state (story_id, current_editable_version_id) VALUES ($1, $2)
       ON CONFLICT (story_id) DO UPDATE SET current_editable_version_id = EXCLUDED.current_editable_version_id`,
      [storyId, versionId],
    );
  }
}
