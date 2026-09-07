import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { validateLearnerEvent, appendValidatedEvent } from "../engine/append-event.ts";
import { InMemoryLearnerEventRepository } from "../repository/in-memory-learner-event-repository.ts";
import { asId as asStoryId } from "../../story-engine/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";

const learnerId = asId("LearnerId", "learner-1");

describe("learner-progress / corruption must fail loudly", () => {
  test("an event naming an unknown StoryVersion is rejected", () => {
    const fixture = buildStoryFixture();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: asStoryId("StoryVersionId", "storyver-does-not-exist"),
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    const result = validateLearnerEvent(event, fixture.repo);
    assert.equal(result.status, "INVALID");
    assert.ok(result.status === "INVALID" && result.issues.some((i) => i.code === "UNKNOWN_STORY_VERSION"));
  });

  test("an event naming an unknown Occurrence is rejected", () => {
    const fixture = buildStoryFixture();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: asStoryId("StoryOccurrenceId", "occ-does-not-exist"),
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    const result = validateLearnerEvent(event, fixture.repo);
    assert.equal(result.status, "INVALID");
    assert.ok(result.status === "INVALID" && result.issues.some((i) => i.code === "UNKNOWN_OCCURRENCE"));
  });

  test("appendValidatedEvent throws rather than storing a corrupt event", () => {
    const fixture = buildStoryFixture();
    const eventLog = new InMemoryLearnerEventRepository();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: asStoryId("StoryVersionId", "storyver-does-not-exist"),
        curriculumReleaseId: "A1-CURRICULUM-v1.51",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: "LEX-A1-000001" as LexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    assert.throws(() => appendValidatedEvent(event, eventLog, fixture.repo), /EVENT_REFERENCE_INVALID/);
    assert.equal(eventLog.getById(event.eventId), null);
  });

  test("a valid event still appends normally", () => {
    const fixture = buildStoryFixture();
    const eventLog = new InMemoryLearnerEventRepository();
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
      new FixedClock(),
    );
    appendValidatedEvent(event, eventLog, fixture.repo);
    assert.deepEqual(eventLog.getById(event.eventId), event);
  });
});
