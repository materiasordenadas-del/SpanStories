/**
 * §28 lexical resolution: published `LexemeForm` match -> published `Lexeme`
 * candidates -> canonical form candidates -> unresolved — never a final
 * answer picked on the NLP feature's own authority, never a homograph
 * silently resolved to one member. Asserted against the real committed
 * `A1-CURRICULUM-v1.51`/`A1-LEXICON-v1.0` registries — homograph group
 * `HG-A1-0001` ("alemán", `LEX-A1-000029`/`LEX-A1-000030`) is real published
 * data, not a fixture.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveLexicalCandidates, senseCandidatesFor } from "../engine/lexical-resolution.ts";
import { buildAnnotationCandidates } from "../engine/candidate-builder.ts";
import { FakeAnalyzer } from "../adapters/fake/fake-analyzer.ts";
import { registry, lexicalEngine, FixedClock, SequentialIdGenerator, buildStoryWithSentences } from "./fixtures.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import type { CandidateBuildContext } from "../engine/candidate-builder.ts";
import type { TokenAnalysis } from "../domain/analysis.ts";

async function buildForSentence(text: string, tokens: readonly TokenAnalysis[]) {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const { sentences, storyVersionId } = await buildStoryWithSentences([text], ids, clock);
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
  const analyzer = new FakeAnalyzer([{ sentenceIndex: 0, text, tokens }]);
  const analysis = await analyzer.analyze([{ sentenceIndex: 0, text }]);
  return buildAnnotationCandidates(ctx, analysis);
}

describe("nlp / lexical resolution", () => {
  test("16. form publicada -> candidate correcto", () => {
    const resolution = resolveLexicalCandidates(lexicalEngine, { surface: "adiós", lemma: "adiós" });
    assert.equal(resolution.tier, "PUBLISHED_FORM");
    assert.ok(resolution.tier === "PUBLISHED_FORM" && resolution.matches.length === 1);
    assert.ok(resolution.tier === "PUBLISHED_FORM" && resolution.matches[0].lexemeId === "LEX-A1-000015");
  });

  test("17. surface homógrafa -> múltiples candidates (HG-A1-0001, alemán)", () => {
    const resolution = resolveLexicalCandidates(lexicalEngine, { surface: "alemán", lemma: "alemán" });
    assert.equal(resolution.tier, "PUBLISHED_FORM");
    assert.ok(resolution.tier === "PUBLISHED_FORM" && resolution.matches.length >= 2);
    const lexemeIds: string[] = resolution.tier === "PUBLISHED_FORM" ? resolution.matches.map((m) => m.lexemeId as string) : [];
    assert.ok(lexemeIds.includes("LEX-A1-000029"));
    assert.ok(lexemeIds.includes("LEX-A1-000030"));
  });

  test("18. no surface-only silent resolution: an ambiguous surface never becomes one proposedLexemeId", async () => {
    const candidates = await buildForSentence("alemán", [
      { index: 0, surface: "alemán", start: 0, end: 6, lemma: "alemán", pos: "ADJ", tag: "ADJ", morphology: null, depRelation: "ROOT", headIndex: 0 },
    ]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].proposedLexemeId, null);
    assert.equal(candidates[0].status, "REVIEW_REQUIRED");
    assert.ok(candidates[0].lexicalResolution !== null && candidates[0].lexicalResolution!.tier === "PUBLISHED_FORM");
  });

  test("19. Sense sigue siendo candidate incluso con una sola Sense publicada", () => {
    const senses = senseCandidatesFor(lexicalEngine, "LEX-A1-000015");
    assert.equal(senses.length, 1);
    assert.equal(senses[0].senseId, "SENSE-A1-000015");
    // And the builder never promotes it to proposedSenseId on its own:
    const resolution = resolveLexicalCandidates(lexicalEngine, { surface: "adiós", lemma: "adiós" });
    assert.equal(resolution.tier, "PUBLISHED_FORM");
  });

  test("19b. an unambiguous candidate from the builder still carries proposedSenseId = null", async () => {
    const candidates = await buildForSentence("adiós", [
      { index: 0, surface: "adiós", start: 0, end: 5, lemma: "adiós", pos: "INTJ", tag: "INTJ", morphology: null, depRelation: "ROOT", headIndex: 0 },
    ]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].proposedLexemeId, "LEX-A1-000015");
    assert.equal(candidates[0].proposedSenseId, null);
    assert.deepEqual(
      candidates[0].senseCandidates.map((s) => s.senseId),
      ["SENSE-A1-000015"],
    );
  });

  test("20. no pronominality inference from a '-se' surface", async () => {
    const before = lexicalEngine.getIdentity("LEX-A1-000062");
    const candidates = await buildForSentence("Le gusta bañarse.", [
      { index: 0, surface: "Le", start: 0, end: 2, lemma: "él", pos: "PRON", tag: "PRON", morphology: null, depRelation: "iobj", headIndex: 1 },
      { index: 1, surface: "gusta", start: 3, end: 8, lemma: "gustar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 1 },
      { index: 2, surface: "bañarse", start: 9, end: 16, lemma: "bañarse", pos: "VERB", tag: "VERB", morphology: null, depRelation: "xcomp", headIndex: 1 },
    ]);
    assert.ok(candidates.some((c) => c.proposedLexemeId === "LEX-A1-000062"));
    const after = lexicalEngine.getIdentity("LEX-A1-000062");
    assert.deepEqual(after, before, "generating a candidate must never change LexicalIdentity.pronominality");
    assert.equal(after.status, "FOUND");
    assert.ok(after.status === "FOUND" && after.value.pronominality === "UNSPECIFIED");
    // No candidate object anywhere carries a "pronominality" field at all.
    for (const c of candidates) assert.ok(!("pronominality" in c));
  });
});
