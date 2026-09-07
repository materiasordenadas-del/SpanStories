import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { createConstructionOccurrence, createLexicalOccurrence, createTextAnchor } from "../engine/story-service.ts";
import { StoryEngineError } from "../domain/errors.ts";
import type { StorySentence } from "../domain/model.ts";
import { PLACEHOLDER_LEXEME_ID } from "./fixtures.ts";

const storyVersionId = asId("StoryVersionId", "storyver-1");

function sentence(id: string, text: string): StorySentence {
  return { id: asId("SentenceId", id), storyVersionId, order: 1, text, tokens: [] };
}

describe("story engine / construction occurrences", () => {
  test("Caso C: 'ha llevado' is represented without minting a new Lexeme for the periphrasis", () => {
    const text = "Ha llevado el paquete.";
    const s = sentence("sent-c", text);
    const headEnd = "Ha llevado".length;
    const head = createTextAnchor(asId("TextAnchorId", "anchor-c1"), storyVersionId, s, { start: 0, end: headEnd });

    // The whole periphrastic form is one HEAD anchor on the existing lexeme
    // "llevar" — no ConstructionOccurrence and no new lexeme id are required
    // just because the tense is compound.
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-c"),
      storyVersionId,
      sentenceId: s.id,
      surface: "Ha llevado",
      lexemeId: PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "UNRESOLVED",
      parts: [{ id: asId("OccurrencePartId", "part-c1"), anchor: head, role: "HEAD" }],
    });

    assert.equal(occurrence.kind, "LEXICAL");
    assert.equal(occurrence.lexemeId, PLACEHOLDER_LEXEME_ID);
    assert.equal(occurrence.parts.length, 1);
  });

  test("Caso D: 'Lleva tres años estudiando español' is ANCHOR + SLOT(DURATION) + SLOT(GERUND_PREDICATE)", () => {
    const text = "Lleva tres anos estudiando espanol.";
    const s = sentence("sent-d", text);

    const anchorStart = 0;
    const anchorEnd = "Lleva".length;
    const durationStart = text.indexOf("tres anos");
    const durationEnd = durationStart + "tres anos".length;
    const gerundStart = text.indexOf("estudiando");
    const gerundEnd = gerundStart + "estudiando".length;

    const anchorPart = createTextAnchor(asId("TextAnchorId", "anchor-d1"), storyVersionId, s, { start: anchorStart, end: anchorEnd });
    const durationPart = createTextAnchor(asId("TextAnchorId", "anchor-d2"), storyVersionId, s, { start: durationStart, end: durationEnd });
    const gerundPart = createTextAnchor(asId("TextAnchorId", "anchor-d3"), storyVersionId, s, { start: gerundStart, end: gerundEnd });

    const occurrence = createConstructionOccurrence({
      id: asId("StoryOccurrenceId", "occ-d"),
      storyVersionId,
      sentenceId: s.id,
      surface: "Lleva tres anos estudiando",
      constructionId: "LLEVAR_DURATION_GERUND",
      parts: [
        { id: asId("OccurrencePartId", "part-d1"), anchor: anchorPart, role: "ANCHOR" },
        { id: asId("OccurrencePartId", "part-d2"), anchor: durationPart, role: "SLOT", slotLabel: "DURATION" },
        { id: asId("OccurrencePartId", "part-d3"), anchor: gerundPart, role: "SLOT", slotLabel: "GERUND_PREDICATE" },
      ],
    });

    assert.equal(occurrence.kind, "CONSTRUCTION");
    assert.equal(occurrence.constructionId, "LLEVAR_DURATION_GERUND");
    assert.deepEqual(
      occurrence.parts.map((p) => [p.role, p.slotLabel]),
      [
        ["ANCHOR", null],
        ["SLOT", "DURATION"],
        ["SLOT", "GERUND_PREDICATE"],
      ],
    );
  });

  test("a CONSTRUCTION occurrence with no ANCHOR part is rejected", () => {
    const s = sentence("sent-e", "tres anos estudiando");
    const slot = createTextAnchor(asId("TextAnchorId", "anchor-e1"), storyVersionId, s, { start: 0, end: 9 });
    assert.throws(
      () =>
        createConstructionOccurrence({
          id: asId("StoryOccurrenceId", "occ-e"),
          storyVersionId,
          sentenceId: s.id,
          surface: "tres anos",
          constructionId: "LLEVAR_DURATION_GERUND",
          parts: [{ id: asId("OccurrencePartId", "part-e1"), anchor: slot, role: "SLOT", slotLabel: "DURATION" }],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "OCCURRENCE_MISSING_REQUIRED_ROLE"),
    );
  });

  test("a SLOT part without a slotLabel is rejected", () => {
    const s = sentence("sent-f", "Lleva anos");
    const anchor = createTextAnchor(asId("TextAnchorId", "anchor-f1"), storyVersionId, s, { start: 0, end: 5 });
    const slot = createTextAnchor(asId("TextAnchorId", "anchor-f2"), storyVersionId, s, { start: 6, end: 10 });
    assert.throws(
      () =>
        createConstructionOccurrence({
          id: asId("StoryOccurrenceId", "occ-f"),
          storyVersionId,
          sentenceId: s.id,
          surface: "Lleva anos",
          constructionId: "LLEVAR_DURATION_GERUND",
          parts: [
            { id: asId("OccurrencePartId", "part-f1"), anchor, role: "ANCHOR" },
            { id: asId("OccurrencePartId", "part-f2"), anchor: slot, role: "SLOT" },
          ],
        }),
      (error: unknown) => error instanceof StoryEngineError && error.issues.some((i) => i.code === "SLOT_LABEL_INVALID"),
    );
  });
});
