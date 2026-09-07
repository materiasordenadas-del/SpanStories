/**
 * Resolve what a historical `LearnerEvent` counts as evidence for, right now.
 *
 * Resolution order (`docs/architecture/plan-implementacion-motor-v1.0.md` §28.1):
 *
 *   1. occurrence reannotation   (Story Engine `OccurrenceAnnotationRevision`)
 *   2. Sense lineage             (the recorded Sense's own current Lexeme)
 *   3. lineage graph             (`EXACT` / equivalent merge / ambiguous split)
 *   4. `AMBIGUOUS_LEGACY` / `UNATTRIBUTED`
 *
 * A tier only runs if the previous one found nothing to say. This function
 * never throws: every input, including a corrupt one, produces a
 * `LearnerEventAttribution` with a status and a reason.
 */

import type { LexemeId } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";
import { effectiveAnnotationOf, type LexicalOccurrence, type OccurrenceAnnotationRevision } from "../../story-engine/index.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { LearnerEventAttribution } from "../domain/attribution.ts";

export type AttributionContext = {
  readonly lexicalEngine: LexicalEngine;
  /** The occurrence the event names, if the Story Engine still has it. */
  readonly occurrence?: LexicalOccurrence;
  readonly occurrenceRevisions?: readonly OccurrenceAnnotationRevision[];
};

function attribution(
  event: LearnerEvent,
  fields: Omit<LearnerEventAttribution, "learnerEventId" | "recordedLexemeId" | "lexiconReleaseId">,
): LearnerEventAttribution {
  return {
    learnerEventId: event.eventId,
    recordedLexemeId: event.recordedLexemeId,
    lexiconReleaseId: event.lexiconReleaseId,
    ...fields,
  };
}

export function resolveAttribution(event: LearnerEvent, ctx: AttributionContext): LearnerEventAttribution {
  const recordedLexemeId = event.recordedLexemeId;

  if (recordedLexemeId === null) {
    return attribution(event, {
      effectiveLexemeId: null,
      ambiguousCandidates: [],
      status: "UNATTRIBUTED",
      reason: "event recorded no lexeme identity",
    });
  }

  // 1. Occurrence reannotation.
  if (ctx.occurrence !== undefined && ctx.occurrenceRevisions !== undefined && ctx.occurrenceRevisions.length > 0) {
    const effective = effectiveAnnotationOf(ctx.occurrence, ctx.occurrenceRevisions);
    if (effective.lexemeId !== recordedLexemeId) {
      return attribution(event, {
        effectiveLexemeId: effective.lexemeId,
        ambiguousCandidates: [],
        status: "BY_OCCURRENCE",
        reason: `occurrence ${ctx.occurrence.id} was reannotated since this event was recorded`,
      });
    }
  }

  // 2-4. Lineage graph.
  const lineage = ctx.lexicalEngine.resolveLineage(recordedLexemeId);
  if (lineage.status === "NOT_FOUND") {
    return attribution(event, {
      effectiveLexemeId: null,
      ambiguousCandidates: [],
      status: "UNATTRIBUTED",
      reason: `recorded lexeme ${recordedLexemeId} is not published`,
    });
  }

  const resolution = lineage.value;
  if (resolution.status === "ACTIVE") {
    return attribution(event, {
      effectiveLexemeId: recordedLexemeId,
      ambiguousCandidates: [],
      status: "EXACT",
      reason: "recorded lexeme is unchanged since this event was recorded",
    });
  }

  if (resolution.status === "RETIRED") {
    return attribution(event, {
      effectiveLexemeId: null,
      ambiguousCandidates: [],
      status: "UNATTRIBUTED",
      reason: `recorded lexeme ${recordedLexemeId} was retired with no successor`,
    });
  }

  if (resolution.status === "SUPERSEDED_RESOLVABLE") {
    const isCoarseningMerge = resolution.via.kind === "MERGE" && resolution.via.semantics === "COARSENING";
    if (isCoarseningMerge) {
      return attribution(event, {
        effectiveLexemeId: null,
        ambiguousCandidates: [],
        status: "UNATTRIBUTED",
        reason: `${recordedLexemeId} was folded into ${resolution.successor} by a coarsening merge, which licenses no automatic evidence transfer`,
      });
    }
    return attribution(event, {
      effectiveLexemeId: resolution.successor,
      ambiguousCandidates: [],
      status: "BY_EQUIVALENT_MERGE",
      reason: `${recordedLexemeId} resolves to exactly one successor (${resolution.via.kind}, ${resolution.via.semantics})`,
    });
  }

  // SUPERSEDED_AMBIGUOUS: try Sense lineage before giving up.
  if (event.recordedSenseId !== null) {
    const senseLexeme = ctx.lexicalEngine.getLexemeForSense(event.recordedSenseId);
    if (senseLexeme.status === "FOUND" && (resolution.successors as readonly LexemeId[]).includes(senseLexeme.value.id)) {
      return attribution(event, {
        effectiveLexemeId: senseLexeme.value.id,
        ambiguousCandidates: [],
        status: "BY_SENSE",
        reason: `sense ${event.recordedSenseId} now belongs to ${senseLexeme.value.id}, disambiguating the split`,
      });
    }
  }

  return attribution(event, {
    effectiveLexemeId: null,
    ambiguousCandidates: resolution.successors,
    status: "AMBIGUOUS_LEGACY",
    reason: `${recordedLexemeId} split into ${resolution.successors.length} successors with no disambiguating evidence`,
  });
}
