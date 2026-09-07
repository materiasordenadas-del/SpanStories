/**
 * Reannotating a `StoryOccurrence` without disturbing its identity.
 *
 * An occurrence's id is stable for as long as the text it anchors into is
 * stable. When editorial judgement about *which* Lexeme/Sense it realises
 * changes, that is recorded as a new `OccurrenceAnnotationRevision` pointing
 * at the same `occurrenceId` — never as retiring one occurrence and minting
 * an unrelated one. The occurrence object itself is never mutated in place;
 * callers derive the *current* interpretation with `effectiveAnnotationOf`.
 */

import type { LexicalOccurrence, OccurrenceAnnotationRevision } from "../domain/model.ts";
import type { OccurrenceAnnotationRevisionId } from "../domain/ids.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type { Clock } from "../domain/ports.ts";

export function reviseOccurrenceAnnotation(
  id: OccurrenceAnnotationRevisionId,
  occurrence: LexicalOccurrence,
  input: {
    readonly newLexemeId: LexemeId | null;
    readonly newSenseId: SenseId | null;
    readonly reason: string;
    readonly lexiconReleaseId: LexiconReleaseId;
    readonly editorialReference?: string | null;
  },
  clock: Clock,
): OccurrenceAnnotationRevision {
  return {
    id,
    occurrenceId: occurrence.id,
    previousLexemeId: occurrence.lexemeId,
    previousSenseId: occurrence.senseId,
    newLexemeId: input.newLexemeId,
    newSenseId: input.newSenseId,
    reason: input.reason,
    lexiconReleaseId: input.lexiconReleaseId,
    editorialReference: input.editorialReference ?? null,
    createdAt: clock.now().toISOString(),
  };
}

/**
 * The lexeme/sense an occurrence should be read as *right now*, given every
 * revision recorded against it. `revisions` need not be pre-sorted; ordering
 * is resolved here by `createdAt`, falling back to the caller's array order
 * for a tie (mirrors the total-order contract Phase 4 documents for events
 * sharing a timestamp).
 */
export function effectiveAnnotationOf(
  occurrence: LexicalOccurrence,
  revisions: readonly OccurrenceAnnotationRevision[],
): { readonly lexemeId: LexemeId | null; readonly senseId: SenseId | null } {
  const own = revisions
    .map((revision, index) => ({ revision, index }))
    .filter(({ revision }) => revision.occurrenceId === occurrence.id);
  if (own.length === 0) return { lexemeId: occurrence.lexemeId, senseId: occurrence.senseId };
  own.sort((a, b) => {
    const byTime = a.revision.createdAt.localeCompare(b.revision.createdAt);
    return byTime !== 0 ? byTime : a.index - b.index;
  });
  const latest = own[own.length - 1].revision;
  return { lexemeId: latest.newLexemeId, senseId: latest.newSenseId };
}
