/**
 * Lexical identity over the real A1 registry.
 *
 * These tests run against the committed registry, not fixtures: the claims they
 * make are about published data, so a fixture would prove nothing. Every id
 * asserted here was verified to exist in `generated/curriculum/a1` before it
 * was written down.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { LexicalEngine } from "../engine/lexicon.ts";
import { LEXICON_SCHEMA_VERSION } from "../domain/release.ts";

const curriculum = loadCurriculumRegistry();
const engine = new LexicalEngine(curriculum);

describe("lexical engine / identity", () => {
  test("the engine is built over the published curriculum release", () => {
    assert.equal(engine.release.curriculumReleaseId, "A1-CURRICULUM-v1.44");
    assert.equal(engine.release.schemaVersion, LEXICON_SCHEMA_VERSION);
    assert.equal(engine.release.lexemeCount, 599);
  });

  test("a lexicon release is not a curriculum release", () => {
    // Distinct id spaces. If these ever became equal, a lexical
    // reinterpretation would be indistinguishable from a curricular change.
    assert.notEqual(
      engine.release.releaseId as string,
      engine.release.curriculumReleaseId,
    );
    assert.equal(engine.release.releaseId as string, "A1-LEXICON-v1.0");
  });

  test("a published form resolves to exactly its published lexeme", () => {
    const form = engine.resolveForm("FORM-A1-000001");
    assert.equal(form.status, "FOUND");
    assert.ok(form.status === "FOUND");

    const lexeme = engine.getLexemeForForm("FORM-A1-000001");
    assert.ok(lexeme.status === "FOUND");
    // Resolved through the published lexemeId, not by matching surfaces.
    assert.equal(lexeme.value.id, form.value.lexemeId);
  });

  test("form resolution does not go through surface comparison", () => {
    // `alemán` is published as two lexemes (ADJ and NOUN) and its forms carry
    // the same surface. Each form must land on its own lexeme, which string
    // matching could not decide.
    const adjective = engine.getForms("LEX-A1-000029");
    const noun = engine.getForms("LEX-A1-000030");
    assert.ok(adjective.status === "FOUND" && noun.status === "FOUND");

    for (const form of adjective.value) {
      const back = engine.getLexemeForForm(form.id);
      assert.ok(back.status === "FOUND");
      assert.equal(back.value.id, "LEX-A1-000029");
    }
    for (const form of noun.value) {
      const back = engine.getLexemeForForm(form.id);
      assert.ok(back.status === "FOUND");
      assert.equal(back.value.id, "LEX-A1-000030");
    }
  });

  test("a published sense resolves to exactly its published lexeme", () => {
    const sense = engine.resolveSense("SENSE-A1-000001");
    assert.ok(sense.status === "FOUND");
    const lexeme = engine.getLexemeForSense("SENSE-A1-000001");
    assert.ok(lexeme.status === "FOUND");
    assert.equal(lexeme.value.id, sense.value.lexemeId);
  });

  test("two senses of one lexeme resolve to the same identity", () => {
    // `café`: BEVERAGE and ESTABLISHMENT, both A1, one lexeme. Polysemy is not
    // homography, and the engine must not split it.
    const beverage = engine.getLexemeForSense("SENSE-A1-000086");
    const establishment = engine.getLexemeForSense("SENSE-A1-000087");
    assert.ok(beverage.status === "FOUND" && establishment.status === "FOUND");
    assert.equal(beverage.value.id, establishment.value.id);
    assert.equal(beverage.value.id, "LEX-A1-000085");
  });

  test("an unknown id and an empty collection are different answers", () => {
    assert.equal(engine.resolveLexeme("LEX-A1-999999").status, "NOT_FOUND");
    assert.equal(engine.resolveForm("FORM-A1-999999").status, "NOT_FOUND");
    assert.equal(engine.resolveSense("SENSE-A1-999999").status, "NOT_FOUND");
    assert.equal(engine.getForms("LEX-A1-999999").status, "NOT_FOUND");

    const forms = engine.getForms("LEX-A1-000001");
    assert.ok(forms.status === "FOUND");
    assert.ok(forms.value.length >= 1);
  });

  test("curricular level comes from source assertions, never recomputed", () => {
    const assertions = engine.getCurricularAssertionsForSense("SENSE-A1-000001");
    assert.ok(assertions.status === "FOUND");
    for (const assertion of assertions.value) {
      assert.equal(assertion.senseId, "SENSE-A1-000001");
      // The level is a published string on the assertion. The engine reads it;
      // it has no code path that could derive one.
      assert.ok(assertion.assertedLevel.length > 0);
    }
    assert.equal(
      engine.getCurricularAssertionsForSense("SENSE-A1-999999").status,
      "NOT_FOUND",
    );
  });

  test("a sense with no assertions is FOUND-empty, not NOT_FOUND", () => {
    const withoutAssertions = curriculum.data.senses.find(
      (sense) =>
        curriculum.getSourceAssertionsForSense(sense.id).status === "FOUND" &&
        (
          curriculum.getSourceAssertionsForSense(sense.id) as {
            value: readonly unknown[];
          }
        ).value.length === 0,
    );
    if (withoutAssertions === undefined) return; // every sense is asserted
    const result = engine.getCurricularAssertionsForSense(withoutAssertions.id);
    assert.equal(result.status, "FOUND");
    assert.ok(result.status === "FOUND" && result.value.length === 0);
  });

  test("an A2 boundary sense keeps its lexeme and stays non-A1", () => {
    // SENSE-A1-000075 (`billete`, banknote) is A2 boundary and shares
    // LEX-A1-000074 with an A1 sense. The lexical layer resolves it without
    // promoting it into A1.
    const sense = engine.resolveSense("SENSE-A1-000075");
    assert.ok(sense.status === "FOUND");
    assert.equal(sense.value.isA1, false);
    assert.equal(sense.value.status, "A2_BOUNDARY_NOT_A1");

    const lexeme = engine.getLexemeForSense("SENSE-A1-000075");
    assert.ok(lexeme.status === "FOUND");
    assert.equal(lexeme.value.id, "LEX-A1-000074");

    const senses = engine.getSenses("LEX-A1-000074");
    assert.ok(senses.status === "FOUND");
    assert.equal(senses.value.filter((s) => s.isA1).length, 1);
    assert.equal(senses.value.filter((s) => !s.isA1).length, 1);
  });

  test("every published lexeme starts ACTIVE and pronominality UNSPECIFIED", () => {
    // The A1 release publishes no lifecycle history and no pronominality field,
    // so any other default would be an inference. All 599 are uniform.
    let active = 0;
    for (const lexeme of curriculum.data.lexemes) {
      const identity = engine.getIdentity(lexeme.id);
      assert.ok(identity.status === "FOUND");
      assert.equal(identity.value.lifecycle, "ACTIVE");
      assert.equal(identity.value.pronominality, "UNSPECIFIED");
      assert.equal(identity.value.pronominalityAuthority, "NOT_CLASSIFIED");
      active += 1;
    }
    assert.equal(active, 599);
  });

  test("a -se lemma is not classified as pronominal by its ending", () => {
    // `llamarse` (LEX-A1-000333) ends in -se and has no published counterpart.
    // Canonical -se is not the literal surface "se", and an orthographic
    // ending is not editorial authority.
    const identity = engine.getIdentity("LEX-A1-000333");
    assert.ok(identity.status === "FOUND");
    assert.equal(identity.value.pronominality, "UNSPECIFIED");

    const lexeme = engine.resolveLexeme("LEX-A1-000333");
    assert.ok(lexeme.status === "FOUND");
    assert.equal(lexeme.value.lemma, "llamarse");
  });

  test("identity of an unknown lexeme is NOT_FOUND", () => {
    assert.equal(engine.getIdentity("LEX-A1-999999").status, "NOT_FOUND");
  });
});

describe("lexical engine / MWU identity", () => {
  test("a lexicalised MWU resolves to its exact published lexeme", () => {
    // 12B1-MWU-0001 `carné de conducir` publishes LEX-A1-000108.
    const identity = engine.getMwuLexicalIdentity("12B1-MWU-0001");
    assert.equal(identity.status, "FOUND");
    assert.ok(identity.status === "FOUND");
    assert.equal(identity.value.id, "LEX-A1-000108");
    assert.equal(identity.value.type, "MULTIWORD");
  });

  test("a non-lexicalised MWU reports NO_LEXICAL_IDENTITY", () => {
    // 12B1-MWU-0008 `número de teléfono` is a collocation whose published
    // identity policy declines a MWU lexeme. That is an answer, not a gap.
    const identity = engine.getMwuLexicalIdentity("12B1-MWU-0008");
    assert.equal(identity.status, "NO_LEXICAL_IDENTITY");

    const unit = engine.resolveMwu("12B1-MWU-0008");
    assert.ok(unit.status === "FOUND");
    assert.equal(unit.value.lexemeId, null);
  });

  test("NO_LEXICAL_IDENTITY is distinct from NOT_FOUND", () => {
    assert.equal(engine.getMwuLexicalIdentity("99Z9-MWU-9999").status, "NOT_FOUND");
    assert.equal(engine.resolveMwu("99Z9-MWU-9999").status, "NOT_FOUND");
  });

  test("the 214 published MWUs split 44 / 170 and nothing is promoted", () => {
    let lexicalised = 0;
    let withoutIdentity = 0;
    for (const unit of curriculum.data.mwuUnits) {
      const identity = engine.getMwuLexicalIdentity(unit.id);
      if (identity.status === "FOUND") lexicalised += 1;
      else if (identity.status === "NO_LEXICAL_IDENTITY") withoutIdentity += 1;
      else assert.fail(`published MWU ${unit.id} did not resolve`);
    }
    assert.equal(lexicalised, 44);
    assert.equal(withoutIdentity, 170);
    // The engine minted nothing: the lexeme count is untouched.
    assert.equal(curriculum.data.lexemes.length, 599);
  });
});
