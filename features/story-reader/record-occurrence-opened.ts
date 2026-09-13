import {
  LocalStorageLearnerEventRepository,
  RandomIdGenerator,
  SystemClock,
  appendValidatedEvent,
  asId as asLearnerProgressId,
  recordOccurrenceOpened,
  type StorageLike,
} from "../learner-progress/index.ts";
import { InMemoryStoryRepository } from "../story-engine/index.ts";
import type { StoryReaderEventContext } from "./model.ts";

export async function recordStoryOccurrenceOpened(
  context: StoryReaderEventContext,
  occurrenceId: string,
  storage: StorageLike = window.localStorage,
) {
  const occurrence = context.occurrences.find((candidate) => candidate.id === occurrenceId);
  if (occurrence === undefined || occurrence.kind !== "LEXICAL") {
    throw new Error(`UNKNOWN_LEXICAL_OCCURRENCE: ${occurrenceId}`);
  }

  const storyRepository = new InMemoryStoryRepository();
  await storyRepository.saveStory(context.story);
  await storyRepository.saveNewVersion({
    version: context.version,
    sentences: context.sentences,
    anchors: context.anchors,
    occurrences: context.occurrences,
    targetBindings: context.targetBindings,
  });
  const eventRepository = new LocalStorageLearnerEventRepository(storage);
  const event = recordOccurrenceOpened({
    eventId: asLearnerProgressId("LearnerEventId", new RandomIdGenerator().next("LearnerEventId")),
    learnerId: asLearnerProgressId("LearnerId", "learner-local-reader"),
    storyId: context.story.id,
    storyVersionId: context.version.id,
    curriculumReleaseId: context.curriculumReleaseId,
    lexiconReleaseId: context.lexiconReleaseId,
    occurrenceId: occurrence.id,
    recordedLexemeId: occurrence.lexemeId,
    recordedSenseId: occurrence.senseId,
    recordedFormId: occurrence.lexemeFormId,
  }, new SystemClock());
  await appendValidatedEvent(event, eventRepository, storyRepository);
  return event;
}
