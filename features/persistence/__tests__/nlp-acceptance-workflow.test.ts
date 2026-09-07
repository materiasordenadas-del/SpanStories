/**
 * Corrección 2 (post-Fase 6 corrective pass): the real NEW_OCCURRENCE
 * acceptance workflow against PGlite, using the actual Postgres-backed
 * repositories `acceptAnnotationCandidate` is wired with in production —
 * not a repository-level contract test that starts from an
 * already-persisted `StoryOccurrence` (`../testing/database-contract-suite.ts`'s
 * `assertAnnotationDecisionRepositoryContract` does that, and by construction
 * never exercises the moment a NEW_OCCURRENCE decision is recorded *before*
 * any `story_occurrences` row for it exists).
 *
 * `annotation_candidate_decisions.resulting_occurrence_id` (see
 * `db/migrations/0006_pending_new_occurrence_materialization.sql`) now
 * carries no foreign key into `story_occurrences`, precisely because
 * `acceptAnnotationCandidate`'s NEW_OCCURRENCE branch never inserts a
 * `StoryOccurrence` itself — it returns one for the caller's next
 * `saveNewVersion` call (`../../nlp/review/acceptance-service.ts`). This
 * file proves that gap end-to-end: accept, observe the decision exists with
 * no matching occurrence row yet, accept again and get
 * `CANDIDATE_ALREADY_DECIDED`, then materialize the occurrence into a real
 * `StoryVersion` and observe exactly one `story_occurrences` row appear —
 * never a second, differently-id'd one.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { asId, assembleStoryVersion, createStory } from "../../story-engine/index.ts";
import {
  acceptAnnotationCandidate,
  asId as asNlpId,
  type AcceptanceContext,
  type AnnotationCandidate,
} from "../../nlp/index.ts";
import { SequentialIdGenerator, FixedClock } from "../../nlp/__tests__/fixtures.ts";
import { openPGliteDatabase } from "../db/pglite-database.ts";
import { migrate } from "../db/migrate.ts";
import { PostgresStoryRepository } from "../repository/postgres-story-repository.ts";
import { PostgresAnnotationDecisionRepository } from "../repository/postgres-annotation-decision-repository.ts";
import { PostgresCurrentStoryVersionResolver } from "../repository/postgres-current-story-version-resolver.ts";
import type { SqlDatabase } from "../db/sql-client.ts";

const registry = loadCurriculumRegistry();
const clock = new FixedClock();

/**
 * A brand-new Story with one DRAFT StoryVersion, no occurrences yet, marked
 * as the story's current editable version — step 3/4 of the required
 * workflow ("crear StoryVersion DRAFT sin occurrences", "marcarla current
 * editable").
 */
async function setupDraftStory(db: SqlDatabase, ids: SequentialIdGenerator) {
  const storyRepo = new PostgresStoryRepository(db);
  const resolver = new PostgresCurrentStoryVersionResolver(db);

  const storyId = asId("StoryId", ids.next("StoryId"));
  const storyVersionId = asId("StoryVersionId", ids.next("StoryVersionId"));
  await storyRepo.saveStory(createStory(storyId, null, clock));

  const sentence = { id: asId("SentenceId", ids.next("SentenceId")), storyVersionId, order: 1, text: "hola mundo", tokens: [] };
  const version = assembleStoryVersion({ id: storyVersionId, storyId, versionNumber: 1, title: "T", sentences: [sentence], status: "DRAFT", clock });
  await storyRepo.saveNewVersion({ version, sentences: [sentence], anchors: [], occurrences: [], targetBindings: [] });
  await resolver.setCurrentEditableVersion(storyId, storyVersionId);

  return { storyRepo, resolver, storyId, storyVersionId, sentence };
}

