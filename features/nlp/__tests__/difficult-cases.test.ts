/**
 * §21-26 of the governing brief — the Spanish cases the Story Engine itself
 * already proves it can *represent* (see
 * `features/story-engine/__tests__/{occurrences,construction-occurrences}.test.ts`);
 * here the proof is that this feature *proposes* the matching
 * `AnnotationCandidate` shape from raw analysis, before any human review.
 *
 * Token analyses below are hand-specified (`FakeAnalyzer`), matching the
 * real dependency structure `spacy.load("es_core_news_sm")` actually
 * produces for each sentence (verified once, directly, while building this
 * suite) — this file does not depend on a live analyzer to stay fast and
 * deterministic; `__tests__/spacy-integration.test.ts` is where the real
 * adapter is exercised end-to-end.
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
  DARSE_CUENTA_TARGET_ID,
  DARSE_CUENTA_LEXEME_ID,
} from "./fixtures.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import type { TokenAnalysis } from "../domain/analysis.ts";
import type { CurriculumRegistry } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";

async function candidatesFor(text: string, tokens: readonly TokenAnalysis[], registry: CurriculumRegistry, lexicalEngine: LexicalEngine) {
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

const SE_DIO_CUENTA_TEXT = "Marta se dio finalmente cuenta del problema.";
const SE_DIO_CUENTA_TOKENS: readonly TokenAnalysis[] = [
  { index: 0, surface: "Marta", start: 0, end: 5, lemma: "Marta", pos: "PROPN", tag: "PROPN", morphology: null, depRelation: "nsubj", headIndex: 2 },
  { index: 1, surface: "se", start: 6, end: 8, lemma: "él", pos: "PRON", tag: "PRON", morphology: "Reflex=Yes", depRelation: "expl:pv", headIndex: 2 },
  { index: 2, surface: "dio", start: 9, end: 12, lemma: "dar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 2 },
  { index: 3, surface: "finalmente", start: 13, end: 23, lemma: "finalmente", pos: "ADV", tag: "ADV", morphology: null, depRelation: "advmod", headIndex: 2 },
  { index: 4, surface: "cuenta", start: 24, end: 30, lemma: "cuenta", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 2 },
  { index: 5, surface: "del", start: 31, end: 34, lemma: "del", pos: "ADP", tag: "ADP", morphology: null, depRelation: "case", headIndex: 6 },
  { index: 6, surface: "problema", start: 35, end: 43, lemma: "problema", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "nmod", headIndex: 4 },
  { index: 7, surface: ".", start: 43, end: 44, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 2 },
];

describe("nlp / difficult Spanish cases", () => {
  test("21. 'se dio [finalmente] cuenta' proposes a discontinuous CLITIC+HEAD+FIXED candidate with a gap", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const candidates = await candidatesFor(SE_DIO_CUENTA_TEXT, SE_DIO_CUENTA_TOKENS, registry, lexicalEngine);

    const mwuCandidate = candidates.find((c) => c.proposedMwuTargetId === DARSE_CUENTA_TARGET_ID);
    assert.ok(mwuCandidate, "expected a candidate naming the darse-cuenta MWU target");
    assert.equal(mwuCandidate!.candidateType, "LEXICAL");
    assert.deepEqual(
      mwuCandidate!.parts.map((p) => p.role),
      ["CLITIC", "HEAD", "FIXED"],
    );
    // "finalmente" (13-23) sits strictly between "se" (6-8) and "cuenta" (24-30) — a real gap, not covered by any part.
    const [clitic, head, fixed] = mwuCandidate!.parts;
    assert.ok(clitic.end <= head.start);
    assert.ok(head.end < fixed.start, "there must be a genuine gap ('finalmente') between HEAD and FIXED");
  });

  test("22. 'vete' proposes a HEAD+CLITIC split inside one orthographic token", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const tokens: readonly TokenAnalysis[] = [
      { index: 0, surface: "Vete", start: 0, end: 4, lemma: "Vete", pos: "PROPN", tag: "PROPN", morphology: null, depRelation: "ROOT", headIndex: 0 },
      { index: 1, surface: "de", start: 5, end: 7, lemma: "de", pos: "ADP", tag: "ADP", morphology: null, depRelation: "case", headIndex: 2 },
      { index: 2, surface: "aquí", start: 8, end: 12, lemma: "aquí", pos: "ADV", tag: "ADV", morphology: null, depRelation: "obl", headIndex: 0 },
      { index: 3, surface: ".", start: 12, end: 13, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 0 },
    ];
    const candidates = await candidatesFor("Vete de aquí.", tokens, registry, lexicalEngine);
    const veteCandidate = candidates.find((c) => c.parts.length === 2 && c.parts[0].role === "HEAD" && c.parts[1].role === "CLITIC");
    assert.ok(veteCandidate, "expected a HEAD+CLITIC split candidate for 'Vete'");
    assert.equal(veteCandidate!.candidateType, "LEXICAL");
    assert.equal(veteCandidate!.parts[0].start, 0);
    assert.equal(veteCandidate!.parts[0].end, 2); // "Ve"
    assert.equal(veteCandidate!.parts[1].start, 2);
    assert.equal(veteCandidate!.parts[1].end, 4); // "te"
  });

  test("23. 'Lleva tres años estudiando español' proposes ANCHOR + SLOT(DURATION) + SLOT(GERUND_PREDICATE)", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const text = "Lleva tres años estudiando español.";
    const tokens: readonly TokenAnalysis[] = [
      { index: 0, surface: "Lleva", start: 0, end: 5, lemma: "llevar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 0 },
      { index: 1, surface: "tres", start: 6, end: 10, lemma: "tres", pos: "NUM", tag: "NUM", morphology: null, depRelation: "nummod", headIndex: 2 },
      { index: 2, surface: "años", start: 11, end: 15, lemma: "año", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 0 },
      { index: 3, surface: "estudiando", start: 16, end: 26, lemma: "estudiar", pos: "VERB", tag: "VERB", morphology: "VerbForm=Ger", depRelation: "advcl", headIndex: 0 },
      { index: 4, surface: "español", start: 27, end: 34, lemma: "español", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 3 },
      { index: 5, surface: ".", start: 34, end: 35, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 0 },
    ];
    const candidates = await candidatesFor(text, tokens, registry, lexicalEngine);
    const construction = candidates.find((c) => c.candidateType === "CONSTRUCTION" && c.constructionId === "LLEVAR_DURATION_GERUND");
    assert.ok(construction, "expected a LLEVAR_DURATION_GERUND construction candidate");
    assert.deepEqual(
      construction!.parts.map((p) => [p.role, p.slotLabel]),
      [
        ["ANCHOR", null],
        ["SLOT", "DURATION"],
        ["SLOT", "GERUND_PREDICATE"],
      ],
    );
    assert.equal(construction!.parts[1].start, 6); // "tres"
    assert.equal(construction!.parts[1].end, 15); // "años"
    assert.equal(construction!.parts[2].start, 16); // "estudiando" alone, not "estudiando español"
    assert.equal(construction!.parts[2].end, 26);
    assert.equal(construction!.proposedGrammarTargetId, "GRAM-T-000001");
  });

  test("24. MWU con identidad lexica: 'darse cuenta' proposes a LEXICAL candidate naming its Lexeme and MWU target", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const candidates = await candidatesFor(SE_DIO_CUENTA_TEXT, SE_DIO_CUENTA_TOKENS, registry, lexicalEngine);
    const mwuCandidate = candidates.find((c) => c.proposedMwuTargetId === DARSE_CUENTA_TARGET_ID);
    assert.ok(mwuCandidate);
    assert.equal(mwuCandidate!.candidateType, "LEXICAL");
    assert.equal(mwuCandidate!.proposedLexemeId, DARSE_CUENTA_LEXEME_ID);
    assert.equal(mwuCandidate!.status, "CANDIDATE");
  });

  test("25. MWU sin identidad lexica: 'darse cuenta' proposes a CONSTRUCTION candidate, no Lexeme minted", async () => {
    const registry = buildConstructionTestRegistry(false);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    assert.equal(registry.data.lexemes.length, 0, "this registry publishes no Lexeme at all");
    const candidates = await candidatesFor(SE_DIO_CUENTA_TEXT, SE_DIO_CUENTA_TOKENS, registry, lexicalEngine);
    const mwuCandidate = candidates.find((c) => c.proposedMwuTargetId === DARSE_CUENTA_TARGET_ID);
    assert.ok(mwuCandidate);
    assert.equal(mwuCandidate!.candidateType, "CONSTRUCTION");
    assert.equal(mwuCandidate!.proposedLexemeId, null);
    assert.ok(mwuCandidate!.constructionId !== null);
    assert.deepEqual(
      mwuCandidate!.parts.map((p) => p.role),
      ["SLOT", "ANCHOR", "SLOT"],
    );
  });

  test("26. Grammar construction: llevar+duration+gerund resolves to the published GRAMMAR_UNIT target, no Lexeme minted for the pattern", async () => {
    const registry = buildConstructionTestRegistry(true);
    const lexicalEngine = buildConstructionTestLexicalEngine(registry);
    const text = "Lleva tres años estudiando español.";
    const tokens: readonly TokenAnalysis[] = [
      { index: 0, surface: "Lleva", start: 0, end: 5, lemma: "llevar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 0 },
      { index: 1, surface: "tres", start: 6, end: 10, lemma: "tres", pos: "NUM", tag: "NUM", morphology: null, depRelation: "nummod", headIndex: 2 },
      { index: 2, surface: "años", start: 11, end: 15, lemma: "año", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 0 },
      { index: 3, surface: "estudiando", start: 16, end: 26, lemma: "estudiar", pos: "VERB", tag: "VERB", morphology: "VerbForm=Ger", depRelation: "advcl", headIndex: 0 },
      { index: 4, surface: "español", start: 27, end: 34, lemma: "español", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 3 },
      { index: 5, surface: ".", start: 34, end: 35, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 0 },
    ];
    const candidates = await candidatesFor(text, tokens, registry, lexicalEngine);
    const construction = candidates.find((c) => c.constructionId === "LLEVAR_DURATION_GERUND");
    assert.ok(construction);
    assert.equal(construction!.proposedGrammarTargetId, "GRAM-T-000001");
    assert.equal(construction!.proposedLexemeId, null);
    assert.equal(registry.getLexemeById("GRAM-T-000001"), null, "no Lexeme was minted under the construction's own id");
  });

  test("an unresolved construction (no matching GrammarUnit published) is UNRESOLVED_CANDIDATE, not a guessed id", async () => {
    const emptyGrammarRegistry = buildConstructionTestRegistry(true, false);
    const lexicalEngine = buildConstructionTestLexicalEngine(emptyGrammarRegistry);
    assert.equal(emptyGrammarRegistry.data.grammarUnits.length, 0);
    const text = "Lleva tres años estudiando español.";
    const tokens: readonly TokenAnalysis[] = [
      { index: 0, surface: "Lleva", start: 0, end: 5, lemma: "llevar", pos: "VERB", tag: "VERB", morphology: null, depRelation: "ROOT", headIndex: 0 },
      { index: 1, surface: "tres", start: 6, end: 10, lemma: "tres", pos: "NUM", tag: "NUM", morphology: null, depRelation: "nummod", headIndex: 2 },
      { index: 2, surface: "años", start: 11, end: 15, lemma: "año", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 0 },
      { index: 3, surface: "estudiando", start: 16, end: 26, lemma: "estudiar", pos: "VERB", tag: "VERB", morphology: "VerbForm=Ger", depRelation: "advcl", headIndex: 0 },
      { index: 4, surface: "español", start: 27, end: 34, lemma: "español", pos: "NOUN", tag: "NOUN", morphology: null, depRelation: "obj", headIndex: 3 },
      { index: 5, surface: ".", start: 34, end: 35, lemma: ".", pos: "PUNCT", tag: "PUNCT", morphology: null, depRelation: "punct", headIndex: 0 },
    ];
    const candidates = await candidatesFor(text, tokens, emptyGrammarRegistry, lexicalEngine);
    const construction = candidates.find((c) => c.constructionId === "LLEVAR_DURATION_GERUND");
    assert.ok(construction);
    assert.equal(construction!.proposedGrammarTargetId, null);
    assert.equal(construction!.status, "REVIEW_REQUIRED");
    assert.match(construction!.evidence, /UNRESOLVED_CANDIDATE/);
  });
});
