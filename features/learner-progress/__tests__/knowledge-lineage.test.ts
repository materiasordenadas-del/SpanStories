import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyKnowledgeEvent } from "../engine/knowledge-legacy.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { asId } from "../domain/ids.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture, lineageEvent, buildLexicalEngineWithLineage } from "./fixtures.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";

test("knowledge migration reuses lineage: one merge event stays one, ambiguous split transfers nowhere", async () => {
  const fixture = await buildStoryFixture();
  const make = (lexeme: string, sense: string | null) => recordOccurrenceOpened({ eventId: asId("LearnerEventId", "levt-knowledge-lineage"),
    learnerId: asId("LearnerId", "learner-knowledge"), storyId: fixture.storyId, storyVersionId: fixture.storyVersionId,
    curriculumReleaseId: "A1-CURRICULUM-v1.51", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID, occurrenceId: fixture.occurrenceId,
    recordedLexemeId: lexeme as LexemeId, recordedSenseId: sense as SenseId | null, recordedFormId: null }, new FixedClock());
  const split = buildLexicalEngineWithLineage([lineageEvent("SPLIT", ["LEX-A1-000260"], ["LEX-A1-000261", "LEX-A1-000584"])]);
  const ambiguous = make("LEX-A1-000260", null);
  assert.equal(legacyKnowledgeEvent(ambiguous, "guest", { lexicalEngine: split }), null);
  const resolved = legacyKnowledgeEvent(make("LEX-A1-000260", "SENSE-A1-000265"), "guest", { lexicalEngine: split });
  assert.equal(resolved?.targetKey, "SENSE:SENSE-A1-000265");
  const merge = buildLexicalEngineWithLineage([lineageEvent("MERGE", ["LEX-A1-000001", "LEX-A1-000003"], ["LEX-A1-000002"], { transferPolicy: "FULL_EQUIVALENT" })]);
  const original = make("LEX-A1-000001", null);
  const projected = legacyKnowledgeEvent(original, "guest", { lexicalEngine: merge });
  assert.equal(projected?.targetKey, "LEXEME:LEX-A1-000002");
  assert.equal(projected?.eventId, `legacy:${original.eventId}`);
  assert.equal(original.recordedLexemeId, "LEX-A1-000001");
});