/** A CONSTRUCTION candidate: no proposedLexemeId/proposedMwuTargetId/proposedGrammarTargetId, so acceptance needs no seeded curriculum/lexicon data in the database — only the in-memory `registry`, which it never queries for a CONSTRUCTION candidate. */
function constructionCandidate(candidateId: string, storyVersionId: string, sentenceId: string): AnnotationCandidate {
  return {
    candidateId: asNlpId("AnnotationCandidateId", candidateId),
    storyVersionId: storyVersionId as never,
    sentenceId: sentenceId as never,
    candidateType: "CONSTRUCTION",
    parts: [{ sentenceId: sentenceId as never, start: 0, end: 4, role: "ANCHOR", slotLabel: null }],
    proposedLexemeId: null,
    proposedSenseId: null,
    proposedFormId: null,
    proposedGrammarTargetId: null,
    proposedMwuTargetId: null,
    lexicalResolution: null,
    senseCandidates: [],
    constructionId: "TEST_CONSTRUCTION",
    confidence: null,
    evidence: "test fixture",
    sourceAdapter: "test",
    algorithmVersion: "test/1.0.0",
    provenance: { analyzer: "test", analyzerVersion: "1.0.0", modelName: null, modelVersion: null, algorithmVersion: "1.0.0", createdAt: clock.now().toISOString() },
    status: "CANDIDATE",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
  };
}

