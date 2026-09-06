/**
 * Lexeme lineage.
 *
 * The A1 release carries no lineage history, so every case here is a technical
 * fixture. Two levels are exercised: pure topology through `validateLineage`
 * and `LineageGraph` (fixture ids, no registry), and lineage over real
 * published ids through the engine, which is what proves that a superseded
 * published id keeps resolving.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { LexicalEngine } from "../engine/lexicon.ts";
import { LineageGraph, validateLineage } from "../engine/lineage-graph.ts";
import { LINEAGE_CARDINALITY } from "../domain/lineage.ts";
import { codesOf, fixtureLexemeId, lineageEvent } from "./fixtures.ts";

const curriculum = loadCurriculumRegistry();

const A = fixtureLexemeId("A");
const B = fixtureLexemeId("B");
const C = fixtureLexemeId("C");
const D = fixtureLexemeId("D");

/** Validate pure topology: no registry, so reference checking is skipped. */
const topology = (events: Parameters<typeof validateLineage>[0]) =>
  validateLineage(events, new Set());

describe("lexical engine / lineage topology", () => {
  test("a valid split: A -> B + C", () => {
    const split = lineageEvent("SPLIT", [A], [B, C], {
      semantics: "EQUIVALENT_IDENTITY",
      transferPolicy: "CONTEXTUAL",
      reason: "A conflated two identities",
    });
    const validation = topology([split]);
    assert.equal(validation.status, "PASS", codesOf(validation.issues).join(","));

    const graph = new LineageGraph([split]);
    // A remains resolvable.
    const resolved = graph.resolve(A);
    assert.equal(resolved.status, "SUPERSEDED_AMBIGUOUS");
    assert.equal(graph.lifecycleOf(A), "SUPERSEDED");
    // B and C are its successors.
    assert.deepEqual([...graph.getSuccessors(A)], [B, C]);
    assert.deepEqual([...graph.getPredecessors(B)], [A]);
    assert.deepEqual([...graph.getPredecessors(C)], [A]);
  });

  test("a legacy split id never resolves to one arbitrary child", () => {
    const split = lineageEvent("SPLIT", [A], [B, C], {
      reason: "A was too coarse",
    });
    const graph = new LineageGraph([split]);
    const resolved = graph.resolve(A);

    assert.equal(resolved.status, "SUPERSEDED_AMBIGUOUS");
    assert.ok(resolved.status === "SUPERSEDED_AMBIGUOUS");
    // Both candidates are reported; neither is elected.
    assert.deepEqual([...resolved.successors], [B, C]);
    // The resolution shape carries no single-successor field to read by
    // mistake, so a caller cannot accidentally pick one.
    assert.equal("successor" in resolved, false);
  });

  test("a three-way split is still ambiguous, not majority-resolved", () => {
    const split = lineageEvent("SPLIT", [A], [B, C, D], { reason: "three ways" });
    const graph = new LineageGraph([split]);
    const resolved = graph.resolve(A);
    assert.ok(resolved.status === "SUPERSEDED_AMBIGUOUS");
    assert.equal(resolved.successors.length, 3);
  });

  test("a valid equivalent merge: A + B -> C", () => {
    const merge = lineageEvent("MERGE", [A, B], [C], {
      semantics: "EQUIVALENT_IDENTITY",
      transferPolicy: "FULL_EQUIVALENT",
      reason: "two ids denoted one identity",
    });
    const validation = topology([merge]);
    assert.equal(validation.status, "PASS", codesOf(validation.issues).join(","));

    const graph = new LineageGraph([merge]);
    // A and B both remain resolvable, each with a single successor.
    for (const source of [A, B]) {
      const resolved = graph.resolve(source);
      assert.equal(resolved.status, "SUPERSEDED_RESOLVABLE");
      assert.ok(resolved.status === "SUPERSEDED_RESOLVABLE");
      assert.equal(resolved.successor, C);
      assert.equal(resolved.via.semantics, "EQUIVALENT_IDENTITY");
      assert.equal(resolved.via.transferPolicy, "FULL_EQUIVALENT");
    }
    assert.deepEqual([...graph.getPredecessors(C)], [A, B]);
    assert.equal(graph.lifecycleOf(C), "ACTIVE");
  });

  test("a coarsening merge cannot claim FULL_EQUIVALENT transfer", () => {
    const invalid = lineageEvent("MERGE", [A, B], [C], {
      semantics: "COARSENING",
      transferPolicy: "FULL_EQUIVALENT",
      reason: "distinction dropped",
    });
    const validation = topology([invalid]);
    assert.equal(validation.status, "FAIL");
    assert.ok(codesOf(validation.issues).includes("LEXICAL_TRANSFER_POLICY_INVALID"));
  });

  test("a coarsening merge is valid and implies no transfer by itself", () => {
    const merge = lineageEvent("MERGE", [A, B], [C], {
      semantics: "COARSENING",
      transferPolicy: "NONE",
      reason: "A and B are no longer distinguished",
    });
    assert.equal(topology([merge]).status, "PASS");

    const graph = new LineageGraph([merge]);
    const resolved = graph.resolve(A);
    assert.ok(resolved.status === "SUPERSEDED_RESOLVABLE");
    assert.equal(resolved.via.semantics, "COARSENING");
    // Phase 2 records the policy and acts on none of it: there is no learner
    // state here to transfer, and nothing in the graph reads mastery.
    assert.equal(resolved.via.transferPolicy, "NONE");
  });

  test("REPLACED_BY keeps one identity under a new id", () => {
    const replaced = lineageEvent("REPLACED_BY", [A], [B], {
      semantics: "EQUIVALENT_IDENTITY",
      transferPolicy: "FULL_EQUIVALENT",
      reason: "reissued under a new id",
    });
    assert.equal(topology([replaced]).status, "PASS");
    const graph = new LineageGraph([replaced]);
    const resolved = graph.resolve(A);
    assert.ok(resolved.status === "SUPERSEDED_RESOLVABLE");
    assert.equal(resolved.successor, B);
  });

  test("RETIRE withdraws an identity with no successor", () => {
    const retire = lineageEvent("RETIRE", [A], [], {
      transferPolicy: "NONE",
      reason: "withdrawn from the inventory",
    });
    assert.equal(topology([retire]).status, "PASS");
    const graph = new LineageGraph([retire]);
    assert.equal(graph.lifecycleOf(A), "RETIRED");
    const resolved = graph.resolve(A);
    assert.equal(resolved.status, "RETIRED");
    // Retired, still resolvable, no successors invented.
    assert.deepEqual([...graph.getSuccessors(A)], []);
  });

  test("a chain resolves each hop without collapsing history", () => {
    const first = lineageEvent("REPLACED_BY", [A], [B], { reason: "reissue 1" });
    const second = lineageEvent("REPLACED_BY", [B], [C], { reason: "reissue 2" });
    assert.equal(topology([first, second]).status, "PASS");
    const graph = new LineageGraph([first, second]);
    const fromA = graph.resolve(A);
    assert.ok(fromA.status === "SUPERSEDED_RESOLVABLE");
    // One hop at a time: A -> B, and B -> C. A does not silently become C.
    assert.equal(fromA.successor, B);
    const fromB = graph.resolve(B);
    assert.ok(fromB.status === "SUPERSEDED_RESOLVABLE");
    assert.equal(fromB.successor, C);
    assert.equal(graph.resolve(C).status, "ACTIVE");
  });

  test("the declared cardinality table matches the four kinds", () => {
    assert.deepEqual(LINEAGE_CARDINALITY.SPLIT, {
      minSources: 1,
      maxSources: 1,
      minTargets: 2,
      maxTargets: null,
    });
    assert.deepEqual(LINEAGE_CARDINALITY.MERGE, {
      minSources: 2,
      maxSources: null,
      minTargets: 1,
      maxTargets: 1,
    });
    assert.deepEqual(LINEAGE_CARDINALITY.REPLACED_BY, {
      minSources: 1,
      maxSources: 1,
      minTargets: 1,
      maxTargets: 1,
    });
    assert.deepEqual(LINEAGE_CARDINALITY.RETIRE, {
      minSources: 1,
      maxSources: 1,
      minTargets: 0,
      maxTargets: 0,
    });
  });
});

