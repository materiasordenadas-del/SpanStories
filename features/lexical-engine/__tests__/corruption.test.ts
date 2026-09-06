/**
 * Deliberate corruption: every case must fail explicitly and in a typed way.
 *
 * The bar is not "does not crash". Each case must produce a named issue code or
 * a distinguishable non-value status, because the failure mode this suite exists
 * to prevent is a wrong answer that looks right — a missing lexeme reported as
 * an empty list, a non-lexicalised MWU treated as a lexeme, a split id quietly
 * redirected to one child.
 *
 * Nothing here mutates the canonical sources or the generated registry.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { LexicalEngine } from "../engine/lexicon.ts";
import { LineageGraph, validateLineage } from "../engine/lineage-graph.ts";
import { LexicalEngineError, formatLexicalIssue } from "../domain/errors.ts";
import { codesOf, fixtureLexemeId, lineageEvent } from "./fixtures.ts";

const curriculum = loadCurriculumRegistry();
const engine = new LexicalEngine(curriculum);

const A = fixtureLexemeId("A");
const B = fixtureLexemeId("B");
const C = fixtureLexemeId("C");

const topology = (events: Parameters<typeof validateLineage>[0]) =>
  validateLineage(events, new Set());

/** Assert a topology fails and carries the expected code. */
function assertFails(
  events: Parameters<typeof validateLineage>[0],
  code: string,
): void {
  const validation = topology(events);
  assert.equal(validation.status, "FAIL");
  assert.ok(
    codesOf(validation.issues).includes(code),
    `expected ${code}, got: ${validation.issues.map(formatLexicalIssue).join("; ")}`,
  );
}

describe("lexical engine / corruption — identity", () => {
  test("1. a non-existent lexeme is NOT_FOUND, never an empty answer", () => {
    const result = engine.resolveLexeme("LEX-A1-000000");
    assert.equal(result.status, "NOT_FOUND");
    assert.ok(result.status === "NOT_FOUND");
    assert.equal(result.id, "LEX-A1-000000");
    // And the collection queries agree rather than returning [].
    assert.equal(engine.getForms("LEX-A1-000000").status, "NOT_FOUND");
    assert.equal(engine.getSenses("LEX-A1-000000").status, "NOT_FOUND");
    assert.equal(engine.getIdentity("LEX-A1-000000").status, "NOT_FOUND");
    assert.equal(engine.getRelations("LEX-A1-000000").status, "NOT_FOUND");
  });

  test("2. a form pointing at a missing lexeme throws, it does not answer", () => {
    // A registry whose form references a lexeme that is not there is corrupt.
    // Returning NOT_FOUND would misreport corruption as a bad input id.
    const corrupt = {
      ...curriculum,
      getFormById: () => ({ id: "FORM-A1-000001", lexemeId: "LEX-A1-999999" }),
      getLexemeById: () => null,
    } as unknown as typeof curriculum;
    const broken = Object.create(
      Object.getPrototypeOf(engine) as object,
    ) as LexicalEngine;
    Object.assign(broken, engine, { curriculum: corrupt });

    assert.throws(
      () => broken.getLexemeForForm("FORM-A1-000001"),
      (error: unknown) => {
        assert.ok(error instanceof LexicalEngineError);
        assert.equal(error.issues[0].code, "LEXICAL_REFERENCE_NOT_FOUND");
        assert.equal(error.issues[0].referencedId, "LEX-A1-999999");
        return true;
      },
    );
  });

  test("3. a sense pointing at a missing lexeme throws, it does not answer", () => {
    const corrupt = {
      ...curriculum,
      getSenseById: () => ({ id: "SENSE-A1-000001", lexemeId: "LEX-A1-999999" }),
      getLexemeById: () => null,
    } as unknown as typeof curriculum;
    const broken = Object.create(
      Object.getPrototypeOf(engine) as object,
    ) as LexicalEngine;
    Object.assign(broken, engine, { curriculum: corrupt });

    assert.throws(
      () => broken.getLexemeForSense("SENSE-A1-000001"),
      (error: unknown) => {
        assert.ok(error instanceof LexicalEngineError);
        assert.equal(error.issues[0].code, "LEXICAL_REFERENCE_NOT_FOUND");
        return true;
      },
    );
  });

  test("4. a non-lexicalised MWU cannot be read as a lexeme", () => {
    const identity = engine.getMwuLexicalIdentity("12B1-MWU-0008");
    assert.equal(identity.status, "NO_LEXICAL_IDENTITY");
    // The status has no `value`, so a caller cannot reach a lexeme through it.
    assert.equal("value" in identity, false);
    // And the unit id is not a lexeme id in any other lookup.
    assert.equal(engine.resolveLexeme("12B1-MWU-0008").status, "NOT_FOUND");
    assert.equal(engine.getIdentity("12B1-MWU-0008").status, "NOT_FOUND");
  });
});

