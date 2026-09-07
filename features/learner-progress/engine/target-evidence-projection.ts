/**
 * Resolve `TargetEvidence` for every curriculum target type from the raw
 * event log, without ever collapsing `SENSE`/`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT`
 * into one lexical shape. See `../domain/target-evidence.ts`.
 *
 * Two independent resolution paths, matching
 * `docs/architecture/plan-implementacion-motor-v1.0.md` §"TargetEvidence":
 *
 *   SENSE              -> lexeme attribution (unchanged pre-existing path:
 *                         `OCCURRENCE_OPENED.recordedLexemeId` matched
 *                         against every `SENSE` target sharing that lexeme —
 *                         same lineage-aware behaviour
 *                         `../engine/attribution-engine.ts` already provides
 *                         via `ContextHistoryProjection`)
 *   MWU_SOURCE_UNIT /
 *   GRAMMAR_UNIT       -> `StoryTargetBinding` naming the target directly,
 *                         resolved from the event's `occurrenceId` — works
 *                         with no `Lexeme` at all, which is correct for 170
 *                         of 214 MWUs and all 169 grammar units.
 *
 * This is a pure fold, like every other projection in this feature
 * (`../engine/context-history-projection.ts`, `../engine/declared-state-projection.ts`):
 * delete it, rebuild from the same `events`/`targetBindingsByOccurrence`, get
 * the same result.
 */

import type { CurriculumRegistry } from "../../curriculum/index.ts";
import type { StoryTargetBinding } from "../../story-engine/index.ts";
import type { LearnerEvent, OccurrenceOpenedEvent } from "../domain/events.ts";
import type { LearnerId } from "../domain/ids.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";
import type { TargetEvidence } from "../domain/target-evidence.ts";
import { sortedByOccurrence } from "./ordering.ts";

export type TargetEvidenceProjection = {
  readonly learnerId: LearnerId;
  /** Keyed by curricular `targetId`; absent key means no recorded evidence, not zero. */
  readonly evidenceByTarget: ReadonlyMap<string, readonly TargetEvidence[]>;
  readonly metadata: ProjectionMetadata;
};

/** Index `StoryTargetBinding`s by the `StoryOccurrenceId` they bind — every event resolves its bindings in O(1). */
export function indexTargetBindingsByOccurrence(
  bindings: readonly StoryTargetBinding[],
): ReadonlyMap<string, readonly StoryTargetBinding[]> {
  const map = new Map<string, StoryTargetBinding[]>();
  for (const binding of bindings) {
    const bucket = map.get(binding.occurrenceId);
    if (bucket === undefined) map.set(binding.occurrenceId, [binding]);
    else bucket.push(binding);
  }
  return map;
}

/**
 * Build one `MwuTargetEvidence`/`GrammarTargetEvidence` record from a single
 * `OCCURRENCE_OPENED` event and one `StoryTargetBinding` naming a
 * non-`SENSE` target on that same occurrence.
 *
 * A pure, throwing validator — corruption fails loudly here rather than
 * silently vanishing from a projection (same convention as
 * `CurriculumRegistry.getFirstIntroduction`, `../../story-engine/engine/target-binding.ts`).
 * `SENSE` never reaches this function: it is resolved exclusively through
 * lexeme attribution (see module doc above); a caller that does pass a
 * `SENSE` binding here has one for the wrong reason.
 */
