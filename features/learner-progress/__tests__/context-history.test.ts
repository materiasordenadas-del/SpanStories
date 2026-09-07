import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { buildContextHistoryProjection } from "../engine/context-history-projection.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

const learnerId = asId("LearnerId", "learner-1");
const lexemeId = "LEX-A1-000001" as LexemeId;

function metadata(): ProjectionMetadata {
  return {
    projectionAlgorithmVersion: "context-history/1.0.0",
    curriculumReleaseId: "A1-CURRICULUM-v1.51",
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    eventCutoff: "2026-12-31T23:59:59.999Z",
    calculatedAt: new Date().toISOString(),
  };
}

describe("learner-progress / context history projection", () => {
  test("two distinct encounters of the same lexeme are kept as two entries, not one count", async () => {
    const fixture = await buildStoryFixture();
    const first = recordOccurrenceOpened(
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
      new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
    );
    const second = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-2"),
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
      new FixedClock(new Date("2026-02-01T00:00:00.000Z")),
    );

    const projection = buildContextHistoryProjection(learnerId, [first, second], metadata());
    const entries = projection.entriesByLexeme.get(lexemeId);
    assert.equal(entries?.length, 2);
    assert.notEqual(entries?.[0].sourceEventId, entries?.[1].sourceEventId);
  });

  test("each entry keeps its own StoryVersion and occurrence, not just the lexeme id", async () => {
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
        recordedLexemeId: lexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );
    const projection = buildContextHistoryProjection(learnerId, [event], metadata());
    const [entry] = projection.entriesByLexeme.get(lexemeId)!;
    assert.equal(entry.storyVersionId, fixture.storyVersionId);
    assert.equal(entry.occurrenceId, fixture.occurrenceId);
  });

  test("a lexeme with no recorded encounter is simply absent, not zero", async () => {
    const projection = buildContextHistoryProjection(learnerId, [], metadata());
    assert.equal(projection.entriesByLexeme.has("LEX-A1-000999" as LexemeId), false);
  });
});
