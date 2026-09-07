/**
 * §39 determinism: same analyzer version, same model version, same
 * `StoryVersion`, same configuration -> same logical candidates. Candidate
 * ids differ only because two independent `SequentialIdGenerator`s were
 * used (mirroring two independent runs); nothing else may differ.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildAnnotationCandidates, type CandidateBuildContext } from "../engine/candidate-builder.ts";
import { FakeAnalyzer } from "../adapters/fake/fake-analyzer.ts";
import {
  FixedClock,
  SequentialIdGenerator,
  buildStoryWithSentences,
  buildConstructionTestRegistry,
  buildConstructionTestLexicalEngine,
} from "./fixtures.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import type { AnnotationCandidate } from "../domain/candidate.ts";
import type { TokenAnalysis } from "../domain/analysis.ts";

const TEXT = "Marta se dio finalmente cuenta del problema.";
const TOKENS: readonly TokenAnalysis[] = [
  { index: 0, surface: "Marta", start: 0, end: 5, lemma: "Marta", pos: "PROPN", tag: "PROPN", morphology: null, depRelation: "nsubj", headIndex: 2 },
  { index: 1, surface: "se", start: 6, end: 8, lemma: "él", pos: "PRON", tag: "PRON", morphology: "Reflex=Yes", depRelation: "expl:pv", headIndex: 2 },
  { index: 2, surface: "dio", start: 9, end: 12, lemma: "dar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 2 },
  { index: 3, surface: "finalmente", start: 13, end: 23, lemma: "finalmente", pos: "ADV", tag: "ADV", morphology: null, depRelation: "advmod", headIndex: 2 },
  { index: 4, surface: "cuenta", start: 24, end: 30, lemma: "cuenta", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 2 },
  { index: 5, surface: "del", start: 31, end: 34, lemma: "del", pos: "ADP", tag: "ADP", morphology: null, depRelation: "case", headIndex: 6 },
  { index: 6, surface: "problema", start: 35, end: 43, lemma: "problema", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "nmod", headIndex: 4 },
  { index: 7, surface: ".", start: 43, end: 44, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 2 },
];

function withoutVolatileFields(candidates: readonly AnnotationCandidate[]) {
  return candidates.map((c) => {
    const { candidateId, provenance, ...rest } = c;
    void candidateId;
    return { ...rest, provenance: { ...provenance, createdAt: "" } };
  });
}

async function buildOnce() {
  const registry = buildConstructionTestRegistry(true);
  const lexicalEngine = buildConstructionTestLexicalEngine(registry);
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const { sentences, storyVersionId } = await buildStoryWithSentences([TEXT], ids, clock);
  const ctx: CandidateBuildContext = {
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
  const analyzer = new FakeAnalyzer([{ sentenceIndex: 0, text: TEXT, tokens: TOKENS }], () => clock.now());
  const analysis = await analyzer.analyze([{ sentenceIndex: 0, text: TEXT }]);
  return buildAnnotationCandidates(ctx, analysis);
}

describe("nlp / determinism", () => {
  test("35. same input -> same logical candidates across two independent builds", async () => {
    const a = await buildOnce();
    const b = await buildOnce();
    assert.equal(a.length, b.length);
    assert.ok(a.length > 0);
    assert.deepEqual(withoutVolatileFields(a), withoutVolatileFields(b));
  });

  test("36. fixed analyzer/model metadata makes the result reproducible", async () => {
    const a = await buildOnce();
    const b = await buildOnce();
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].provenance.analyzer, b[i].provenance.analyzer);
      assert.equal(a[i].provenance.analyzerVersion, b[i].provenance.analyzerVersion);
      assert.equal(a[i].provenance.modelName, b[i].provenance.modelName);
      assert.equal(a[i].provenance.modelVersion, b[i].provenance.modelVersion);
      assert.equal(a[i].provenance.algorithmVersion, b[i].provenance.algorithmVersion);
      assert.equal(a[i].provenance.createdAt, b[i].provenance.createdAt, "the same injected Clock must produce the same timestamp");
    }
  });
});