export function createStoryTargetBindingEvidence(input: {
  readonly registry: CurriculumRegistry;
  readonly event: OccurrenceOpenedEvent;
  readonly binding: StoryTargetBinding;
}): TargetEvidence {
  const { registry, event, binding } = input;

  if (binding.occurrenceId !== event.occurrenceId || binding.storyVersionId !== event.storyVersionId) {
    throw new Error(
      `TARGET_EVIDENCE_BINDING_MISMATCH: binding ${binding.id} (occurrence ${binding.occurrenceId}, version ${binding.storyVersionId}) does not belong to event ${event.eventId} (occurrence ${event.occurrenceId}, version ${event.storyVersionId})`,
    );
  }

  if (binding.targetType === "SENSE") {
    throw new Error(
      `TARGET_EVIDENCE_SENSE_VIA_BINDING_UNSUPPORTED: SENSE evidence is resolved through lexeme attribution, not a StoryTargetBinding (target ${binding.targetId})`,
    );
  }

  const resolved = registry.resolveTarget(binding.targetId);
  if (resolved === null) {
    throw new Error(`TARGET_EVIDENCE_UNKNOWN_TARGET: ${binding.targetId} is not a published curriculum target`);
  }
  if (resolved.targetType !== binding.targetType) {
    throw new Error(
      `TARGET_EVIDENCE_TARGET_TYPE_MISMATCH: binding ${binding.id} declares ${binding.targetType} but ${binding.targetId} is published as ${resolved.targetType}`,
    );
  }

  const base = {
    learnerId: event.learnerId,
    targetId: binding.targetId,
    storyId: event.storyId,
    storyVersionId: event.storyVersionId,
    occurrenceId: event.occurrenceId,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    curriculumReleaseId: event.curriculumReleaseId,
    lexiconReleaseId: event.lexiconReleaseId,
    evidenceKind: "STORY_TARGET_BINDING" as const,
  };

  if (resolved.targetType === "MWU_SOURCE_UNIT") {
    return { ...base, targetType: "MWU_SOURCE_UNIT" };
  }
  return { ...base, targetType: "GRAMMAR_UNIT" };
}

function senseTargetIdsByLexeme(registry: CurriculumRegistry): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const target of registry.data.targets) {
    if (target.targetType !== "SENSE" || target.lexemeId === null) continue;
    const bucket = map.get(target.lexemeId);
    if (bucket === undefined) map.set(target.lexemeId, [target.targetId]);
    else bucket.push(target.targetId);
  }
  return map;
}

export function buildTargetEvidenceProjection(
  learnerId: LearnerId,
  registry: CurriculumRegistry,
  events: readonly LearnerEvent[],
  targetBindingsByOccurrence: ReadonlyMap<string, readonly StoryTargetBinding[]>,
  metadata: ProjectionMetadata,
): TargetEvidenceProjection {
  const cutoff = metadata.eventCutoff;
  const relevant = sortedByOccurrence(
    events.filter((e) => e.learnerId === learnerId && e.eventType === "OCCURRENCE_OPENED" && e.occurredAt <= cutoff),
  ) as readonly OccurrenceOpenedEvent[];

  const senseTargetsByLexeme = senseTargetIdsByLexeme(registry);
  const evidenceByTarget = new Map<string, TargetEvidence[]>();
  const push = (targetId: string, evidence: TargetEvidence): void => {
    const bucket = evidenceByTarget.get(targetId);
    if (bucket === undefined) evidenceByTarget.set(targetId, [evidence]);
    else bucket.push(evidence);
  };

  for (const event of relevant) {
    // SENSE: unchanged lexeme-based path. Every SENSE target sharing this
    // lexeme counts as evidenced — the same lexeme-level (not sense-exact)
    // granularity `../engine/progress-projection.ts` has always had.
    if (event.recordedLexemeId !== null) {
      for (const targetId of senseTargetsByLexeme.get(event.recordedLexemeId) ?? []) {
        push(targetId, {
          learnerId,
          targetId,
          targetType: "SENSE",
          evidenceKind: "LEXEME_ATTRIBUTION",
          lexemeId: event.recordedLexemeId,
          senseId: event.recordedSenseId,
          storyId: event.storyId,
          storyVersionId: event.storyVersionId,
          occurrenceId: event.occurrenceId,
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          curriculumReleaseId: event.curriculumReleaseId,
          lexiconReleaseId: event.lexiconReleaseId,
        });
      }
    }

    // MWU_SOURCE_UNIT / GRAMMAR_UNIT: StoryTargetBinding path. Works with no
    // Lexeme at all — correct for MWUs without lexical identity and for
    // every grammar unit.
    const bindings = targetBindingsByOccurrence.get(event.occurrenceId) ?? [];
    for (const binding of bindings) {
      if (binding.targetType === "SENSE") continue; // SENSE handled above.
      const evidence = createStoryTargetBindingEvidence({ registry, event, binding });
      push(binding.targetId, evidence);
    }
  }

  return { learnerId, evidenceByTarget, metadata };
}
