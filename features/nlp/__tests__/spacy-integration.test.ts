/**
 * §42 — the real integration test. Contract tests
 * (`__tests__/difficult-cases.test.ts` and friends) use `FakeAnalyzer`
 * because they need to hold the dependency structure fixed while testing
 * `../engine/candidate-builder.ts`'s own logic; this file is the one place
 * that runs the *actual* Node -> Python -> spaCy subprocess bridge
 * end-to-end, over a real `StoryVersion`, and checks the result against a
 * real Spanish sentence spaCy has never been told the "expected" parse for.
 *
 * If spaCy/the model cannot be loaded in this environment, this suite fails
 * loudly (`BLOCKER_NLP_INTEGRATION_ENV`) rather than silently reporting a
 * false pass — see `docs/nlp-annotation-assistant.md` §"Installing the
 * analyzer" for how to install `es_core_news_sm`.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SpaCyAnalyzer } from "../adapters/spacy/spacy-analyzer.ts";
import { EXPECTED_SPACY_VERSION, EXPECTED_MODEL_VERSION } from "../domain/analyzer-config.ts";
import { buildAnnotationCandidates, type CandidateBuildContext } from "../engine/candidate-builder.ts";
import { acceptAnnotationCandidate, type AcceptanceContext } from "../review/acceptance-service.ts";
import { InMemoryAnnotationDecisionRepository } from "../repository/in-memory-annotation-decision-repository.ts";
import { InMemoryCurrentStoryVersionResolver } from "../repository/in-memory-current-story-version-resolver.ts";
import {
  FixedClock,
  SequentialIdGenerator,
  buildStoryWithSentences,
  buildConstructionTestRegistry,
  buildConstructionTestLexicalEngine,
  DARSE_CUENTA_TARGET_ID,
} from "./fixtures.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";

const SENTENCE = "Marta se dio finalmente cuenta del problema.";

describe("nlp / real spaCy integration (BLOCKER_NLP_INTEGRATION_ENV if this fails to run at all)", () => {
  test("a real Spanish sentence, analyzed by the real spaCy adapter, produces a reviewable discontinuous MWU candidate end to end", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const { repo, sentences, storyId, storyVersionId } = await buildStoryWithSentences([SENTENCE], ids, clock);

    const analyzer = new SpaCyAnalyzer();
    const analysis = await analyzer.analyze(sentences.map((s, i) => ({ sentenceIndex: i, text: s.text })));

    assert.equal(analysis.provenance.analyzer, "spaCy");
    assert.ok(analysis.provenance.analyzerVersion.length > 0);
    assert.equal(analysis.provenance.modelName, "es_core_news_sm");
    assert.ok(analysis.provenance.modelVersion !== null);
    // Corrección E — the real installed environment must match the governed
    // pin exactly; SpaCyAnalyzer.analyze() already enforces this (default
    // `enforceGovernedVersion: true`) and would have thrown before returning,
    // but assert it explicitly here too so a future relaxation of that
    // default cannot silently regress this test's coverage.
    assert.equal(analysis.provenance.analyzerVersion, EXPECTED_SPACY_VERSION);
    assert.equal(analysis.provenance.modelVersion, EXPECTED_MODEL_VERSION);

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
    const candidates = buildAnnotationCandidates(buildCtx, analysis);
    assert.ok(candidates.length > 0, "the real analyzer must produce at least one candidate for a real sentence");

    const mwuCandidate = candidates.find((c) => c.proposedMwuTargetId === DARSE_CUENTA_TARGET_ID);
    assert.ok(mwuCandidate, "expected the real spaCy parse to still surface the darse-cuenta discontinuous pattern (expl:pv clitic + dar ROOT + cuenta obj)");
    assert.equal(mwuCandidate!.candidateType, "LEXICAL");
    assert.deepEqual(
      mwuCandidate!.parts.map((p) => p.role),
      ["CLITIC", "HEAD", "FIXED"],
    );

    // And the full review -> accept path works over this real output too.
    const currentStoryVersionResolver = new InMemoryCurrentStoryVersionResolver();
    currentStoryVersionResolver.setCurrentEditableVersion(storyId, storyVersionId);
    const acceptCtx: AcceptanceContext = {
      storyRepository: repo,
      registry,
      currentCurriculumReleaseId: registry.release.releaseId,
      currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      idGenerator: ids,
      clock,
      decisionRepository: new InMemoryAnnotationDecisionRepository(),
      currentStoryVersionResolver,
    };
    const result = await acceptAnnotationCandidate(mwuCandidate!, acceptCtx);
    assert.equal(result.kind, "NEW_OCCURRENCE");
  });
});
