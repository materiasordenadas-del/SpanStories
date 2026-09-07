/**
 * Every `OCCURRENCE_OPENED` encounter, grouped by the Lexeme it evidences —
 * never collapsed to a count. See `../domain/context-history.ts`.
 */

import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerId } from "../domain/ids.ts";
import type { ContextHistoryEntry, ContextHistoryProjection } from "../domain/context-history.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";
import { sortedByOccurrence } from "./ordering.ts";

export function buildContextHistoryProjection(
  learnerId: LearnerId,
  events: readonly LearnerEvent[],
  metadata: ProjectionMetadata,
): ContextHistoryProjection {
  const cutoff = metadata.eventCutoff;
  const relevant = sortedByOccurrence(
    events.filter((e) => e.learnerId === learnerId && e.eventType === "OCCURRENCE_OPENED" && e.occurredAt <= cutoff),
  );

  const entriesByLexeme = new Map<string, ContextHistoryEntry[]>();
  for (const event of relevant) {
    if (event.eventType !== "OCCURRENCE_OPENED") continue;
    if (event.recordedLexemeId === null) continue;
    const entry: ContextHistoryEntry = {
      storyVersionId: event.storyVersionId,
      occurrenceId: event.occurrenceId,
      occurredAt: event.occurredAt,
      recordedLexemeId: event.recordedLexemeId,
      recordedSenseId: event.recordedSenseId,
      sourceEventId: event.eventId,
    };
    const bucket = entriesByLexeme.get(event.recordedLexemeId);
    if (bucket === undefined) entriesByLexeme.set(event.recordedLexemeId, [entry]);
    else bucket.push(entry);
  }

  return { learnerId, entriesByLexeme, metadata };
}
