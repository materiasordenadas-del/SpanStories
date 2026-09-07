/**
 * `StoryRepository` implemented against PostgreSQL (via `SqlDatabase` — see
 * `../db/sql-client.ts` for why this file never imports PGlite directly).
 *
 * Contract-identical to `features/story-engine/repository/in-memory-story-repository.ts`:
 * `../__tests__/story-repository.test.ts` runs the same assertions against
 * both. There is still no `updateVersion`/`updateOccurrence` method — a
 * published `StoryVersion`'s text is protected twice over: this class never
 * issues an `UPDATE ... SET text = ...`, and `db/migrations/0003_story_engine.sql`'s
 * trigger rejects one at the database level even if some future code tried.
 *
 * `StorySentence.tokens` always reads back `[]`: no `surface_tokens` table
 * exists yet, because nothing published through phase 5 ever produces a
 * non-empty token list (see `docs/story-engine-implementation.md` §8). This
 * is the same known, deliberate gap phase 3 already documented, carried
 * forward rather than persisted speculatively.
 */

import {
  asId,
  type OccurrenceAnnotationRevision,
  type OccurrencePart,
  type Story,
  type StoryId,
  type StoryOccurrence,
  type StoryOccurrenceId,
  type StorySentence,
  type StoryTargetBinding,
  type StoryVersion,
  type StoryVersionId,
  type TextAnchor,
} from "../../story-engine/index.ts";
import type { NewVersionInput, StoryRepository } from "../../story-engine/index.ts";
import type { SqlClient, SqlDatabase } from "../db/sql-client.ts";

