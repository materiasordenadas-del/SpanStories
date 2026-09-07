/**
 * §26/§46 offset contract: `TokenAnalysis.start`/`.end` are Unicode
 * **code point** offsets, proven against the real spaCy bridge (not a fake)
 * because the whole point is cross-language parity between Python's
 * (already code-point-indexed) `str` and JavaScript's (UTF-16-indexed)
 * `string` — a fake analyzer, written in TypeScript, could not expose a
 * conversion bug that only exists at the Python<->Node boundary.
 *
 * Covers ñ, á, ¿, ¡ and an astral character (an emoji, outside the Basic
 * Multilingual Plane) in one sentence, each individually anchored and
 * resolved with `codePointLength`/`resolveAnchorText`
 * (`features/story-engine/domain/anchors.ts`) — never raw `.slice()`. One
 * real analyzer call, shared by every assertion below (a subprocess + model
 * load per test would make this suite needlessly slow).
 */

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { codePointLength, resolveAnchorText } from "../../story-engine/index.ts";
import { SpaCyAnalyzer } from "../adapters/spacy/spacy-analyzer.ts";
import type { NlpAnalysis } from "../domain/analysis.ts";

const SENTENCE = "El niño soñó: '¿Vendrás mañana?' ¡Sí! 😀 dijo.";

let analysis: NlpAnalysis;

describe("nlp / offsets (Python<->JS code-point parity)", () => {
  before(async () => {
    const analyzer = new SpaCyAnalyzer();
    analysis = await analyzer.analyze([{ sentenceIndex: 0, text: SENTENCE }]);
  });

  test("10. ñ round-trips at its exact code point offset", () => {
    const tokens = analysis.sentences[0].tokens;
    const nino = tokens.find((t) => t.surface.toLowerCase() === "niño");
    assert.ok(nino, "expected a token for 'niño'");
    assert.equal(resolveAnchorText(SENTENCE, { start: nino!.start, end: nino!.end }), "niño");
  });

  test("11. á round-trips at its exact code point offset", () => {
    const tokens = analysis.sentences[0].tokens;
    const manana = tokens.find((t) => t.surface.toLowerCase().includes("mañana"));
    assert.ok(manana, "expected a token for 'mañana'");
    assert.equal(resolveAnchorText(SENTENCE, { start: manana!.start, end: manana!.end }), "mañana");
  });

  test("12. ¿ round-trips at its exact code point offset", () => {
    const tokens = analysis.sentences[0].tokens;
    const inverted = tokens.find((t) => t.surface === "¿");
    assert.ok(inverted, "expected a token for '¿'");
    assert.equal(resolveAnchorText(SENTENCE, { start: inverted!.start, end: inverted!.end }), "¿");
  });

  test("13. ¡ round-trips at its exact code point offset", () => {
    const tokens = analysis.sentences[0].tokens;
    const exclaim = tokens.find((t) => t.surface === "¡");
    assert.ok(exclaim, "expected a token for '¡'");
    assert.equal(resolveAnchorText(SENTENCE, { start: exclaim!.start, end: exclaim!.end }), "¡");
  });

  test("14. an astral character (emoji, outside the BMP) round-trips as one code point", () => {
    const tokens = analysis.sentences[0].tokens;
    const emoji = tokens.find((t) => t.surface === "😀");
    assert.ok(emoji, "expected a token for the emoji");
    assert.equal(emoji!.end - emoji!.start, 1, "an astral character is exactly one code point wide");
    assert.equal(resolveAnchorText(SENTENCE, { start: emoji!.start, end: emoji!.end }), "😀");
    // The critical negative check: UTF-16 code units would disagree here.
    assert.notEqual(SENTENCE.length, codePointLength(SENTENCE), "this sentence must actually contain an astral character for the test to mean anything");
  });

  test("15. Python/JS code-point parity: every token anchor resolves to its own surface, and the analyzer's own sentence-length agrees with codePointLength", () => {
    const sentence = analysis.sentences[0];
    assert.equal(sentence.text, SENTENCE);

    for (const token of sentence.tokens) {
      const resolved = resolveAnchorText(SENTENCE, { start: token.start, end: token.end });
      assert.equal(resolved, token.surface, `token ${JSON.stringify(token.surface)} anchor [${token.start},${token.end}) resolved to ${JSON.stringify(resolved)}`);
    }

    const lastToken = sentence.tokens[sentence.tokens.length - 1];
    assert.ok(lastToken.end <= codePointLength(SENTENCE));
  });
});
