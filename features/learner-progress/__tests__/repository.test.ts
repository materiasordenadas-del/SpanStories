import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordStateDeclared } from "../engine/record-event.ts";
import { InMemoryLearnerEventRepository } from "../repository/in-memory-learner-event-repository.ts";
import { LocalStorageLearnerEventRepository, type StorageLike } from "../repository/local-storage-learner-event-repository.ts";
import type { LearnerEventRepository } from "../repository/learner-event-repository.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, buildStoryFixture } from "./fixtures.ts";
import type { LexemeId } from "../../curriculum/index.ts";

const learnerId = asId("LearnerId", "learner-1");
const otherLearnerId = asId("LearnerId", "learner-2");

/** A minimal in-memory stand-in for the Web Storage API, for Node tests. */
class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

async function makeEvent(eventId: string, learner = learnerId, lexemeId = "LEX-A1-000001") {
  const fixture = await buildStoryFixture();
  return recordStateDeclared(
    {
      eventId: asId("LearnerEventId", eventId),
      learnerId: learner,
      storyId: fixture.storyId,
      storyVersionId: fixture.storyVersionId,
      curriculumReleaseId: "A1-CURRICULUM-v1.51",
      lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      occurrenceId: null,
      recordedLexemeId: lexemeId as LexemeId,
      recordedSenseId: null,
      declaredState: "LEARNING",
    },
    new FixedClock(),
  );
}

/** The same behavioural contract, run against every adapter. */
function runContractTests(name: string, makeRepository: () => LearnerEventRepository) {
  describe(`learner-progress / repository contract (${name})`, () => {
    test("append then getById round-trips", async () => {
      const repo = makeRepository();
      const event = await makeEvent("levt-1");
      await repo.append(event);
      assert.deepEqual(await repo.getById(event.eventId), event);
    });

    test("an unknown id is null, not undefined", async () => {
      const repo = makeRepository();
      assert.equal(await repo.getById(asId("LearnerEventId", "levt-missing")), null);
    });

    test("appending a duplicate eventId is rejected, not merged", async () => {
      const repo = makeRepository();
      const event = await makeEvent("levt-1");
      await repo.append(event);
      await assert.rejects(() => repo.append(event), /DUPLICATE_LEARNER_EVENT_ID/);
    });

    test("the interface offers no update/delete method", async () => {
      const repo = makeRepository();
      assert.equal("update" in repo, false);
      assert.equal("delete" in repo, false);
    });

    test("listForLearner only returns that learner's events", async () => {
      const repo = makeRepository();
      const mine = await makeEvent("levt-1", learnerId);
      const theirs = await makeEvent("levt-2", otherLearnerId);
      await repo.append(mine);
      await repo.append(theirs);
      const result = await repo.listForLearner(learnerId);
      assert.equal(result.length, 1);
      assert.equal(result[0].eventId, mine.eventId);
    });

    test("listForLearnerAndLexeme filters on both", async () => {
      const repo = makeRepository();
      const a = await makeEvent("levt-1", learnerId, "LEX-A1-000001");
      const b = await makeEvent("levt-2", learnerId, "LEX-A1-000002");
      await repo.append(a);
      await repo.append(b);
      const result = await repo.listForLearnerAndLexeme(learnerId, "LEX-A1-000001" as LexemeId);
      assert.equal(result.length, 1);
      assert.equal(result[0].eventId, a.eventId);
    });

    test("listForStoryVersion returns every event on that version", async () => {
      const repo = makeRepository();
      const event = await makeEvent("levt-1");
      await repo.append(event);
      const result = await repo.listForStoryVersion(event.storyVersionId);
      assert.equal(result.length, 1);
    });
  });
}

runContractTests("in-memory", () => new InMemoryLearnerEventRepository());
runContractTests("localStorage", () => new LocalStorageLearnerEventRepository(new FakeStorage()));
