/**
 * Corrección post-Fase 6 (B/C/D): `acceptAnnotationCandidate` hardening.
 *
 *   B — exactly-once acceptance, sequential, concurrent, and across a
 *       decision-first/atomic REVISION commit (`AnnotationAcceptanceUnitOfWork`).
 *   C — a candidate naming a `StoryVersion` that still exists but is no
 *       longer the story's current editable version is `STALE_CANDIDATE`.
 *   D — a LEXICAL reannotation candidate can never reinterpret a
 *       CONSTRUCTION occurrence via a type assertion.
 *
 * See `../review/acceptance-service.ts` for the mechanism each test proves.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptAnnotationCandidate,
  rejectAnnotationCandidate,
  asId as asNlpId,
  InMemoryAnnotationDecisionRepository,
  InMemoryCurrentStoryVersionResolver,
  InMemoryAnnotationAcceptanceUnitOfWork,
  type AnnotationCandidate,
  type AcceptanceContext,
} from "../index.ts";
import {
  assembleStoryVersion,
  createConstructionOccurrence,
  createLexicalOccurrence,
  createTextAnchor,
} from "../../story-engine/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { registry, FixedClock, SequentialIdGenerator, buildStoryWithSentences } from "./fixtures.ts";

const clock = new FixedClock();
const LEXEME = "LEX-A1-000001" as never;

function lexicalCandidate(overrides: Partial<AnnotationCandidate> = {}): AnnotationCandidate {
  return {
    candidateId: asNlpId("AnnotationCandidateId", "nlpcand-hardening-1"),
    storyVersionId: "storyver-placeholder" as never,
    sentenceId: "sent-placeholder" as never,
    candidateType: "LEXICAL",
    parts: [{ sentenceId: "sent-placeholder" as never, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    proposedLexemeId: LEXEME,
    proposedSenseId: null,
    proposedFormId: null,
    proposedGrammarTargetId: null,
    proposedMwuTargetId: null,
    lexicalResolution: null,
    senseCandidates: [],
    constructionId: null,
    confidence: null,
    evidence: "test fixture",
    sourceAdapter: "test",
    algorithmVersion: "test/1.0.0",
    provenance: { analyzer: "test", analyzerVersion: "1.0.0", modelName: null, modelVersion: null, algorithmVersion: "1.0.0", createdAt: clock.now().toISOString() },
    status: "CANDIDATE",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    ...overrides,
  };
}

/** A story with one sentence ("hola mundo") and its current version set as editable. */
async function setup() {
  const ids = new SequentialIdGenerator();
  const { repo, storyId, storyVersionId, sentences } = await buildStoryWithSentences(["hola mundo"], ids, clock);
  const currentStoryVersionResolver = new InMemoryCurrentStoryVersionResolver();
  currentStoryVersionResolver.setCurrentEditableVersion(storyId, storyVersionId);
  const decisionRepository = new InMemoryAnnotationDecisionRepository();
  const ctx: AcceptanceContext = {
    storyRepository: repo,
    registry,
    currentCurriculumReleaseId: registry.release.releaseId,
    currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    idGenerator: ids,
    clock,
    decisionRepository,
    currentStoryVersionResolver,
  };
  return { ids, repo, storyId, storyVersionId, sentence: sentences[0], ctx, decisionRepository, currentStoryVersionResolver };
}

/**
 * A story whose *current* version already carries one real occurrence — a
 * fresh version minted on top of `setup()`'s empty one, since a
 * `StoryVersion`'s content is only ever written whole
 * (`docs/story-engine-implementation.md`). Used by every reannotation test.
 */
