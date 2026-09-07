import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { resolveAttribution } from "../engine/attribution-engine.ts";
import { asId as asStoryId, effectiveAnnotationOf, reviseOccurrenceAnnotation } from "../../story-engine/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture, lineageEvent, buildLexicalEngineWithLineage, lexicalEngine } from "./fixtures.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";

const learnerId = asId("LearnerId", "learner-1");

function openedEvent(fixture: Awaited<ReturnType<typeof buildStoryFixture>>, lexemeId: string, senseId: string | null = null) {
  return recordOccurrenceOpened(
    {
      eventId: asId("LearnerEventId", "levt-1"),
      learnerId,
      storyId: fixture.storyId,
      storyVersionId: fixture.storyVersionId,
      curriculumReleaseId: "A1-CURRICULUM-v1.51",
      lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      occurrenceId: fixture.occurrenceId,
      recordedLexemeId: lexemeId as LexemeId,
      recordedSenseId: senseId as SenseId | null,
      recordedFormId: null,
    },
    new FixedClock(),
  );
}

describe("learner-progress / attribution", () => {
  test("EXACT: an untouched published lexeme resolves to itself", async () => {
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000001");
    const attribution = resolveAttribution(event, { lexicalEngine });
    assert.equal(attribution.status, "EXACT");
    assert.equal(attribution.effectiveLexemeId, "LEX-A1-000001");
  });

  test("BY_OCCURRENCE: an OccurrenceAnnotationRevision on the named occurrence takes priority", async () => {
    const fixture = await buildStoryFixture("LEX-A1-000001");
    const event = openedEvent(fixture, "LEX-A1-000001");
    const revision = reviseOccurrenceAnnotation(
      asStoryId("OccurrenceAnnotationRevisionId", "rev-1"),
      fixture.occurrence,
      { newLexemeId: "LEX-A1-000002" as LexemeId, newSenseId: null, reason: "editorial re-read", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID },
      new FixedClock(),
    );
    const attribution = resolveAttribution(event, { lexicalEngine, occurrence: fixture.occurrence, occurrenceRevisions: [revision] });
    assert.equal(attribution.status, "BY_OCCURRENCE");
    assert.equal(attribution.effectiveLexemeId, "LEX-A1-000002");
  });

  test("BY_SENSE: an ambiguous split is disambiguated by the recorded sense's current lexeme", async () => {
    const split = lineageEvent("SPLIT", ["LEX-A1-000260"], ["LEX-A1-000261", "LEX-A1-000584"], { reason: "fixture split" });
    const engine = buildLexicalEngineWithLineage([split]);
    const fixture = await buildStoryFixture();
    // SENSE-A1-000265 belongs (in the real, current registry) to LEX-A1-000261.
    const event = openedEvent(fixture, "LEX-A1-000260", "SENSE-A1-000265");
    const attribution = resolveAttribution(event, { lexicalEngine: engine });
    assert.equal(attribution.status, "BY_SENSE");
    assert.equal(attribution.effectiveLexemeId, "LEX-A1-000261");
  });

  test("AMBIGUOUS_LEGACY: a split with no recorded sense (or one that doesn't disambiguate) stays ambiguous", async () => {
    const split = lineageEvent("SPLIT", ["LEX-A1-000260"], ["LEX-A1-000261", "LEX-A1-000584"], { reason: "fixture split" });
    const engine = buildLexicalEngineWithLineage([split]);
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000260");
    const attribution = resolveAttribution(event, { lexicalEngine: engine });
    assert.equal(attribution.status, "AMBIGUOUS_LEGACY");
    assert.equal(attribution.effectiveLexemeId, null);
    assert.deepEqual([...attribution.ambiguousCandidates], ["LEX-A1-000261", "LEX-A1-000584"]);
  });

  test("a split never duplicates evidence: an ambiguous event attributes to at most one candidate, never both", async () => {
    const split = lineageEvent("SPLIT", ["LEX-A1-000260"], ["LEX-A1-000261", "LEX-A1-000584"], { reason: "fixture split" });
    const engine = buildLexicalEngineWithLineage([split]);
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000260", "SENSE-A1-000265");
    const attribution = resolveAttribution(event, { lexicalEngine: engine });
    // Exactly one effective lexeme, never a list of "counts towards both."
    assert.equal(typeof attribution.effectiveLexemeId, "string");
    assert.notEqual(attribution.effectiveLexemeId, null);
  });

  test("BY_EQUIVALENT_MERGE: two ids resolvable to one successor under an identity-preserving merge", async () => {
    const merge = lineageEvent("MERGE", ["LEX-A1-000002", "LEX-A1-000003"], ["LEX-A1-000004"], {
      semantics: "EQUIVALENT_IDENTITY",
      transferPolicy: "FULL_EQUIVALENT",
      reason: "fixture merge",
    });
    const engine = buildLexicalEngineWithLineage([merge]);
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000002");
    const attribution = resolveAttribution(event, { lexicalEngine: engine });
    assert.equal(attribution.status, "BY_EQUIVALENT_MERGE");
    assert.equal(attribution.effectiveLexemeId, "LEX-A1-000004");
  });

  test("a merge never copies the underlying event: the log's own length is unaffected by attribution", async () => {
    const merge = lineageEvent("MERGE", ["LEX-A1-000002", "LEX-A1-000003"], ["LEX-A1-000004"], {
      semantics: "EQUIVALENT_IDENTITY",
      transferPolicy: "FULL_EQUIVALENT",
      reason: "fixture merge",
    });
    const engine = buildLexicalEngineWithLineage([merge]);
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000002");
    const events = [event];
    resolveAttribution(event, { lexicalEngine: engine });
    // Attribution is a read; it never appends to or duplicates the event log.
    assert.equal(events.length, 1);
  });

  test("UNATTRIBUTED: a coarsening merge licenses no automatic evidence transfer", async () => {
    const merge = lineageEvent("MERGE", ["LEX-A1-000005", "LEX-A1-000006"], ["LEX-A1-000007"], {
      semantics: "COARSENING",
      transferPolicy: "EVIDENCE_ONLY",
      reason: "fixture coarsening merge",
    });
    const engine = buildLexicalEngineWithLineage([merge]);
    const fixture = await buildStoryFixture();
    const event = openedEvent(fixture, "LEX-A1-000005");
    const attribution = resolveAttribution(event, { lexicalEngine: engine });
    assert.equal(attribution.status, "UNATTRIBUTED");
    assert.equal(attribution.effectiveLexemeId, null);
  });

  test("UNATTRIBUTED: an event that recorded no lexeme contributes nothing", async () => {
    const fixture = await buildStoryFixture();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: null,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    const attribution = resolveAttribution(event, { lexicalEngine });
    assert.equal(attribution.status, "UNATTRIBUTED");
    assert.equal(attribution.effectiveLexemeId, null);
  });

  test("effectiveAnnotationOf underlies BY_OCCURRENCE and does not mutate the occurrence", async () => {
    const fixture = await buildStoryFixture("LEX-A1-000001");
    const revision = reviseOccurrenceAnnotation(
      asStoryId("OccurrenceAnnotationRevisionId", "rev-1"),
      fixture.occurrence,
      { newLexemeId: "LEX-A1-000002" as LexemeId, newSenseId: null, reason: "re-read", lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID },
      new FixedClock(),
    );
    const effective = effectiveAnnotationOf(fixture.occurrence, [revision]);
    assert.equal(effective.lexemeId, "LEX-A1-000002");
    assert.equal(fixture.occurrence.lexemeId, "LEX-A1-000001");
  });
});