describe("persistence / NLP acceptance workflow (PGlite, real Postgres repositories)", () => {
  test("NEW_OCCURRENCE acceptance is decided before it is materialized, exactly once", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const ids = new SequentialIdGenerator();
      const { storyRepo, resolver, storyVersionId, sentence } = await setupDraftStory(db, ids);

      const decisionRepository = new PostgresAnnotationDecisionRepository(db);
      const ctx: AcceptanceContext = {
        storyRepository: storyRepo,
        registry,
        currentCurriculumReleaseId: registry.release.releaseId,
        currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        idGenerator: ids,
        clock,
        decisionRepository,
        currentStoryVersionResolver: resolver,
      };

      const candidate = constructionCandidate("nlpcand-e2e-1", storyVersionId, sentence.id);

      // 7. acceptAnnotationCandidate() — ACCEPT = PASS.
      const result = await acceptAnnotationCandidate(candidate, ctx);
      assert.equal(result.kind, "NEW_OCCURRENCE");

      // 8. decision row exists; resultingOccurrenceId + materialization exist.
      const decision = await decisionRepository.getByCandidateId(candidate.candidateId);
      assert.ok(decision !== null, "decision row must exist after accept()");
      assert.equal(decision!.decision, "ACCEPTED");
      assert.equal(decision!.resultKind, "NEW_OCCURRENCE");
      assert.equal(decision!.resultingOccurrenceId, result.occurrence.id, "resultingOccurrenceId must be the accepted materialization identity");
      assert.ok(decision!.materialization !== null, "materialization must exist");
      assert.deepEqual(decision!.materialization!.anchorIds, result.anchors.map((a) => a.id));

      // 9. no story_occurrences row exists yet for resultingOccurrenceId —
      //    NEW_OCCURRENCE acceptance never materializes into StoryVersion
      //    content itself; only a later saveNewVersion does.
      const occRows = await db.query("SELECT 1 FROM story_occurrences WHERE id = $1", [decision!.resultingOccurrenceId]);
      assert.equal(occRows.rows.length, 0, "no story_occurrences row must exist yet for the accepted-but-unmaterialized occurrence");

      // 10. accepting the same candidate again is CANDIDATE_ALREADY_DECIDED.
      await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_ALREADY_DECIDED/);

      // 11. resultingOccurrenceId is unchanged by the rejected second attempt.
      const decisionAfterRetry = await decisionRepository.getByCandidateId(candidate.candidateId);
      assert.equal(decisionAfterRetry!.resultingOccurrenceId, decision!.resultingOccurrenceId);
    } finally {
      await db.close();
    }
  });

  test("the accepted materialization can later be included in a new StoryVersion — exactly one story_occurrences row, same id", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const ids = new SequentialIdGenerator();
      const { storyRepo, resolver, storyId, storyVersionId, sentence } = await setupDraftStory(db, ids);

      const decisionRepository = new PostgresAnnotationDecisionRepository(db);
      const ctx: AcceptanceContext = {
        storyRepository: storyRepo,
        registry,
        currentCurriculumReleaseId: registry.release.releaseId,
        currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        idGenerator: ids,
        clock,
        decisionRepository,
        currentStoryVersionResolver: resolver,
      };

      const candidate = constructionCandidate("nlpcand-e2e-2", storyVersionId, sentence.id);
      const result = await acceptAnnotationCandidate(candidate, ctx);
      assert.equal(result.kind, "NEW_OCCURRENCE");
      const decision = await decisionRepository.getByCandidateId(candidate.candidateId);

      // A subsequent authoring version that includes exactly the accepted
      // materialization — the caller's responsibility per the acceptance
      // service's module doc, never acceptAnnotationCandidate's own.
      const nextVersionId = asId("StoryVersionId", ids.next("StoryVersionId"));
      const nextSentenceId = asId("SentenceId", ids.next("SentenceId"));
      const nextSentence = { ...sentence, id: nextSentenceId, storyVersionId: nextVersionId };
      const nextVersion = assembleStoryVersion({
        id: nextVersionId,
        storyId,
        versionNumber: 2,
        title: "T2",
        sentences: [nextSentence],
        status: "DRAFT",
        clock,
      });
      await storyRepo.saveNewVersion({
        version: nextVersion,
        sentences: [nextSentence],
        anchors: result.anchors.map((a) => ({ ...a, storyVersionId: nextVersionId, sentenceId: nextSentenceId })),
        occurrences: [{ ...result.occurrence, storyVersionId: nextVersionId, sentenceId: nextSentenceId }],
        targetBindings: result.targetBinding !== null ? [{ ...result.targetBinding, storyVersionId: nextVersionId }] : [],
      });

      const rows = await db.query<{ id: string }>("SELECT id FROM story_occurrences WHERE id = $1", [decision!.resultingOccurrenceId]);
      assert.equal(rows.rows.length, 1, "exactly one story_occurrences row must now exist");
      assert.equal(rows.rows[0].id, result.occurrence.id, "no second occurrenceId must ever be generated");

      // The original decision is untouched by the later materialization.
      const decisionAfter = await decisionRepository.getByCandidateId(candidate.candidateId);
      assert.deepEqual(decisionAfter, decision);
    } finally {
      await db.close();
    }
  });

  test("concurrent accept(X) x2 against real Postgres repositories yields exactly one decision and one materialization identity", async () => {
    const db = await openPGliteDatabase();
    try {
      await migrate(db);
      const ids = new SequentialIdGenerator();
      const { storyRepo, resolver, storyVersionId, sentence } = await setupDraftStory(db, ids);

      const decisionRepository = new PostgresAnnotationDecisionRepository(db);
      const ctx: AcceptanceContext = {
        storyRepository: storyRepo,
        registry,
        currentCurriculumReleaseId: registry.release.releaseId,
        currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        idGenerator: ids,
        clock,
        decisionRepository,
        currentStoryVersionResolver: resolver,
      };

      const candidate = constructionCandidate("nlpcand-e2e-race", storyVersionId, sentence.id);
      const results = await Promise.allSettled([acceptAnnotationCandidate(candidate, ctx), acceptAnnotationCandidate(candidate, ctx)]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(fulfilled.length, 1, "exactly one concurrent accept() must win");
      assert.equal(rejected.length, 1, "the other must observe CANDIDATE_ALREADY_DECIDED, not silently succeed");

      const decision = await decisionRepository.getByCandidateId(candidate.candidateId);
      assert.ok(decision !== null);
      assert.equal(decision!.resultKind, "NEW_OCCURRENCE");
    } finally {
      await db.close();
    }
  });
});