describe("lexical engine / lineage over published ids", () => {
  test("a superseded published id still resolves", () => {
    // LEX-A1-000260 (`frío` ADJ) split into two fixture successors. The
    // published id is not deleted, not reused and not redirected.
    const split = lineageEvent(
      "SPLIT",
      ["LEX-A1-000260"],
      ["LEX-A1-000261", "LEX-A1-000584"],
      { reason: "fixture: a published id superseded by two published ones" },
    );
    const engine = new LexicalEngine(curriculum, { lineageEvents: [split] });

    // Still resolvable as a lexeme, with its published lemma intact.
    const lexeme = engine.resolveLexeme("LEX-A1-000260");
    assert.ok(lexeme.status === "FOUND");
    assert.equal(lexeme.value.lemma, "frío");

    // Lifecycle reflects the event.
    const identity = engine.getIdentity("LEX-A1-000260");
    assert.ok(identity.status === "FOUND");
    assert.equal(identity.value.lifecycle, "SUPERSEDED");

    // And lineage refuses to elect a child.
    const resolved = engine.resolveLineage("LEX-A1-000260");
    assert.ok(resolved.status === "FOUND");
    assert.equal(resolved.value.status, "SUPERSEDED_AMBIGUOUS");
  });

  test("untouched published lexemes stay ACTIVE alongside a lineage event", () => {
    const split = lineageEvent(
      "SPLIT",
      ["LEX-A1-000260"],
      ["LEX-A1-000261", "LEX-A1-000584"],
      { reason: "fixture" },
    );
    const engine = new LexicalEngine(curriculum, { lineageEvents: [split] });
    const other = engine.getIdentity("LEX-A1-000001");
    assert.ok(other.status === "FOUND");
    assert.equal(other.value.lifecycle, "ACTIVE");
    assert.equal(engine.release.lineageEventCount, 1);
  });

  test("lineage queries on an unknown lexeme are NOT_FOUND", () => {
    const engine = new LexicalEngine(curriculum);
    assert.equal(engine.resolveLineage("LEX-A1-999999").status, "NOT_FOUND");
    assert.equal(engine.getSuccessors("LEX-A1-999999").status, "NOT_FOUND");
    assert.equal(engine.getPredecessors("LEX-A1-999999").status, "NOT_FOUND");
  });

  test("with no lineage every published id resolves as ACTIVE", () => {
    const engine = new LexicalEngine(curriculum);
    assert.equal(engine.release.lineageEventCount, 0);
    const resolved = engine.resolveLineage("LEX-A1-000001");
    assert.ok(resolved.status === "FOUND");
    assert.equal(resolved.value.status, "ACTIVE");
    const successors = engine.getSuccessors("LEX-A1-000001");
    assert.ok(successors.status === "FOUND");
    assert.deepEqual([...successors.value], []);
  });
});