async function setupWithOccurrence(kind: "LEXICAL" | "CONSTRUCTION") {
  const base = await setup();
  const versionId = "storyver-occ" as never;
  const sentence = { id: "sent-occ" as never, storyVersionId: versionId, order: 1, text: "hola mundo", tokens: [] as never[] };
  const anchor = createTextAnchor(base.ids.next("TextAnchorId") as never, versionId, sentence, { start: 0, end: 4 });
  const occurrence =
    kind === "LEXICAL"
      ? createLexicalOccurrence({
          id: base.ids.next("StoryOccurrenceId") as never,
          storyVersionId: versionId,
          sentenceId: sentence.id,
          surface: "hola",
          lexemeId: LEXEME,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "UNRESOLVED",
          parts: [{ id: base.ids.next("OccurrencePartId") as never, anchor, role: "HEAD" }],
        })
      : createConstructionOccurrence({
          id: base.ids.next("StoryOccurrenceId") as never,
          storyVersionId: versionId,
          sentenceId: sentence.id,
          surface: "hola",
          constructionId: "TEST_CONSTRUCTION",
          parts: [{ id: base.ids.next("OccurrencePartId") as never, anchor, role: "ANCHOR", slotLabel: null }],
        });
  const version = assembleStoryVersion({ id: versionId, storyId: base.storyId, versionNumber: 2, title: "T2", sentences: [sentence], status: "DRAFT", clock });
  await base.repo.saveNewVersion({ version, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });
  base.currentStoryVersionResolver.setCurrentEditableVersion(base.storyId, versionId);
  return { ...base, versionId, sentence, occurrence };
}

