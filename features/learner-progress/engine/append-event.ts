/**
 * Validate a `LearnerEvent`'s Story Engine references before it is appended.
 *
 * The event log itself never validates anything (a `LearnerEventRepository`
 * is a dumb, append-only store — see `../repository/learner-event-repository.ts`).
 * This is the one place corruption is caught *before* it becomes permanent
 * history: an event naming a `StoryVersionId`/`StoryOccurrenceId` the Story
 * Engine does not actually have must fail loudly here, not silently poison
 * every projection built from the log afterwards.
 */

import type { StoryRepository } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventRepository } from "../repository/learner-event-repository.ts";

export type EventValidationIssue =
  | { readonly code: "UNKNOWN_STORY_VERSION"; readonly storyVersionId: string }
  | { readonly code: "UNKNOWN_OCCURRENCE"; readonly occurrenceId: string };

export type EventValidationResult =
  | { readonly status: "VALID" }
  | { readonly status: "INVALID"; readonly issues: readonly EventValidationIssue[] };

export function validateLearnerEvent(
  event: LearnerEvent,
  storyRepository: StoryRepository,
): EventValidationResult {
  const issues: EventValidationIssue[] = [];

  if (storyRepository.getStoryVersion(event.storyVersionId) === null) {
    issues.push({ code: "UNKNOWN_STORY_VERSION", storyVersionId: event.storyVersionId });
  }

  const occurrenceId = event.eventType === "OCCURRENCE_OPENED" ? event.occurrenceId : event.occurrenceId;
  if (occurrenceId !== null && storyRepository.getOccurrence(occurrenceId) === null) {
    issues.push({ code: "UNKNOWN_OCCURRENCE", occurrenceId });
  }

  return issues.length === 0 ? { status: "VALID" } : { status: "INVALID", issues };
}

/** Validate, then append. Throws `EVENT_REFERENCE_INVALID` rather than storing a corrupt event. */
export function appendValidatedEvent(
  event: LearnerEvent,
  eventRepository: LearnerEventRepository,
  storyRepository: StoryRepository,
): void {
  const validation = validateLearnerEvent(event, storyRepository);
  if (validation.status === "INVALID") {
    throw new Error(`EVENT_REFERENCE_INVALID: ${JSON.stringify(validation.issues)}`);
  }
  eventRepository.append(event);
}