type StoryRow = { id: string; story_blueprint_id: string | null; status: string; created_at: string };
function toStory(row: StoryRow): Story {
  return {
    id: asId("StoryId", row.id),
    storyBlueprintId: row.story_blueprint_id as never,
    status: row.status as Story["status"],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type VersionRow = {
  id: string;
  story_id: string;
  version_number: number;
  title: string;
  text: string;
  status: string;
  created_at: string;
  published_at: string | null;
};
function toVersion(row: VersionRow): StoryVersion {
  return {
    id: asId("StoryVersionId", row.id),
    storyId: asId("StoryId", row.story_id),
    versionNumber: row.version_number,
    title: row.title,
    text: row.text,
    status: row.status as StoryVersion["status"],
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
  };
}

type SentenceRow = { id: string; story_version_id: string; order: number; text: string };
function toSentence(row: SentenceRow): StorySentence {
  return {
    id: asId("SentenceId", row.id),
    storyVersionId: asId("StoryVersionId", row.story_version_id),
    order: row.order,
    text: row.text,
    tokens: [],
  };
}

type AnchorRow = { id: string; story_version_id: string; sentence_id: string; start_offset: number; end_offset: number };
function toAnchor(row: AnchorRow): TextAnchor {
  return {
    id: asId("TextAnchorId", row.id),
    storyVersionId: asId("StoryVersionId", row.story_version_id),
    sentenceId: asId("SentenceId", row.sentence_id),
    start: row.start_offset,
    end: row.end_offset,
  };
}

type OccurrenceRow = {
  id: string;
  story_version_id: string;
  sentence_id: string;
  kind: "LEXICAL" | "CONSTRUCTION";
  surface: string;
  lexeme_id: string | null;
  sense_id: string | null;
  lexeme_form_id: string | null;
  sense_resolution_status: string | null;
  construction_id: string | null;
};
type PartRow = { id: string; occurrence_id: string; anchor_id: string; role: string; order: number; slot_label: string | null };

function toPart(row: PartRow): OccurrencePart {
  return {
    id: asId("OccurrencePartId", row.id),
    occurrenceId: asId("StoryOccurrenceId", row.occurrence_id),
    anchorId: asId("TextAnchorId", row.anchor_id),
    role: row.role as OccurrencePart["role"],
    order: row.order,
    slotLabel: row.slot_label,
  };
}

function toOccurrence(row: OccurrenceRow, parts: readonly OccurrencePart[]): StoryOccurrence {
  const base = {
    id: asId("StoryOccurrenceId", row.id),
    storyVersionId: asId("StoryVersionId", row.story_version_id),
    sentenceId: asId("SentenceId", row.sentence_id),
    surface: row.surface,
    parts,
  };
  if (row.kind === "LEXICAL") {
    return {
      ...base,
      kind: "LEXICAL",
      lexemeId: row.lexeme_id as never,
      senseId: row.sense_id as never,
      lexemeFormId: row.lexeme_form_id as never,
      senseResolutionStatus: row.sense_resolution_status as never,
    };
  }
  return { ...base, kind: "CONSTRUCTION", constructionId: row.construction_id as string };
}

type BindingRow = {
  id: string;
  story_id: string;
  story_version_id: string;
  occurrence_id: string;
  target_type: string;
  target_id: string;
  binding_kind: string;
  salience: string | null;
  productive_claim: string;
};
function toBinding(row: BindingRow): StoryTargetBinding {
  return {
    id: asId("StoryTargetBindingId", row.id),
    storyId: asId("StoryId", row.story_id),
    storyVersionId: asId("StoryVersionId", row.story_version_id),
    occurrenceId: asId("StoryOccurrenceId", row.occurrence_id),
    targetType: row.target_type as StoryTargetBinding["targetType"],
    targetId: row.target_id,
    bindingKind: row.binding_kind as StoryTargetBinding["bindingKind"],
    salience: row.salience as StoryTargetBinding["salience"],
    productiveClaim: row.productive_claim as StoryTargetBinding["productiveClaim"],
  };
}

type RevisionRow = {
  id: string;
  occurrence_id: string;
  previous_lexeme_id: string | null;
  new_lexeme_id: string | null;
  previous_sense_id: string | null;
  new_sense_id: string | null;
  reason: string;
  lexicon_release_id: string;
  editorial_reference: string | null;
  created_at: string;
};
function toRevision(row: RevisionRow): OccurrenceAnnotationRevision {
  return {
    id: asId("OccurrenceAnnotationRevisionId", row.id),
    occurrenceId: asId("StoryOccurrenceId", row.occurrence_id),
    previousLexemeId: row.previous_lexeme_id as never,
    newLexemeId: row.new_lexeme_id as never,
    previousSenseId: row.previous_sense_id as never,
    newSenseId: row.new_sense_id as never,
    reason: row.reason,
    lexiconReleaseId: row.lexicon_release_id as never,
    editorialReference: row.editorial_reference,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function loadPartsForOccurrences(tx: SqlClient, occurrenceIds: readonly string[]): Promise<Map<string, OccurrencePart[]>> {
  const byOccurrence = new Map<string, OccurrencePart[]>();
  if (occurrenceIds.length === 0) return byOccurrence;
  const result = await tx.query<PartRow>(
    `SELECT * FROM occurrence_parts WHERE occurrence_id = ANY($1) ORDER BY "order"`,
    [occurrenceIds],
  );
  for (const row of result.rows) {
    const part = toPart(row);
    const bucket = byOccurrence.get(row.occurrence_id);
    if (bucket === undefined) byOccurrence.set(row.occurrence_id, [part]);
    else bucket.push(part);
  }
  return byOccurrence;
}

export class PostgresStoryRepository implements StoryRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async getStory(id: StoryId): Promise<Story | null> {
    const result = await this.db.query<StoryRow>("SELECT * FROM stories WHERE id = $1", [id]);
    return result.rows.length === 0 ? null : toStory(result.rows[0]);
  }

  async saveStory(story: Story): Promise<void> {
    await this.db.query(
      "INSERT INTO stories (id, story_blueprint_id, status, created_at) VALUES ($1, $2, $3, $4)",
      [story.id, story.storyBlueprintId, story.status, story.createdAt],
    );
  }

  async getStoryVersion(id: StoryVersionId): Promise<StoryVersion | null> {
    const result = await this.db.query<VersionRow>("SELECT * FROM story_versions WHERE id = $1", [id]);
    return result.rows.length === 0 ? null : toVersion(result.rows[0]);
  }

  async listVersions(storyId: StoryId): Promise<readonly StoryVersion[]> {
    const result = await this.db.query<VersionRow>(
      "SELECT * FROM story_versions WHERE story_id = $1 ORDER BY version_number",
      [storyId],
    );
    return result.rows.map(toVersion);
  }

  async getPublishedVersion(storyId: StoryId): Promise<StoryVersion | null> {
    const result = await this.db.query<VersionRow>(
      "SELECT * FROM story_versions WHERE story_id = $1 AND status = 'PUBLISHED' ORDER BY version_number DESC LIMIT 1",
      [storyId],
    );
    return result.rows.length === 0 ? null : toVersion(result.rows[0]);
  }

  async saveNewVersion(input: NewVersionInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const v = input.version;
      await tx.query(
        "INSERT INTO story_versions (id, story_id, version_number, title, text, status, created_at, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [v.id, v.storyId, v.versionNumber, v.title, v.text, v.status, v.createdAt, v.publishedAt],
      );

      for (const s of input.sentences) {
        await tx.query(
          `INSERT INTO story_sentences (id, story_version_id, "order", text) VALUES ($1, $2, $3, $4)`,
          [s.id, s.storyVersionId, s.order, s.text],
        );
      }

      for (const a of input.anchors) {
        await tx.query(
          "INSERT INTO text_anchors (id, story_version_id, sentence_id, start_offset, end_offset) VALUES ($1, $2, $3, $4, $5)",
          [a.id, a.storyVersionId, a.sentenceId, a.start, a.end],
        );
      }

      for (const o of input.occurrences) {
        const isLexical = o.kind === "LEXICAL";
        await tx.query(
          "INSERT INTO story_occurrences (id, story_version_id, sentence_id, kind, surface, lexeme_id, sense_id, lexeme_form_id, sense_resolution_status, construction_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
          [
            o.id,
            o.storyVersionId,
            o.sentenceId,
            o.kind,
            o.surface,
            isLexical ? o.lexemeId : null,
            isLexical ? o.senseId : null,
            isLexical ? o.lexemeFormId : null,
            isLexical ? o.senseResolutionStatus : null,
            isLexical ? null : o.constructionId,
          ],
        );
        for (const part of o.parts) {
          await tx.query(
            `INSERT INTO occurrence_parts (id, occurrence_id, anchor_id, role, "order", slot_label) VALUES ($1, $2, $3, $4, $5, $6)`,
            [part.id, part.occurrenceId, part.anchorId, part.role, part.order, part.slotLabel],
          );
        }
      }

      for (const b of input.targetBindings) {
        await tx.query(
          "INSERT INTO story_target_bindings (id, story_id, story_version_id, occurrence_id, target_type, target_id, binding_kind, salience, productive_claim) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [b.id, b.storyId, b.storyVersionId, b.occurrenceId, b.targetType, b.targetId, b.bindingKind, b.salience, b.productiveClaim],
        );
      }
    });
  }

  async markPublished(version: StoryVersion): Promise<void> {
    const existing = await this.getStoryVersion(version.id);
    if (existing === null) {
      throw new Error(`UNKNOWN_STORY_VERSION: cannot publish ${version.id}, it was never saved`);
    }
    if (existing.text !== version.text || existing.title !== version.title) {
      throw new Error(`STORY_VERSION_TEXT_IMMUTABLE: markPublished must not change text/title of ${version.id}`);
    }
    await this.db.query(
      "UPDATE story_versions SET status = $2, published_at = $3 WHERE id = $1",
      [version.id, version.status, version.publishedAt],
    );
  }

  async listSentences(storyVersionId: StoryVersionId): Promise<readonly StorySentence[]> {
    const result = await this.db.query<SentenceRow>(
      `SELECT * FROM story_sentences WHERE story_version_id = $1 ORDER BY "order"`,
      [storyVersionId],
    );
    return result.rows.map(toSentence);
  }

  async listAnchors(storyVersionId: StoryVersionId): Promise<readonly TextAnchor[]> {
    const result = await this.db.query<AnchorRow>("SELECT * FROM text_anchors WHERE story_version_id = $1", [storyVersionId]);
    return result.rows.map(toAnchor);
  }

  async getOccurrence(id: StoryOccurrenceId): Promise<StoryOccurrence | null> {
    const result = await this.db.query<OccurrenceRow>("SELECT * FROM story_occurrences WHERE id = $1", [id]);
    if (result.rows.length === 0) return null;
    const parts = await loadPartsForOccurrences(this.db, [id]);
    return toOccurrence(result.rows[0], parts.get(id) ?? []);
  }

  async listOccurrences(storyVersionId: StoryVersionId): Promise<readonly StoryOccurrence[]> {
    const result = await this.db.query<OccurrenceRow>(
      "SELECT * FROM story_occurrences WHERE story_version_id = $1",
      [storyVersionId],
    );
    const parts = await loadPartsForOccurrences(this.db, result.rows.map((r) => r.id));
    return result.rows.map((row) => toOccurrence(row, parts.get(row.id) ?? []));
  }

  async listTargetBindings(storyVersionId: StoryVersionId): Promise<readonly StoryTargetBinding[]> {
    const result = await this.db.query<BindingRow>(
      "SELECT * FROM story_target_bindings WHERE story_version_id = $1",
      [storyVersionId],
    );
    return result.rows.map(toBinding);
  }

  async appendAnnotationRevision(revision: OccurrenceAnnotationRevision): Promise<void> {
    await this.db.query(
      "INSERT INTO occurrence_annotation_revisions (id, occurrence_id, previous_lexeme_id, new_lexeme_id, previous_sense_id, new_sense_id, reason, lexicon_release_id, editorial_reference, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        revision.id,
        revision.occurrenceId,
        revision.previousLexemeId,
        revision.newLexemeId,
        revision.previousSenseId,
        revision.newSenseId,
        revision.reason,
        revision.lexiconReleaseId,
        revision.editorialReference,
        revision.createdAt,
      ],
    );
  }

  async listAnnotationRevisions(occurrenceId: StoryOccurrenceId): Promise<readonly OccurrenceAnnotationRevision[]> {
    const result = await this.db.query<RevisionRow>(
      "SELECT * FROM occurrence_annotation_revisions WHERE occurrence_id = $1 ORDER BY created_at",
      [occurrenceId],
    );
    return result.rows.map(toRevision);
  }
}
