import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { createLexicalOccurrence, createTextAnchor } from "../engine/story-service.ts";
import { effectiveAnnotationOf, reviseOccurrenceAnnotation } from "../engine/annotation-revision.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import type { StorySentence } from "../domain/model.ts";
import { FixedClock, PLACEHOLDER_LEXEME_ID } from "./fixtures.ts";

const storyVersionId = asId("StoryVersionId", "storyver-1");
const OTHER_LEXEME_ID = "LEX-A1-000002" as LexemeId;
const SOME_SENSE_ID = "SENSE-A1-000001" as SenseId;

function sentence(text: string): StorySentence {
  return { id: asId("SentenceId", "sent-1"), storyVersionId, order: 1, text, tokens: [] };
}

function baseOccurrence() {
  const s = sentence("dio la vuelta");
  const anchor = createTextAnchor(asId("TextAnchorId", "anchor-1"), storyVersionId, s, { start: 0, end: 3 });
  return createLexicalOccurrence({
    id: asId("StoryOccurrenceId", "occ-1"),
    storyVersionId,
    sentenceId: s.id,
    surface: "dio",
    lexemeId: PLACEHOLDER_LEXEME_ID,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "UNRESOLVED",
    parts: [{ id: asId("OccurrencePartId", "part-1"), anchor, role: "HEAD" }],
  });
}

describe("story engine / occurrence annotation revision", () => {
  test("reannotating keeps the occurrence id stable", () => {
    const clock = new FixedClock();
    const occurrence = baseOccurrence();

    const revision = reviseOccurrenceAnnotation(
      asId("OccurrenceAnnotationRevisionId", "rev-1"),
      occurrence,
      { newLexemeId: OTHER_LEXEME_ID, newSenseId: SOME_SENSE_ID, reason: "editorial re-read", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID },
      clock,
    );

    assert.equal(revision.occurrenceId, occurrence.id);
    assert.equal(revision.previousLexemeId, PLACEHOLDER_LEXEME_ID);
    assert.equal(revision.newLexemeId, OTHER_LEXEME_ID);
    // the occurrence itself is untouched — it is never mutated in place
    assert.equal(occurrence.lexemeId, PLACEHOLDER_LEXEME_ID);
  });

  test("with no revisions, the effective annotation is the occurrence's own", () => {
    const occurrence = baseOccurrence();
    const effective = effectiveAnnotationOf(occurrence, []);
    assert.equal(effective.lexemeId, PLACEHOLDER_LEXEME_ID);
    assert.equal(effective.senseId, null);
  });

  test("the latest revision (by createdAt) determines the effective annotation", () => {
    const occurrence = baseOccurrence();
    const early = reviseOccurrenceAnnotation(
      asId("OccurrenceAnnotationRevisionId", "rev-1"),
      occurrence,
      { newLexemeId: OTHER_LEXEME_ID, newSenseId: null, reason: "first pass", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID },
      new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
    );
    const later = reviseOccurrenceAnnotation(
      asId("OccurrenceAnnotationRevisionId", "rev-2"),
      occurrence,
      { newLexemeId: PLACEHOLDER_LEXEME_ID, newSenseId: SOME_SENSE_ID, reason: "corrected", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID },
      new FixedClock(new Date("2026-02-01T00:00:00.000Z")),
    );

    const effective = effectiveAnnotationOf(occurrence, [later, early]);
    assert.equal(effective.lexemeId, PLACEHOLDER_LEXEME_ID);
    assert.equal(effective.senseId, SOME_SENSE_ID);
  });
});
