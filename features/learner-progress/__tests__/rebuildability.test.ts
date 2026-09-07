import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened, recordStateDeclared } from "../engine/record-event.ts";
import { buildDeclaredStateProjection } from "../engine/declared-state-projection.ts";
import { buildContextHistoryProjection } from "../engine/context-history-projection.ts";
import { buildTargetEvidenceProjection, indexTargetBindingsByOccurrence } from "../engine/target-evidence-projection.ts";
import { buildProgressProjection } from "../engine/progress-projection.ts";
import { withoutCalculatedAt } from "../domain/projection-metadata.ts";
import { InMemoryLearnerEventRepository } from "../repository/in-memory-learner-event-repository.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture, registry } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

const learnerId = asId("LearnerId", "learner-1");

function metadata(calculatedAt: string): ProjectionMetadata {
  return {
    projectionAlgorithmVersion: "declared-state/1.0.0",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    eventCutoff: "2026-12-31T23:59:59.999Z",
    calculatedAt,
  };
}

describe("learner-progress / rebuildability", () => {
  test("delete the projection, rebuild from the same event log: same result", async () => {
    const fixture = await buildStoryFixture();
    const repo = new InMemoryLearnerEventRepository();
    const e1 = recordStateDeclared(
      {
        eventId: asId("LearnerEventId", "levt-1"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: registry.release.releaseId,
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: null,
        recordedLexemeId: "LEX-A1-000015" as LexemeId,
        recordedSenseId: null,
        declaredState: "LEARNING",
      },
      new FixedClock(new Date("2026-01-01T00:00:00.000Z")),
    );
    const e2 = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-2"),
        learnerId,
        storyId: fixture.storyId,
        storyVersionId: fixture.storyVersionId,
        curriculumReleaseId: registry.release.releaseId,
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId: fixture.occurrenceId,
        recordedLexemeId: "LEX-A1-000015" as LexemeId,
        recordedSenseId: null,
        recordedFormId: null,
      },
      new FixedClock(new Date("2026-01-02T00:00:00.000Z")),
    );
    await repo.append(e1);
    await repo.append(e2);

    const buildEverything = async (calculatedAt: string) => {
      const events = await repo.listForLearner(learnerId);
      const declaredState = buildDeclaredStateProjection(learnerId, events, metadata(calculatedAt));
      const contextHistory = buildContextHistoryProjection(learnerId, events, metadata(calculatedAt));
      const targetEvidence = buildTargetEvidenceProjection(
        learnerId,
        registry,
        events,
        indexTargetBindingsByOccurrence([]),
        metadata(calculatedAt),
      );
      const progress = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata(calculatedAt));
      return { declaredState, contextHistory, progress };
    };

    // Projection A: computed once.
    const a = await buildEverything("2026-03-01T00:00:00.000Z");
    // "Delete" A (nothing persisted it) and recompute from the same log as B,
    // under a different `calculatedAt` to prove that field is the only thing
    // allowed to differ.
    const b = await buildEverything("2026-04-01T00:00:00.000Z");

    assert.deepEqual(withoutCalculatedAt(a.declaredState), withoutCalculatedAt(b.declaredState));
    assert.deepEqual(withoutCalculatedAt(a.contextHistory), withoutCalculatedAt(b.contextHistory));
    assert.deepEqual(withoutCalculatedAt(a.progress), withoutCalculatedAt(b.progress));
    // And they are genuinely not identical before stripping calculatedAt.
    assert.notEqual(a.declaredState.metadata.calculatedAt, b.declaredState.metadata.calculatedAt);
  });
});
