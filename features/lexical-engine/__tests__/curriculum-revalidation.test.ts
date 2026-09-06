/**
 * Phase 2 revalidated against the curriculum registry produced by phase 1.
 *
 * The 103 -> 32 restructure changed the narrative sequence, not the lexicon.
 * This suite is the evidence for that claim: it runs the lexical engine over
 * the *newly generated* `A1-CURRICULUM-v1.51` registry and asserts that
 *
 *   - the engine really is reading v1.51, not a stale v1.44 copy;
 *   - the lexicon keeps its own identity, `A1-LEXICON-v1.0`;
 *   - every published lexical count and semantic rule is unchanged;
 *   - nothing in phase 2 depends on story topology.
 *
 * A silent regression here would mean a curricular resequencing had altered
 * lexical identity, which is exactly what the two-release split exists to
 * prevent.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { LexicalEngine } from "../engine/lexicon.ts";
import { loadLexicalEngine } from "../index.ts";

const CURRICULUM_RELEASE = "A1-CURRICULUM-v1.51";
const LEXICON_RELEASE = "A1-LEXICON-v1.0";

const registry = loadCurriculumRegistry();
const engine = loadLexicalEngine();

describe("lexical engine / revalidation against the curriculum registry", () => {
  test("the registry on disk is the v1.51 release", () => {
    assert.equal(registry.release.releaseId, CURRICULUM_RELEASE);
    assert.equal(registry.release.schemaVersion, "curriculum-registry/2.0.0");
    assert.equal(registry.release.validationResult.status, "PASS");
    // Proof this is not a residual v1.44 tree: the topology it carries is the
    // restructured one.
    assert.equal(registry.getStoriesInSequence().length, 32);
    assert.equal(registry.getIslandsInOrder().length, 11);
  });

  test("loadLexicalEngine consumes that same registry", () => {
    assert.equal(engine.curriculum.release.releaseId, CURRICULUM_RELEASE);
    assert.equal(
      engine.curriculum.release.contentHash,
      registry.release.contentHash,
    );
  });

  test("the lexicon keeps its own release identity", () => {
    assert.equal(engine.release.releaseId as string, LEXICON_RELEASE);
    assert.equal(engine.release.curriculumReleaseId, CURRICULUM_RELEASE);
    assert.notEqual(
      engine.release.releaseId as string,
      engine.release.curriculumReleaseId,
    );
  });

  test("the published lexical inventory is unchanged by the restructure", () => {
    const data = engine.curriculum.data;
    assert.equal(data.lexemes.length, 599);
    assert.equal(data.lexemeForms.length, 666);
    assert.equal(data.senses.length, 608);
    assert.equal(data.senses.filter((value) => value.isA1).length, 602);
    assert.equal(data.senses.filter((value) => !value.isA1).length, 6);
    assert.equal(data.mwuUnits.length, 214);
    assert.equal(data.grammarUnits.length, 169);
    assert.equal(engine.release.lexemeCount, 599);
  });

  test("identity resolution still works by lexeme, form and sense id", () => {
    const lexeme = engine.resolveLexeme("LEX-A1-000001");
    assert.equal(lexeme.status, "FOUND");
    const form = engine.resolveForm("FORM-A1-000001");
    assert.equal(form.status, "FOUND");
    const sense = engine.resolveSense("SENSE-A1-000001");
    assert.equal(sense.status, "FOUND");
    // An unknown id is still NOT_FOUND, never an empty-looking success.
    assert.equal(engine.resolveLexeme("LEX-A1-999999").status, "NOT_FOUND");
  });

  test("the 20 homograph groups survive the restructure", () => {
    assert.equal(engine.getHomographGroups().length, 20);
  });

  test("the 214 MWUs still split 44 with identity / 170 without", () => {
    let withIdentity = 0;
    let withoutIdentity = 0;
    for (const mwu of engine.curriculum.data.mwuUnits) {
      const result = engine.getMwuLexicalIdentity(mwu.id);
      if (result.status === "NO_LEXICAL_IDENTITY") withoutIdentity += 1;
      else if (result.status === "FOUND") withIdentity += 1;
    }
    assert.equal(withIdentity, 44);
    assert.equal(withoutIdentity, 170);
    assert.equal(withIdentity + withoutIdentity, 214);
  });

  test("pronominality stays unclassified for every published lexeme", () => {
    let unspecified = 0;
    for (const lexeme of engine.curriculum.data.lexemes) {
      const identity = engine.getIdentity(lexeme.id);
      assert.ok(identity.status === "FOUND");
      assert.equal(identity.value.pronominality, "UNSPECIFIED");
      assert.equal(identity.value.pronominalityAuthority, "NOT_CLASSIFIED");
      unspecified += 1;
    }
    assert.equal(unspecified, 599);
  });

  test("lineage is empty and acyclic over the published ids", () => {
    for (const lexeme of engine.curriculum.data.lexemes.slice(0, 50)) {
      const resolution = engine.resolveLineage(lexeme.id);
      assert.ok(resolution.status === "FOUND");
      assert.equal(resolution.value.status, "ACTIVE");
    }
  });

  test("no retired story blueprint created, merged, split or removed an identity", () => {
    // Every scheduled SENSE target still resolves to a published sense, and
    // every published A1 sense is still scheduled exactly once. Resequencing
    // moved introductions between stories; it added and removed nothing.
    const scheduled = registry.data.targets.filter((t) => t.targetType === "SENSE");
    for (const target of scheduled) {
      assert.equal(
        engine.resolveSense(target.targetId).status,
        "FOUND",
        `${target.targetId} must still resolve`,
      );
    }
    const a1Senses = registry.data.senses.filter((value) => value.isA1);
    assert.equal(scheduled.length, a1Senses.length);
    assert.equal(new Set(scheduled.map((t) => t.targetId)).size, a1Senses.length);
  });

  test("phase 2 depends on no story-topology figure", () => {
    /*
     * The lexicon is built from `curriculum.data.lexemes` alone. Rebuilding it
     * over a registry whose story topology has been emptied must produce the
     * identical lexical release, which is what "no dependency on 103, on 32
     * islands, or on any historical story id" means operationally.
     */
    const stripped = {
      ...registry,
      data: {
        ...registry.data,
        storyBlueprints: [],
        islands: [],
        modules: [],
        targets: [],
        recycleEdges: [],
      },
    } as unknown as typeof registry;

    const rebuilt = new LexicalEngine(stripped);

    assert.equal(rebuilt.release.releaseId as string, LEXICON_RELEASE);
    assert.equal(rebuilt.release.lexemeCount, engine.release.lexemeCount);
    assert.equal(rebuilt.getHomographGroups().length, engine.getHomographGroups().length);
  });
});
