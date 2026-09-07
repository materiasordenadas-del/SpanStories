import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { createLexicalOccurrence, createTextAnchor } from "../engine/story-service.ts";
import { StoryEngineError } from "../domain/errors.ts";
import type { StorySentence } from "../domain/model.ts";
import { PLACEHOLDER_LEXEME_ID, SequentialIdGenerator } from "./fixtures.ts";

const storyVersionId = asId("StoryVersionId", "storyver-1");

function sentence(text: string): StorySentence {
  return {
    id: asId("SentenceId", "sent-1"),
    storyVersionId,
    order: 1,
    text,
    tokens: [],
  };
}

describe("story engine / occurrences", () => {
  test("Caso A: 'Marta se dio finalmente cuenta del problema' is a discontinuous occurrence", () => {
    const ids = new SequentialIdGenerator();
    const text = "Marta se dio finalmente cuenta del problema.";
    const s = sentence(text);

    const cliticStart = text.indexOf("se");
    const headStart = text.indexOf("dio");
    const fixedStart = text.indexOf("cuenta");

    const clitic = createTextAnchor(asId("TextAnchorId", ids.next("TextAnchorId")), storyVersionId, s, { start: cliticStart, end: cliticStart + 2 });
    const head = createTextAnchor(asId("TextAnchorId", ids.next("TextAnchorId")), storyVersionId, s, { start: headStart, end: headStart + 3 });
    const fixed = createTextAnchor(asId("TextAnchorId", ids.next("TextAnchorId")), storyVersionId, s, { start: fixedStart, end: fixedStart + 6 });

    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-1"),
      storyVersionId,
      sentenceId: s.id,
      surface: "se dio ... cuenta",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [
        { id: asId("OccurrencePartId", "part-1"), anchor: clitic, role: "CLITIC" },
        { id: asId("OccurrencePartId", "part-2"), anchor: head, role: "HEAD" },
        { id: asId("OccurrencePartId", "part-3"), anchor: fixed, role: "FIXED" },
      ],
    });

    assert.equal(occurrence.parts.length, 3);
    // "finalmente" sits between HEAD and FIXED and belongs to no part — a gap, not an error.
    assert.equal(occurrence.parts.map((p) => p.role).join(","), "CLITIC,HEAD,FIXED");
    assert.equal(occurrence.parts[0].order, 0);
    assert.equal(occurrence.parts[2].order, 2);
  });

  test("Caso B: 'vete' splits into two anchors inside the same orthographic token", () => {
    const s = sentence("Vete de aqui.");
    const head = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 2 }); // "Ve"
    const clitic = createTextAnchor(asId("TextAnchorId", "anchor-2"), storyVersionId, s, { start: 2, end: 4 }); // "te"

    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-2"),
      storyVersionId,
      sentenceId: s.id,
      surface: "Vete",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [
        { id: asId("OccurrencePartId", "part-4"), anchor: head, role: "HEAD" },
        { id: asId("OccurrencePartId", "part-5"), anchor: clitic, role: "CLITIC" },
      ],
    });

    assert.equal(occurrence.parts.length, 2);
    assert.equal(head.end, clitic.start); // contiguous, but two distinct anchors within one token
  });

  test("an occurrence with N parts and gaps between them is valid", () => {
    const s = sentence("A B C D E");
    const a = createTextAnchor(asId("TextAnchorId", "anchor-3"), storyVersionId, s, { start: 0, end: 1 });
    const c = createTextAnchor(asId("TextAnchorId", "anchor-4"), storyVersionId, s, { start: 4, end: 5 });
    const e = createTextAnchor(asId("TextAnchorId", "anchor-5"), storyVersionId, s, { start: 8, end: 9 });

    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-3"),
      storyVersionId,
      sentenceId: s.id,
      surface: "A C E",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [
        { id: asId("OccurrencePartId", "part-6"), anchor: e, role: "HEAD" },
        { id: asId("OccurrencePartId", "part-7"), anchor: a, role: "CLITIC" },
        { id: asId("OccurrencePartId", "part-8"), anchor: c, role: "FIXED" },
      ],
    });

    assert.equal(occurrence.parts.length, 3);
    // order is derived from surface position, independent of input order
    assert.deepEqual(occurrence.parts.map((p) => p.role), ["CLITIC", "FIXED", "HEAD"]);
  });

  test("overlapping parts within the same occurrence are rejected", () => {
    const s = sentence("hola mundo");
    const a = createTextAnchor(asId("TextAnchorId", "anchor-6"), storyVersionId, s, { start: 0, end: 4 });
    const b = createTextAnchor(asId("TextAnchorId", "anchor-7"), storyVersionId, s, { start: 2, end: 6 });

    assert.throws(
      () =>
        createLexicalOccurrence({
          id: asId("StoryOccurrenceId", "occ-4"),
          storyVersionId,
          sentenceId: s.id,
          surface: "hola mundo",
          lexemeId: PLACEHOLDER_LEXEME_ID,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "NOT_REQUIRED",
          parts: [
            { id: asId("OccurrencePartId", "part-9"), anchor: a, role: "HEAD" },
            { id: asId("OccurrencePartId", "part-10"), anchor: b, role: "FIXED" },
          ],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "PART_OVERLAP"),
    );
  });

  test("an occurrence with zero parts is rejected", () => {
    assert.throws(
      () =>
        createLexicalOccurrence({
          id: asId("StoryOccurrenceId", "occ-5"),
          storyVersionId,
          sentenceId: asId("SentenceId", "sent-1"),
          surface: "",
          lexemeId: PLACEHOLDER_LEXEME_ID,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "NOT_REQUIRED",
          parts: [],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "OCCURRENCE_EMPTY"),
    );
  });

  test("a LEXICAL occurrence with no HEAD part is rejected", () => {
    const s = sentence("hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-8"), storyVersionId, s, { start: 0, end: 4 });
    assert.throws(
      () =>
        createLexicalOccurrence({
          id: asId("StoryOccurrenceId", "occ-6"),
          storyVersionId,
          sentenceId: s.id,
          surface: "hola",
          lexemeId: PLACEHOLDER_LEXEME_ID,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "NOT_REQUIRED",
          parts: [{ id: asId("OccurrencePartId", "part-11"), anchor, role: "FIXED" }],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "OCCURRENCE_MISSING_REQUIRED_ROLE"),
    );
  });

  test("a construction-only role (SLOT) is rejected on a LEXICAL occurrence", () => {
    const s = sentence("hola");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-9"), storyVersionId, s, { start: 0, end: 4 });
    assert.throws(
      () =>
        createLexicalOccurrence({
          id: asId("StoryOccurrenceId", "occ-7"),
          storyVersionId,
          sentenceId: s.id,
          surface: "hola",
          lexemeId: PLACEHOLDER_LEXEME_ID,
          senseId: null,
          lexemeFormId: null,
          senseResolutionStatus: "NOT_REQUIRED",
          parts: [{ id: asId("OccurrencePartId", "part-12"), anchor, role: "SLOT" as never, slotLabel: "X" }],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "PART_ROLE_INVALID_FOR_KIND"),
    );
  });
});