describe("nlp / acceptance hardening — Corrección B (exactly-once)", () => {
  test("B1. accept(X) succeeds and records a decision", async () => {
    const { ctx, sentence } = await setup();
    const candidate = lexicalCandidate({ storyVersionId: sentence.storyVersionId, sentenceId: sentence.id, parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    const result = await acceptAnnotationCandidate(candidate, ctx);
    assert.equal(result.kind, "NEW_OCCURRENCE");
    const decision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
    assert.equal(decision?.decision, "ACCEPTED");
  });

  test("B2. accept(X) again never creates a second occurrence", async () => {
    const { ctx, repo, sentence, storyVersionId } = await setup();
    const candidate = lexicalCandidate({ storyVersionId: sentence.storyVersionId, sentenceId: sentence.id, parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    const first = await acceptAnnotationCandidate(candidate, ctx);
    assert.equal(first.kind, "NEW_OCCURRENCE");
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_ALREADY_DECIDED/);
    // Acceptance never persists NEW_OCCURRENCE occurrences itself (that is
    // the caller's saveNewVersion responsibility) — what matters is that no
    // second decision, and no second materialization, was ever produced.
    const decision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
    assert.equal(decision?.resultKind, "NEW_OCCURRENCE");
    assert.equal((await repo.listOccurrences(storyVersionId)).length, 0);
  });

  test("B3. reject(X) succeeds and records a decision", async () => {
    const { ctx } = await setup();
    const candidate = lexicalCandidate();
    const rejected = await rejectAnnotationCandidate(candidate, "not useful", clock, ctx);
    assert.equal(rejected.candidateId, candidate.candidateId);
    const decision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
    assert.equal(decision?.decision, "REJECTED");
  });

  test("B4. accept(X) after reject(X) fails", async () => {
    const { ctx, sentence } = await setup();
    const candidate = lexicalCandidate({ storyVersionId: sentence.storyVersionId, sentenceId: sentence.id, parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    await rejectAnnotationCandidate(candidate, "not useful", clock, ctx);
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_ALREADY_DECIDED/);
  });

  test("B5. reject(X) after accept(X) fails", async () => {
    const { ctx, sentence } = await setup();
    const candidate = lexicalCandidate({ storyVersionId: sentence.storyVersionId, sentenceId: sentence.id, parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    await acceptAnnotationCandidate(candidate, ctx);
    await assert.rejects(() => rejectAnnotationCandidate(candidate, "changed my mind", clock, ctx), /CANDIDATE_ALREADY_DECIDED/);
  });

  test("B6. concurrent accept(X) x2 yields exactly one logical acceptance", async () => {
    const { ctx, sentence } = await setup();
    const candidate = lexicalCandidate({ storyVersionId: sentence.storyVersionId, sentenceId: sentence.id, parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    const results = await Promise.allSettled([acceptAnnotationCandidate(candidate, ctx), acceptAnnotationCandidate(candidate, ctx)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent accept() must win");
    assert.equal(rejected.length, 1, "the other must observe CANDIDATE_ALREADY_DECIDED");
    const decision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
    assert.ok(decision !== null);
  });

  test("B7. a candidate that reannotates produces at most one OccurrenceAnnotationRevision, even under a concurrent double-accept", async () => {
    const { ctx, repo, sentence, occurrence, decisionRepository } = await setupWithOccurrence("LEXICAL");

    const reannotateCtx: AcceptanceContext = {
      ...ctx,
      reannotatesOccurrenceId: occurrence.id,
      unitOfWork: new InMemoryAnnotationAcceptanceUnitOfWork(repo, decisionRepository),
    };
    const reannotation = lexicalCandidate({
      candidateId: asNlpId("AnnotationCandidateId", "nlpcand-hardening-reannotate"),
      storyVersionId: sentence.storyVersionId,
      sentenceId: sentence.id,
      parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });

    const results = await Promise.allSettled([
      acceptAnnotationCandidate(reannotation, reannotateCtx),
      acceptAnnotationCandidate(reannotation, reannotateCtx),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);

    const revisions = await repo.listAnnotationRevisions(occurrence.id);
    assert.equal(revisions.length, 1, "at most one OccurrenceAnnotationRevision must exist, never two");
  });

  test("B8. AnnotationDecisionRepository enforces candidateId uniqueness directly", async () => {
    const { decisionRepository } = await setup();
    const candidateId = asNlpId("AnnotationCandidateId", "nlpcand-hardening-unique");
    await decisionRepository.recordRejected({ candidateId, decidedAt: clock.now().toISOString(), reason: "first" });
    await assert.rejects(
      () => decisionRepository.recordRejected({ candidateId, decidedAt: clock.now().toISOString(), reason: "second" }),
      /CANDIDATE_ALREADY_DECIDED/,
    );
  });
});

describe("nlp / acceptance hardening — Corrección C (stale StoryVersion authority)", () => {
  test("a candidate naming a StoryVersion that still exists, but is no longer current, is STALE_CANDIDATE", async () => {
    const ids = new SequentialIdGenerator();
    const { repo, storyId, storyVersionId: versionA, sentences } = await buildStoryWithSentences(["hola mundo"], ids, clock);
    const sentenceA = sentences[0];

    // A second, newer authoring version supersedes A — A is still stored and readable.
    const versionB = "storyver-2" as never;
    const sentenceB = { ...sentenceA, storyVersionId: versionB };
    const versionBRecord = { ...(await repo.getStoryVersion(versionA))!, id: versionB, versionNumber: 2 };
    await repo.saveNewVersion({ version: versionBRecord, sentences: [sentenceB], anchors: [], occurrences: [], targetBindings: [] });

    const currentStoryVersionResolver = new InMemoryCurrentStoryVersionResolver();
    currentStoryVersionResolver.setCurrentEditableVersion(storyId, versionB);

    const ctx: AcceptanceContext = {
      storyRepository: repo,
      registry,
      currentCurriculumReleaseId: registry.release.releaseId,
      currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      idGenerator: ids,
      clock,
      decisionRepository: new InMemoryAnnotationDecisionRepository(),
      currentStoryVersionResolver,
    };

    // The candidate names the now-superseded version A, which the repository
    // still has (never deleted) — existence alone must not be enough.
    const candidate = lexicalCandidate({ storyVersionId: versionA, sentenceId: sentenceA.id, parts: [{ sentenceId: sentenceA.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    assert.ok(await repo.getStoryVersion(versionA), "version A must still exist and be readable");
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /STALE_CANDIDATE/);
  });

  test("no current editable version designated at all fails closed", async () => {
    const ids = new SequentialIdGenerator();
    const { repo, sentences } = await buildStoryWithSentences(["hola mundo"], ids, clock);
    const ctx: AcceptanceContext = {
      storyRepository: repo,
      registry,
      currentCurriculumReleaseId: registry.release.releaseId,
      currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      idGenerator: ids,
      clock,
      decisionRepository: new InMemoryAnnotationDecisionRepository(),
      currentStoryVersionResolver: new InMemoryCurrentStoryVersionResolver(), // nothing set
    };
    const candidate = lexicalCandidate({ storyVersionId: sentences[0].storyVersionId, sentenceId: sentences[0].id, parts: [{ sentenceId: sentences[0].id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /STALE_CANDIDATE/);
  });

  test("historicalReannotationAuthorized=true with an editorialReference permits accepting against a non-current version", async () => {
    const ids = new SequentialIdGenerator();
    const { repo, storyId, storyVersionId: versionA, sentences } = await buildStoryWithSentences(["hola mundo"], ids, clock);
    const sentenceA = sentences[0];
    const versionB = "storyver-2" as never;
    const versionBRecord = { ...(await repo.getStoryVersion(versionA))!, id: versionB, versionNumber: 2 };
    await repo.saveNewVersion({ version: versionBRecord, sentences: [{ ...sentenceA, storyVersionId: versionB }], anchors: [], occurrences: [], targetBindings: [] });

    const currentStoryVersionResolver = new InMemoryCurrentStoryVersionResolver();
    currentStoryVersionResolver.setCurrentEditableVersion(storyId, versionB);

    const ctx: AcceptanceContext = {
      storyRepository: repo,
      registry,
      currentCurriculumReleaseId: registry.release.releaseId,
      currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      idGenerator: ids,
      clock,
      decisionRepository: new InMemoryAnnotationDecisionRepository(),
      currentStoryVersionResolver,
      historicalReannotationAuthorized: true,
      editorialReference: "EDITORIAL-REF-42",
    };
    const candidate = lexicalCandidate({ storyVersionId: versionA, sentenceId: sentenceA.id, parts: [{ sentenceId: sentenceA.id, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    const result = await acceptAnnotationCandidate(candidate, ctx);
    assert.equal(result.kind, "NEW_OCCURRENCE");
  });
});

describe("nlp / acceptance hardening — Corrección D (reannotation kind guard)", () => {
  test("D1. reannotating a LEXICAL occurrence succeeds", async () => {
    const { ctx, sentence, occurrence } = await setupWithOccurrence("LEXICAL");
    const reannotateCtx: AcceptanceContext = { ...ctx, reannotatesOccurrenceId: occurrence.id };
    const reannotation = lexicalCandidate({
      candidateId: asNlpId("AnnotationCandidateId", "nlpcand-hardening-d1"),
      storyVersionId: sentence.storyVersionId,
      sentenceId: sentence.id,
      parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    const result = await acceptAnnotationCandidate(reannotation, reannotateCtx);
    assert.equal(result.kind, "REVISION");
  });

  test("D2. a LEXICAL reannotation candidate against a CONSTRUCTION occurrence fails with CANDIDATE_REANNOTATION_KIND_MISMATCH", async () => {
    const { ctx, sentence, occurrence } = await setupWithOccurrence("CONSTRUCTION");
    const reannotateCtx: AcceptanceContext = { ...ctx, reannotatesOccurrenceId: occurrence.id };
    const reannotation = lexicalCandidate({
      candidateId: asNlpId("AnnotationCandidateId", "nlpcand-hardening-d2"),
      storyVersionId: sentence.storyVersionId,
      sentenceId: sentence.id,
      parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    await assert.rejects(() => acceptAnnotationCandidate(reannotation, reannotateCtx), /CANDIDATE_REANNOTATION_KIND_MISMATCH/);
  });

  test("D3. no revision is created after a kind-mismatch failure", async () => {
    const { ctx, repo, sentence, occurrence } = await setupWithOccurrence("CONSTRUCTION");
    const reannotateCtx: AcceptanceContext = { ...ctx, reannotatesOccurrenceId: occurrence.id };
    const reannotation = lexicalCandidate({
      candidateId: asNlpId("AnnotationCandidateId", "nlpcand-hardening-d3"),
      storyVersionId: sentence.storyVersionId,
      sentenceId: sentence.id,
      parts: [{ sentenceId: sentence.id, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    await assert.rejects(() => acceptAnnotationCandidate(reannotation, reannotateCtx));
    assert.equal((await repo.listAnnotationRevisions(occurrence.id)).length, 0);
  });
});
