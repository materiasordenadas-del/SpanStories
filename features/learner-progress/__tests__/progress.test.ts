import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { buildDeclaredStateProjection } from "../engine/declared-state-projection.ts";
import { buildProgressProjection } from "../engine/progress-projection.ts";
import { buildTargetEvidenceProjection, indexTargetBindingsByOccurrence } from "../engine/target-evidence-projection.ts";
import { withoutCalculatedAt } from "../domain/projection-metadata.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture, registry } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { StoryTargetBinding } from "../../story-engine/index.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

const learnerId = asId("LearnerId", "learner-1");
// "adios" — first introduced (SUPPORTED) in A1-M01-I05-S1, target SENSE-A1-000015.
const ADIOS_LEXEME_ID = "LEX-A1-000015" as LexemeId;

function metadata(): ProjectionMetadata {
  return {
    projectionAlgorithmVersion: "progress/1.0.0",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    eventCutoff: "2026-12-31T23:59:59.999Z",
    calculatedAt: new Date().toISOString(),
  };
}

function buildProjection(
  events: Parameters<typeof buildDeclaredStateProjection>[1],
  bindings: readonly StoryTargetBinding[] = [],
) {
  const declaredState = buildDeclaredStateProjection(learnerId, events, metadata());
  const targetEvidence = buildTargetEvidenceProjection(
    learnerId,
    registry,
    events,
    indexTargetBindingsByOccurrence(bindings),
    metadata(),
  );
  return buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
}

function findStory(progression: ReturnType<typeof buildProjection>, storyBlueprintId: string) {
  for (const learnerModule of progression.modules) {
    for (const island of learnerModule.islands) {
      const story = island.stories.find((s) => s.storyBlueprintId === storyBlueprintId);
      if (story !== undefined) return story;
    }
  }
  return undefined;
}

describe("learner-progress / progress projection", () => {
  test("an OCCURRENCE_OPENED event registers as evidence for its target's story", async () => {
    const fixture = await buildStoryFixture();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: registry.release.releaseId,
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: ADIOS_LEXEME_ID,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );

    const progression = buildProjection([event]);
    const story = findStory(progression, "A1-M01-I05-S1");
    assert.ok(story);
    assert.ok(story!.targetsWithEvidence >= 1);
  });

  test("exposure alone (no STATE_DECLARED) never counts as declared-known", async () => {
    const fixture = await buildStoryFixture();
    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: registry.release.releaseId,
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: ADIOS_LEXEME_ID,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(),
    );

    const progression = buildProjection([event]);
    const story = findStory(progression, "A1-M01-I05-S1");
    assert.equal(story!.targetsDeclaredKnown, 0);
  });

  test("computedMastery is null at every level, regardless of evidence", async () => {
    const progression = buildProjection([]);
    for (const learnerModule of progression.modules) {
      assert.equal(learnerModule.computedMastery, null);
      for (const island of learnerModule.islands) {
        assert.equal(island.computedMastery, null);
        for (const story of island.stories) {
          assert.equal(story.computedMastery, null);
        }
      }
    }
  });

  test("Story/Island/Module progress reconstructs deterministically from the same events", async () => {
    const a = buildProjection([]);
    const b = buildProjection([]);
    assert.deepEqual(withoutCalculatedAt(a), withoutCalculatedAt(b));
  });

  test("module/island totals are the sum of their stories'/islands'", async () => {
    const progression = buildProjection([]);
    for (const learnerModule of progression.modules) {
      const expected = learnerModule.islands.reduce((sum, i) => sum + i.totalTargets, 0);
      assert.equal(learnerModule.totalTargets, expected);
    }
  });
});
