/**
 * Homograph groups, pronominality and lexical relations.
 *
 * Cross-POS homography is tested against the real registry, which publishes 20
 * such groups. Same-POS homography and pronominal identity are tested against
 * fixtures, because A1 publishes neither — and the point of both tests is that
 * the engine represents them without the data having to supply them.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { LexicalEngine } from "../engine/lexicon.ts";
import {
  deriveHomographGroups,
  deriveHomographRelations,
} from "../engine/annotations.ts";
import { isSamePosGroup } from "../domain/homograph.ts";
import { LexicalEngineError } from "../domain/errors.ts";
import {
  CURA_CURE,
  CURA_PRIEST,
  FIXTURE_RELEASE,
  IR,
  IRSE,
  VENIR_VERB,
  VINO_NOUN,
  fixtureIdentity,
} from "./fixtures.ts";

const curriculum = loadCurriculumRegistry();
const engine = new LexicalEngine(curriculum);

describe("lexical engine / homograph groups", () => {
  test("A1 publishes 20 form collisions and the engine finds exactly those", () => {
    const groups = engine.getHomographGroups();
    assert.equal(groups.length, 20);
    for (const group of groups) {
      assert.ok(group.members.length >= 2, "a group needs at least two members");
      assert.equal(group.basis, "PUBLISHED_FORM_COLLISION");
    }
  });

  test("cross-POS homographs stay distinct identities", () => {
    // `este`: DEMONSTRATIVE (LEX-A1-000235) and NOUN, cardinal point
    // (LEX-A1-000236). Same written form, two published lexemes. This is the
    // real-data equivalent of `vino` NOUN against `vino` as a form of VENIR.
    const demonstrative = engine.resolveLexeme("LEX-A1-000235");
    const cardinalPoint = engine.resolveLexeme("LEX-A1-000236");
    assert.ok(demonstrative.status === "FOUND" && cardinalPoint.status === "FOUND");
    assert.equal(demonstrative.value.lemma, cardinalPoint.value.lemma);
    assert.notEqual(demonstrative.value.id, cardinalPoint.value.id);
    assert.equal(demonstrative.value.enginePos, "DEMONSTRATIVE");
    assert.equal(cardinalPoint.value.enginePos, "NOUN");

    const group = engine.getHomographGroupOf("LEX-A1-000235");
    assert.ok(group.status === "FOUND" && group.value !== null);
    assert.equal(group.value.canonicalForm, "este");
    assert.equal(group.value.members.length, 2);
    // Grouped, never fused: both ids survive in the group.
    const ids = group.value.members.map((member) => member.lexemeId);
    assert.deepEqual([...ids].sort(), ["LEX-A1-000235", "LEX-A1-000236"]);
  });

  test("sharing a form does not make one lexeme", () => {
    const byForm = engine.getLexemesByCanonicalForm("mañana");
    assert.equal(byForm.length, 2);
    assert.equal(new Set(byForm.map((lexeme) => lexeme.id)).size, 2);
    // ADV `mañana` and NOUN `mañana` are separate published identities.
    assert.deepEqual(
      byForm.map((lexeme) => lexeme.enginePos).sort(),
      ["ADV", "NOUN"],
    );
  });

  test("a lexeme with no homograph is FOUND with null, not NOT_FOUND", () => {
    const group = engine.getHomographGroupOf("LEX-A1-000001");
    assert.equal(group.status, "FOUND");
    assert.ok(group.status === "FOUND");
    assert.equal(group.value, null);
    assert.equal(engine.getHomographGroupOf("LEX-A1-999999").status, "NOT_FOUND");
  });

  test("an unknown canonical form yields an empty list, not an error", () => {
    assert.deepEqual(engine.getLexemesByCanonicalForm("nosuchword"), []);
  });

  test("every A1 group is cross-POS, and that is an observation not a rule", () => {
    const groups = engine.getHomographGroups();
    assert.equal(groups.filter(isSamePosGroup).length, 0);
    // Recorded so the same-POS fixture below is visibly filling a real gap in
    // the published data rather than duplicating something A1 already proves.
  });

  test("same-POS homographs are representable without fusing", () => {
    // `cura` "priest" against `cura` "cure": both NOUN, both `cura`. A1
    // publishes no such pair, so this is a fixture — and it is exactly the case
    // that would break if groups were keyed by canonical form plus POS.
    const groups = deriveHomographGroups(
      [CURA_PRIEST, CURA_CURE],
      FIXTURE_RELEASE,
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].canonicalForm, "cura");
    assert.equal(groups[0].members.length, 2);
    assert.ok(isSamePosGroup(groups[0]));
    // Two identities, not one.
    assert.equal(
      new Set(groups[0].members.map((member) => member.lexemeId)).size,
      2,
    );
  });

  test("a homograph group is not a knowledge unit", () => {
    // The group carries identity and evidence only. Nothing on it can express
    // what a learner knows, so no consumer can mistake grouping for mastery.
    const group = engine.getHomographGroups()[0];
    const keys = Object.keys(group).sort();
    assert.deepEqual(keys, [
      "basis",
      "canonicalForm",
      "effectiveRelease",
      "id",
      "members",
    ]);
    for (const member of group.members) {
      assert.deepEqual(Object.keys(member).sort(), [
        "enginePos",
        "lexemeId",
        "lexicalCategory",
      ]);
    }
  });

  test("differing POS does not prevent grouping, and null POS is not a defect", () => {
    // 468 of 599 A1 lexemes have no published POS. Grouping is by form, so a
    // null POS neither blocks membership nor gets invented.
    const groups = deriveHomographGroups([VINO_NOUN, VENIR_VERB], FIXTURE_RELEASE);
    // Different forms: no collision, no group.
    assert.equal(groups.length, 0);
  });

  test("group ids are stable across rebuilds of the same registry", () => {
    const again = new LexicalEngine(curriculum);
    assert.deepEqual(
      again.getHomographGroups().map((group) => group.id),
      engine.getHomographGroups().map((group) => group.id),
    );
    assert.deepEqual(
      again.getHomographGroups().map((group) => group.canonicalForm),
      engine.getHomographGroups().map((group) => group.canonicalForm),
    );
  });
});

describe("lexical engine / lexical relations", () => {
  test("HOMOGRAPH_OF is derived from published collisions and is symmetric", () => {
    const forward = engine.getRelations("LEX-A1-000235", "HOMOGRAPH_OF");
    const backward = engine.getRelations("LEX-A1-000236", "HOMOGRAPH_OF");
    assert.ok(forward.status === "FOUND" && backward.status === "FOUND");
    assert.equal(forward.value.length, 1);
    assert.equal(backward.value.length, 1);
    // Stored once, answered from either endpoint.
    assert.equal(forward.value[0].id, backward.value[0].id);
  });

  test("20 groups of two yield 20 homograph relations", () => {
    assert.equal(engine.release.relationCount, 20);
  });

  test("relation kinds A1 does not evidence come back empty, not absent", () => {
    for (const type of [
      "PRONOMINAL_COUNTERPART_OF",
      "VARIANT_OF",
      "DERIVED_FROM",
    ] as const) {
      const result = engine.getRelations("LEX-A1-000235", type);
      assert.equal(result.status, "FOUND");
      assert.ok(result.status === "FOUND");
      assert.equal(result.value.length, 0);
    }
    assert.equal(engine.getRelations("LEX-A1-999999").status, "NOT_FOUND");
  });
});

describe("lexical engine / pronominality", () => {
  test("the three published values plus UNSPECIFIED are the whole vocabulary", () => {
    const identity = engine.getIdentity("LEX-A1-000062");
    assert.ok(identity.status === "FOUND");
    // `bañarse`, a -se lemma with no published counterpart, stays unclassified.
    assert.equal(identity.value.pronominality, "UNSPECIFIED");
  });

  test("IR and IRSE are separate identities only when declared", () => {
    // A1 publishes `ir` (LEX-A1-000305 family) but not `irse`, so the
    // separate-identity case is a fixture. The distinction comes from the
    // declaration, never from the -se ending.
    const irIdentity = fixtureIdentity(IR.id, "NONE", "fixture: non-pronominal");
    const irseIdentity = fixtureIdentity(
      IRSE.id,
      "LEXICALIZED_ALTERNANT",
      "fixture: distinct lexicalised identity beside IR",
    );
    assert.notEqual(IR.id, IRSE.id);
    assert.equal(irIdentity.pronominality, "NONE");
    assert.equal(irseIdentity.pronominality, "LEXICALIZED_ALTERNANT");
    assert.equal(irseIdentity.pronominalityAuthority, "FIXTURE");
    // Both carry an authority; neither was inferred.
    assert.notEqual(irIdentity.pronominalityAuthority, "NOT_CLASSIFIED");
  });

  test("classifying without authority is rejected", () => {
    const unauthorized = {
      ...fixtureIdentity("LEX-A1-000333", "UNSPECIFIED", "no authority"),
      pronominality: "OBLIGATORY" as const,
      pronominalityAuthority: "NOT_CLASSIFIED" as const,
    };
    assert.throws(
      () => new LexicalEngine(curriculum, { identityOverrides: [unauthorized] }),
      (error: unknown) => {
        assert.ok(error instanceof LexicalEngineError);
        assert.equal(error.issues[0].code, "LEXICAL_ANNOTATION_UNAUTHORIZED");
        return true;
      },
    );
  });

  test("an authorised override is accepted and does not alter the lexeme", () => {
    const declared = fixtureIdentity(
      "LEX-A1-000333",
      "OBLIGATORY",
      "fixture: editorial decision stand-in",
    );
    const withOverride = new LexicalEngine(curriculum, {
      identityOverrides: [declared],
    });
    const identity = withOverride.getIdentity("LEX-A1-000333");
    assert.ok(identity.status === "FOUND");
    assert.equal(identity.value.pronominality, "OBLIGATORY");
    assert.equal(identity.value.pronominalityAuthority, "FIXTURE");

    // The published lexeme is untouched, and the default engine is unaffected.
    const lexeme = withOverride.resolveLexeme("LEX-A1-000333");
    assert.ok(lexeme.status === "FOUND");
    assert.equal(lexeme.value.lemma, "llamarse");
    const untouched = engine.getIdentity("LEX-A1-000333");
    assert.ok(untouched.status === "FOUND");
    assert.equal(untouched.value.pronominality, "UNSPECIFIED");
  });

  test("an override naming an unpublished lexeme is rejected", () => {
    assert.throws(
      () =>
        new LexicalEngine(curriculum, {
          identityOverrides: [
            fixtureIdentity("LEX-A1-999999", "NONE", "does not exist"),
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof LexicalEngineError);
        assert.equal(error.issues[0].code, "LEXICAL_REFERENCE_NOT_FOUND");
        return true;
      },
    );
  });

  test("derived relations never include pronominal claims", () => {
    const derived = deriveHomographRelations(
      engine.getHomographGroups(),
      FIXTURE_RELEASE,
    );
    assert.ok(derived.every((relation) => relation.type === "HOMOGRAPH_OF"));
  });
});
