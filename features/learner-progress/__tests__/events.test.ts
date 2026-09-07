import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened, recordStateDeclared } from "../engine/record-event.ts";
import { compareLearnerEvents, sortedByOccurrence } from "../engine/ordering.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";

const learnerId = asId("LearnerId", "learner-1");

describe("learner-progress / events", () => {
  test("OCCURRENCE_OPENED conserves its StoryVersion and every release id", () => {
    const fixture = buildStoryFixture();
    const clock = new FixedClock();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      clock,
    );
    assert.equal(event.storyVersionId, fixture.storyVersionId);
    assert.equal(event.curriculumReleaseId, "A1-CURRICULUM-v1.51");
    assert.equal(event.lexiconReleaseId, CURRENT_LEXICON_RELEASE_ID);
    assert.equal(event.occurredAt, clock.now().toISOString());
  });

  test("STATE_DECLARED conserves its releases", () => {
    const fixture = buildStoryFixture();
    const clock = new FixedClock();
    const event = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-2"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        declaredState: "KNOWN",
      },
      clock,
    );
    assert.equal(event.curriculumReleaseId, "A1-CURRICULUM-v1.51");
    assert.equal(event.lexiconReleaseId, CURRENT_LEXICON_RELEASE_ID);
    assert.equal(event.declaredState, "KNOWN");
  });

  test("a recorded event is frozen: mutating it throws", () => {
    const fixture = buildStoryFixture();
    const event = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-3"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        declaredState: "NEW",
      },
      new FixedClock(),
    );
    assert.throws(() => {
      // @ts-expect-error deliberately mutating a readonly-typed, frozen object
      event.declaredState = "KNOWN";
    }, TypeError);
  });

  test("two events sharing a timestamp still sort in a fixed, deterministic order", () => {
    const fixture = buildStoryFixture();
    const clock = new FixedClock(); // same instant for both
    const a = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-b"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        declaredState: "NEW",
      },
      clock,
    );
    const b = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-a"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        declaredState: "LEARNING",
      },
      clock,
    );
    assert.equal(a.occurredAt, b.occurredAt);
    const sortedOnce = sortedByOccurrence([a, b]);
    const sortedAgain = sortedByOccurrence([b, a]);
    assert.deepEqual(sortedOnce.map((e) => e.eventId), sortedAgain.map((e) => e.eventId));
    // eventId is the tiebreaker: "levt-a" sorts before "levt-b".
    assert.deepEqual(sortedOnce.map((e) => e.eventId), ["levt-a", "levt-b"]);
    assert.equal(compareLearnerEvents(a, b) > 0, true);
  });
});
