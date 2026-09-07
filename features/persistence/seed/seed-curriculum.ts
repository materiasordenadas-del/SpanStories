/**
 * Seed the database from the canonical registry — never from re-parsing CSV.
 *
 * `seedCurriculum` takes an already-loaded `CurriculumRegistry` and
 * `LexicalEngine` (built the normal way, via
 * `loadCurriculumRegistry()`/`loadLexicalEngine()`) and inserts every row in
 * one transaction: partial failure rolls back the whole release, never a
 * half-seeded database (section 49 of the governing plan).
 *
 * Every table keeps a `data JSONB` column carrying every published field
 * this schema does not promote to its own indexed/constrained column — see
 * `docs/data-model.md` §3. This function is the only place that shape gets
 * decided; the migrations themselves don't know the domain's TypeScript
 * types.
 */

import type { CurriculumRegistry } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";
import type { SqlClient, SqlDatabase } from "../db/sql-client.ts";

const CHUNK_SIZE = 200;

async function insertRows(
  tx: SqlClient,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<void> {
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const valuesSql = chunk
      .map((row, rowIndex) => {
        const placeholders = row.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`);
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");
    const params = chunk.flat();
    await tx.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesSql}`,
      params,
    );
  }
}

export type SeedResult = {
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
  readonly counts: Readonly<Record<string, number>>;
};

export async function seedCurriculum(
  db: SqlDatabase,
  registry: CurriculumRegistry,
  lexicalEngine: LexicalEngine,
): Promise<SeedResult> {
  const data = registry.data;
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // ---------------------------------------------------------- lexical
    await tx.query(
      "INSERT INTO lexicon_releases (release_id, curriculum_release_id, schema_version, data) VALUES ($1, $2, $3, $4)",
      [lexicalEngine.release.releaseId, lexicalEngine.release.curriculumReleaseId, lexicalEngine.release.schemaVersion, JSON.stringify(lexicalEngine.release)],
    );

    await insertRows(tx, "lexemes", ["id", "lemma", "type", "data"], data.lexemes.map((l) => [l.id, l.lemma, l.type, JSON.stringify(l)]));
    counts.lexemes = data.lexemes.length;

    await insertRows(tx, "lexeme_forms", ["id", "lexeme_id", "surface", "data"], data.lexemeForms.map((f) => [f.id, f.lexemeId, f.surface, JSON.stringify(f)]));
    counts.lexemeForms = data.lexemeForms.length;

    await insertRows(tx, "senses", ["id", "lexeme_id", "status", "is_a1", "data"], data.senses.map((s) => [s.id, s.lexemeId, s.status, s.isA1, JSON.stringify(s)]));
    counts.senses = data.senses.length;

    await insertRows(tx, "mwu_units", ["id", "lexeme_id", "sense_id", "data"], data.mwuUnits.map((m) => [m.id, m.lexemeId, m.senseId, JSON.stringify(m)]));
    counts.mwuUnits = data.mwuUnits.length;

    await insertRows(tx, "grammar_units", ["id", "data"], data.grammarUnits.map((g) => [g.id, JSON.stringify(g)]));
    counts.grammarUnits = data.grammarUnits.length;

    await insertRows(
      tx,
      "source_assertions",
      ["id", "sense_id", "lexeme_id", "data"],
      data.sourceAssertions.map((a) => [a.id, a.senseId, a.lexemeId, JSON.stringify(a)]),
    );
    counts.sourceAssertions = data.sourceAssertions.length;

    if (lexicalEngine.lineage.events.length > 0) {
      await insertRows(
        tx,
        "lexeme_lineage_events",
        ["id", "kind", "source_lexeme_ids", "target_lexeme_ids", "semantics", "transfer_policy", "effective_release", "reason"],
        lexicalEngine.lineage.events.map((e) => [e.id, e.kind, e.sourceLexemeIds, e.targetLexemeIds, e.semantics, e.transferPolicy, e.effectiveRelease, e.reason]),
      );
    }
    counts.lineageEvents = lexicalEngine.lineage.events.length;

    // -------------------------------------------------------- curriculum
    await tx.query(
      "INSERT INTO curriculum_releases (release_id, schema_version, content_hash, data) VALUES ($1, $2, $3, $4)",
      [registry.release.releaseId, registry.release.schemaVersion, registry.release.contentHash, JSON.stringify(registry.release)],
    );

    await insertRows(
      tx,
      "modules",
      ["id", "curriculum_release_id", `"order"`, "name", "data"],
      data.modules.map((m) => [m.id, registry.release.releaseId, m.order, m.name, JSON.stringify(m)]),
    );
    counts.modules = data.modules.length;

    await insertRows(
      tx,
      "islands",
      ["id", "module_id", "curriculum_release_id", "global_island_order", "data"],
      data.islands.map((i) => [i.id, i.moduleId, registry.release.releaseId, i.globalIslandOrder, JSON.stringify(i)]),
    );
    counts.islands = data.islands.length;

    await insertRows(
      tx,
      "story_blueprints",
      ["id", "module_id", "island_id", "sequence_index", "role", "data"],
      data.storyBlueprints.map((s) => [s.id, s.moduleId, s.islandId, s.sequenceIndex, s.role, JSON.stringify(s)]),
    );
    counts.storyBlueprints = data.storyBlueprints.length;

    await insertRows(
      tx,
      "curriculum_targets",
      ["allocation_id", "target_type", "target_id", "lexeme_id", "sense_id", "intro_salience", "first_introduction_story_id", "regional_policy", "data"],
      data.targets.map((t) => [t.allocationId, t.targetType, t.targetId, t.lexemeId, t.senseId, t.introSalience, t.firstIntroductionStoryId, t.regionalPolicy, JSON.stringify(t)]),
    );
    counts.targets = data.targets.length;

    await insertRows(
      tx,
      "recycle_edges",
      ["id", "target_type", "target_id", "introduction_story_id", "return_stage", "return_story_id", "data"],
      data.recycleEdges.map((e) => [e.id, e.targetType, e.targetId, e.introductionStoryId, e.returnStage, e.returnStoryId, JSON.stringify(e)]),
    );
    counts.recycleEdges = data.recycleEdges.length;
  });

  return { curriculumReleaseId: registry.release.releaseId, lexiconReleaseId: lexicalEngine.release.releaseId, counts };
}
