/**
 * Total order over `LearnerEvent`s.
 *
 * `occurredAt` alone is not a total order: two events can share a timestamp
 * (a batch import, a fast double-tap). Ties break on `eventId` — an opaque,
 * but fixed, string comparison — so two events sharing an instant still sort
 * the same way on every rebuild, on every machine, regardless of which one a
 * repository happened to store first. This is what makes projections
 * reconstructible: "same events in" must always mean "same order applied."
 */

import type { LearnerEvent } from "../domain/events.ts";

export function compareLearnerEvents(a: LearnerEvent, b: LearnerEvent): number {
  const byTime = a.occurredAt.localeCompare(b.occurredAt);
  if (byTime !== 0) return byTime;
  return a.eventId.localeCompare(b.eventId);
}

export function sortedByOccurrence(events: readonly LearnerEvent[]): readonly LearnerEvent[] {
  return [...events].sort(compareLearnerEvents);
}