describe("lexical engine / corruption — lineage", () => {
  test("5. a cycle is rejected: A -> B, B -> A", () => {
    assertFails(
      [
        lineageEvent("REPLACED_BY", [A], [B], { reason: "forward" }),
        lineageEvent("REPLACED_BY", [B], [A], { reason: "back" }),
      ],
      "LEXICAL_LINEAGE_CYCLE",
    );
  });

  test("5b. a longer cycle is rejected: A -> B -> C -> A", () => {
    const validation = topology([
      lineageEvent("REPLACED_BY", [A], [B], { reason: "1" }),
      lineageEvent("REPLACED_BY", [B], [C], { reason: "2" }),
      lineageEvent("REPLACED_BY", [C], [A], { reason: "3" }),
    ]);
    assert.equal(validation.status, "FAIL");
    const cycle = validation.issues.find(
      (issue) => issue.code === "LEXICAL_LINEAGE_CYCLE",
    );
    assert.ok(cycle, "cycle must be reported");
    // The path is reported so the offending edges can be found.
    assert.ok((cycle.path ?? []).length >= 3);
  });

  test("5c. a self-edge is rejected", () => {
    assertFails(
      [lineageEvent("REPLACED_BY", [A], [A], { reason: "self" })],
      "LEXICAL_LINEAGE_CYCLE",
    );
  });

  test("6. SPLIT with fewer than two targets is rejected", () => {
    assertFails(
      [lineageEvent("SPLIT", [A], [B], { reason: "not a split" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
    assertFails(
      [lineageEvent("SPLIT", [A], [], { reason: "no targets" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
    assertFails(
      [lineageEvent("SPLIT", [A, B], [C, A], { reason: "two sources" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
  });

  test("7. MERGE with fewer than two sources is rejected", () => {
    assertFails(
      [lineageEvent("MERGE", [A], [C], { reason: "not a merge" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
    assertFails(
      [lineageEvent("MERGE", [A, B], [], { reason: "no target" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
  });

  test("8. REPLACED_BY with more than one target is rejected", () => {
    assertFails(
      [lineageEvent("REPLACED_BY", [A], [B, C], { reason: "two targets" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
    assertFails(
      [lineageEvent("REPLACED_BY", [A, B], [C], { reason: "two sources" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
  });

  test("9. RETIRE with a successor is rejected", () => {
    assertFails(
      [lineageEvent("RETIRE", [A], [B], { reason: "retire with successor" })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
  });

  test("10. a legacy split id is never resolved to one child", () => {
    const split = lineageEvent("SPLIT", [A], [B, C], { reason: "split" });
    const graph = new LineageGraph([split]);
    const resolved = graph.resolve(A);

    assert.equal(resolved.status, "SUPERSEDED_AMBIGUOUS");
    assert.ok(resolved.status === "SUPERSEDED_AMBIGUOUS");
    assert.notEqual(resolved.status as string, "SUPERSEDED_RESOLVABLE");
    // Every candidate is present and the caller must choose deliberately.
    assert.deepEqual([...resolved.successors].sort(), [B, C].sort());
    assert.equal((resolved as { successor?: unknown }).successor, undefined);
  });

  test("a lexeme superseded by two events is rejected", () => {
    assertFails(
      [
        lineageEvent("REPLACED_BY", [A], [B], { reason: "first" }),
        lineageEvent("REPLACED_BY", [A], [C], { reason: "second" }),
      ],
      "LEXICAL_LINEAGE_CONFLICT",
    );
  });

  test("a duplicate lineage event id is rejected", () => {
    assertFails(
      [
        lineageEvent("RETIRE", [A], [], { id: "LIN-A1-000900", reason: "one" }),
        lineageEvent("RETIRE", [B], [], { id: "LIN-A1-000900", reason: "two" }),
      ],
      "LEXICAL_DUPLICATE_ID",
    );
  });

  test("a lineage event with no reason is rejected", () => {
    assertFails(
      [lineageEvent("RETIRE", [A], [], { reason: "   " })],
      "LEXICAL_LINEAGE_CARDINALITY_INVALID",
    );
  });

  test("a duplicated id within one event is rejected", () => {
    assertFails(
      [lineageEvent("SPLIT", [A], [B, B], { reason: "duplicate target" })],
      "LEXICAL_LINEAGE_CONFLICT",
    );
  });

  test("lineage naming an unpublished lexeme is rejected by the engine", () => {
    assert.throws(
      () =>
        new LexicalEngine(curriculum, {
          lineageEvents: [
            lineageEvent("RETIRE", ["LEX-A1-999999"], [], {
              reason: "unpublished source",
            }),
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof LexicalEngineError);
        assert.ok(
          codesOf(error.issues).includes("LEXICAL_REFERENCE_NOT_FOUND"),
        );
        return true;
      },
    );
  });

  test("a corrupt lineage set is rejected whole, never partially loaded", () => {
    // One good event and one bad one: the engine must refuse both rather than
    // load the good one and answer half the questions correctly.
    assert.throws(
      () =>
        new LexicalEngine(curriculum, {
          lineageEvents: [
            lineageEvent("RETIRE", ["LEX-A1-000001"], [], { reason: "valid" }),
            lineageEvent("SPLIT", ["LEX-A1-000002"], ["LEX-A1-000003"], {
              reason: "invalid cardinality",
            }),
          ],
        }),
      LexicalEngineError,
    );
  });

  test("every issue is reported in one pass, not just the first", () => {
    const validation = topology([
      lineageEvent("SPLIT", [A], [B], { reason: "" }),
      lineageEvent("MERGE", [C], [B], {
        semantics: "COARSENING",
        transferPolicy: "FULL_EQUIVALENT",
        reason: "bad on three counts",
      }),
    ]);
    assert.equal(validation.status, "FAIL");
    assert.ok(validation.issues.length >= 3);
    const codes = new Set(codesOf(validation.issues));
    assert.ok(codes.has("LEXICAL_LINEAGE_CARDINALITY_INVALID"));
    assert.ok(codes.has("LEXICAL_TRANSFER_POLICY_INVALID"));
  });

  test("issues format with enough context to locate them", () => {
    const validation = topology([
      lineageEvent("SPLIT", [A], [B], { id: "LIN-A1-000777", reason: "x" }),
    ]);
    const text = validation.issues.map(formatLexicalIssue).join("\n");
    assert.match(text, /LEXICAL_LINEAGE_CARDINALITY_INVALID/);
    assert.match(text, /LIN-A1-000777/);
    assert.match(text, /targetLexemeIds/);
  });
});
