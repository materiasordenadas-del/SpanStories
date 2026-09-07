import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened, recordStateDeclared } from "../engine/record-event.ts";
import { buildDeclaredStateProjection } from "../engine/declared-state-projection.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

const learnerId = asId("LearnerId", "learner-1");
const lexemeId = "LEX-A1-000001" as LexemeId;

function metadata(eventCutoff: string): ProjectionMetadata {
  return {
    projectionAlgorithmVersion: "declared-state/1.0.0",
    curriculumReleaseId: "A1-CURRICULUM-v1.51",
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    eventCutoff,
    calculatedAt: new Date().toISOString(),
  };
}

describe("learner-progress / declared state projection", () => {
  test("the state reconstructs from events: the latest declaration wins", () => {
    const fixture = buildStoryFixture();
    const early = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        declaredState: "NEW",
      },
      new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
    );
    const later = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-2"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        declaredState: "KNOWN",
      },
      new FixedClock(new Date("2026-02-01T00:00:00.000Z")),
    );

    const projection = buildDeclaredStateProjection(learnerId, [later, early], metadata("2026-03-01T00:00:00.000Z"));
    assert.equal(projection.states.get(lexemeId)?.state, "KNOWN");
  });

  test("KNOWN is still just a declaration: the projection carries no independent mastery field", () => {
    const fixture = buildStoryFixture();
    const event = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        declaredState: "KNOWN",
      },
      new FixedClock(),
    );
    const projection = buildDeclaredStateProjection(learnerId, [event], metadata("2026-03-01T00:00:00.000Z"));
    const entry = projection.states.get(lexemeId);
    assert.deepEqual(Object.keys(entry!).sort(), ["declaredAt", "lexemeId", "sourceEventId", "state"]);
  });

  test("OCCURRENCE_OPENED events (mere exposure) never create a declared state", () => {
    const fixture = buildStoryFixture();
    const opened = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    const projection = buildDeclaredStateProjection(learnerId, [opened], metadata("2026-03-01T00:00:00.000Z"));
    assert.equal(projection.states.size, 0);
  });

  test("the metadata carries an algorithm version and an event cutoff", () => {
    const projection = buildDeclaredStateProjection(learnerId, [], metadata("2026-03-01T00:00:00.000Z"));
    assert.equal(projection.metadata.projectionAlgorithmVersion, "declared-state/1.0.0");
    assert.equal(projection.metadata.eventCutoff, "2026-03-01T00:00:00.000Z");
  });

  test("an event after the cutoff is excluded", () => {
    const fixture = buildStoryFixture();
    const late = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        declaredState: "KNOWN",
      },
      new FixedClock(new Date("2026-05-01T00:00:00.000Z")),
    );
    const projection = buildDeclaredStateProjection(learnerId, [late], metadata("2026-01-01T00:00:00.000Z"));
    assert.equal(projection.states.size, 0);
  });
});
