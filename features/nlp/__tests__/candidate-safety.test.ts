/**
 * §41 general safety (items 1-9): the chain never inverts.
 *
 *   StoryVersion -> NLP analysis -> AnnotationCandidate[] -> registry
 *   validation -> editorial review / acceptance -> StoryOccurrence -> ...
 *
 * never `NLP -> publicación directa`. Every assertion here is about the
 * *absence* of a side effect this feature must never have.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildAnnotationCandidates, type CandidateBuildContext } from "../engine/candidate-builder.ts";
import { acceptAnnotationCandidate, rejectAnnotationCandidate, type AcceptanceContext } from "../review/acceptance-service.ts";
import { FakeAnalyzer } from "../adapters/fake/fake-analyzer.ts";
import { registry, lexicalEngine, FixedClock, SequentialIdGenerator, buildStoryWithSentences } from "./fixtures.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import type { TokenAnalysis } from "../domain/analysis.ts";

const TEXT = "adiós";
const TOKENS: readonly TokenAnalysis[] = [
  { index: 0, surface: "adiós", start: 0, end: 5, lemma: "adiós", pos: "INTJ", tag: "INTJ", morphology: null, depRelation: "ROOT", headIndex: 0 },
];

function registrySnapshot() {
  return {
    lexemes: registry.data.lexemes.length,
    senses: registry.data.senses.length,
    lexemeForms: registry.data.lexemeForms.length,
    mwuUnits: registry.data.mwuUnits.length,
    grammarUnits: registry.data.grammarUnits.length,
    targets: registry.data.targets.length,
  };
}

async function buildAndAccept() {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const { repo, sentences, storyVersionId } = await buildStoryWithSentences([TEXT], ids, clock);
  const buildCtx: CandidateBuildContext = {
    storyVersionId,
    sentences,
    registry,
    lexicalEngine,
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    idGenerator: ids,
    clock,
    algorithmVersion: "test/1.0.0",
  };
  const analyzer = new FakeAnalyzer([{ sentenceIndex: 0, text: TEXT, tokens: TOKENS }]);
  const analysis = await analyzer.analyze([{ sentenceIndex: 0, text: TEXT }]);
  const candidates = buildAnnotationCandidates(buildCtx, analysis);

  const acceptCtx: AcceptanceContext = {
    storyRepository: repo,
    registry,
    currentCurriculumReleaseId: registry.release.releaseId,
    currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    idGenerator: ids,
    clock,
  };
  return { candidates, acceptCtx, repo, storyVersionId };
}

describe("nlp / general candidate and acceptance safety", () => {
  test("1-4. building and accepting a candidate never modifies the curriculum, and mints no Lexeme/Sense/Form", async () => {
    const before = registrySnapshot();
    const { candidates, acceptCtx } = await buildAndAccept();
    assert.equal(candidates.length, 1);
    const result = await acceptAnnotationCandidate(candidates[0], acceptCtx);
    assert.equal(result.kind, "NEW_OCCURRENCE");
    const after = registrySnapshot();
    assert.deepEqual(after, before, "no curriculum collection changed size");
  });

  test("5. every candidate registers full provenance", async () => {
    const { candidates } = await buildAndAccept();
    for (const c of candidates) {
      assert.ok(c.provenance.analyzer.length > 0);
      assert.ok(c.provenance.analyzerVersion.length > 0);
      assert.ok(c.provenance.algorithmVersion.length > 0);
      assert.ok(c.provenance.createdAt.length > 0);
      assert.equal(c.sourceAdapter, c.provenance.analyzer);
    }
  });

  test("6. a stale candidate (curriculumReleaseId mismatch) is rejected", async () => {
    const { candidates, acceptCtx } = await buildAndAccept();
    const stale = { ...candidates[0], curriculumReleaseId: "A1-CURRICULUM-vDOES-NOT-EXIST" };
    await assert.rejects(() => acceptAnnotationCandidate(stale, acceptCtx), /STALE_CANDIDATE/);
  });

  test("7. a rejected candidate never modifies the Story Engine", async () => {
    const { candidates, repo, storyVersionId } = await buildAndAccept();
    const clock = new FixedClock();
    const rejected = rejectAnnotationCandidate(candidates[0], "test rejection", clock);
    assert.equal(rejected.candidateId, candidates[0].candidateId);
    assert.equal((await repo.listOccurrences(storyVersionId)).length, 0, "rejection must never write an occurrence");
  });

  test("8. a candidate only ever becomes real content through the explicit acceptance service", async () => {
    const { candidates, acceptCtx } = await buildAndAccept();
    assert.equal(candidates[0].status, "CANDIDATE", "generation alone never sets ACCEPTED");
    const result = await acceptAnnotationCandidate(candidates[0], acceptCtx);
    assert.equal(result.kind, "NEW_OCCURRENCE");
    // Calling accept a second time on the *same* object (still logically CANDIDATE) is fine —
    // status transition is the caller's responsibility, not mutated by this function; but an
    // object explicitly marked ACCEPTED/REJECTED must never be re-accepted.
    const alreadyAccepted = { ...candidates[0], status: "ACCEPTED" as const };
    await assert.rejects(() => acceptAnnotationCandidate(alreadyAccepted, acceptCtx), /CANDIDATE_NOT_PENDING/);
  });

  test("9. acceptance never publishes the StoryVersion automatically", async () => {
    const { candidates, acceptCtx, repo, storyVersionId } = await buildAndAccept();
    await acceptAnnotationCandidate(candidates[0], acceptCtx);
    const version = await repo.getStoryVersion(storyVersionId);
    assert.equal(version!.status, "DRAFT", "accepting a candidate must never publish the version it belongs to");
    assert.equal(await repo.getPublishedVersion((await repo.getStoryVersion(storyVersionId))!.storyId), null);
  });
});
