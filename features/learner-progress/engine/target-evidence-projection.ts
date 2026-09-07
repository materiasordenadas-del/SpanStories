/**
 * Resolve `TargetEvidence` for every curriculum target type from the raw
 * event log, without ever collapsing `SENSE`/`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT`
 * into one lexical shape. See `../domain/target-evidence.ts`.
 *
 * Two independent resolution paths, matching
 * `docs/architecture/plan-implementacion-motor-v1.0.md` §"TargetEvidence":
 *
 *   SENSE              -> Sense-exact attribution. `Lexeme exposure != Sense
 *                         evidence`: an `OCCURRENCE_OPENED` credits *one*
 *                         `SENSE` target — the one naming the event's
 *                         effective Sense — never every `SENSE` target that
 *                         happens to share the same Lexeme. The effective
 *                         Sense is resolved through the same contracts
 *                         `../engine/attribution-engine.ts` already exposes
 *                         (occurrence reannotation, then lineage), never a
 *                         second parallel lineage engine. The one exception:
 *                         a Lexeme published with exactly one curriculum
 *                         `SENSE` target is unambiguous even when the event
 *                         recorded no `senseId` — there is no sibling Sense
 *                         to over-credit. A Lexeme with >= 2 `SENSE` targets
 *                         and no resolved Sense credits nothing.
 *   MWU_SOURCE_UNIT /
 *   GRAMMAR_UNIT       -> `StoryTargetBinding` naming the target directly,
 *                         resolved from the event's `occurrenceId` — works
 *                         with no `Lexeme` at all, which is correct for 170
 *                         of 214 MWUs and all 169 grammar units.
 *
 * This is a pure fold, like every other projection in this feature
 * (`../engine/context-history-projection.ts`, `../engine/declared-state-projection.ts`):
 * delete it, rebuild from the same `events`/`targetBindingsByOccurrence`, get
 * the same result (given the same `TargetEvidenceAttributionContext`).
 */

import type { CurriculumRegistry, LexemeId, SenseId } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";
import { effectiveAnnotationOf, type LexicalOccurrence, type OccurrenceAnnotationRevision, type StoryOccurrenceId, type StoryTargetBinding } from "../../story-engine/index.ts";
import { resolveAttribution } from "./attribution-engine.ts";
import type { LearnerEvent, OccurrenceOpenedEvent } from "../domain/events.ts";
import type { LearnerId } from "../domain/ids.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";
import type { TargetEvidence } from "../domain/target-evidence.ts";
import { sortedByOccurrence } from "./ordering.ts";

/**
 * Everything the SENSE path needs to resolve an event's *current* Sense
 * attribution instead of trusting its historical `recordedSenseId`/
 * `recordedLexemeId` blindly. Every field is optional so a caller that has
 * no reannotation/lineage data at hand (most tests, and any projection run
 * before the Story Engine or Lexical Engine ports are wired in) still gets
 * correct, if degraded-to-`EXACT`, behaviour — never a second lineage engine.
 */
export type TargetEvidenceAttributionContext = {
  readonly lexicalEngine?: LexicalEngine;
  readonly occurrenceById?: ReadonlyMap<StoryOccurrenceId, LexicalOccurrence>;
  readonly revisionsByOccurrence?: ReadonlyMap<StoryOccurrenceId, readonly OccurrenceAnnotationRevision[]>;
};

/**
 * The Lexeme/Sense an `OCCURRENCE_OPENED` event should be read as evidencing
 * *right now* — reusing `../engine/attribution-engine.ts`'s resolution order
 * (occurrence reannotation, then lineage) rather than re-deriving it.
 *
 * Returns `{ lexemeId: null, senseId: null }` whenever the event's Lexeme
 * attribution is `UNATTRIBUTED` or `AMBIGUOUS_LEGACY` (a split with no
 * disambiguating evidence): neither state licenses SENSE evidence for any
 * target, on this Lexeme or a successor.
 */
function resolveEffectiveSenseAttribution(
  event: OccurrenceOpenedEvent,
  ctx: TargetEvidenceAttributionContext,
): { readonly lexemeId: LexemeId | null; readonly senseId: SenseId | null } {
  if (event.recordedLexemeId === null) return { lexemeId: null, senseId: null };

  const occurrence = ctx.occurrenceById?.get(event.occurrenceId);
  const revisions = ctx.revisionsByOccurrence?.get(event.occurrenceId) ?? [];

  // Occurrence reannotation always wins over both the historical event and
  // Lexeme lineage: an editor's corrected interpretation of *this* occurrence
  // is more specific than what a lineage graph can say about the Lexeme.
  if (occurrence !== undefined && occurrence.kind === "LEXICAL" && revisions.length > 0) {
    return effectiveAnnotationOf(occurrence, revisions);
  }

  if (ctx.lexicalEngine !== undefined) {
    const attribution = resolveAttribution(event, {
      lexicalEngine: ctx.lexicalEngine,
      occurrence,
      occurrenceRevisions: revisions.length > 0 ? revisions : undefined,
    });
    if (attribution.status === "UNATTRIBUTED" || attribution.status === "AMBIGUOUS_LEGACY") {
      return { lexemeId: null, senseId: null };
    }
    // EXACT / BY_EQUIVALENT_MERGE / BY_SENSE / BY_OCCURRENCE: the recorded
    // Sense (already the disambiguator for BY_SENSE) still names the right
    // Sense under whichever Lexeme attribution resolved to.
    return { lexemeId: attribution.effectiveLexemeId, senseId: event.recordedSenseId };
  }

  // No Lexical Engine supplied: no lineage to check, degrade to the event's
  // own historical record (reannotation, checked above, still applies).
  return { lexemeId: event.recordedLexemeId, senseId: event.recordedSenseId };
}

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

/** `SenseId -> targetId` for every published `SENSE` target — the Sense-exact lookup. */
function senseTargetIdBySenseId(registry: CurriculumRegistry): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const target of registry.data.targets) {
    if (target.targetType !== "SENSE" || target.senseId === null) continue;
    map.set(target.senseId, target.targetId);
  }
  return map;
}

/**
 * The `SENSE` target(s) an event's effective Lexeme/Sense attribution
 * licenses evidence for — never more than one.
 *
 *   - a resolved Sense credits exactly the target naming that Sense (and
 *     only if that target really belongs to the effective Lexeme — a
 *     mismatch here means corrupt input, not a target to credit);
 *   - no resolved Sense credits the Lexeme's one SENSE target when it has
 *     only one (unambiguous by construction), otherwise nothing — crediting
 *     every sibling Sense would be exactly the over-crediting this function
 *     exists to prevent.
 */
function senseTargetIdsToCredit(
  effectiveLexemeId: LexemeId,
  effectiveSenseId: SenseId | null,
  senseTargetsByLexeme: ReadonlyMap<string, readonly string[]>,
  senseTargetsBySense: ReadonlyMap<string, string>,
): readonly string[] {
  const candidates = senseTargetsByLexeme.get(effectiveLexemeId) ?? [];
  if (effectiveSenseId !== null) {
    const exact = senseTargetsBySense.get(effectiveSenseId);
    return exact !== undefined && candidates.includes(exact) ? [exact] : [];
  }
  return candidates.length === 1 ? candidates : [];
}

export function buildTargetEvidenceProjection(
  learnerId: LearnerId,
  registry: CurriculumRegistry,
  events: readonly LearnerEvent[],
  targetBindingsByOccurrence: ReadonlyMap<string, readonly StoryTargetBinding[]>,
  metadata: ProjectionMetadata,
  attributionContext: TargetEvidenceAttributionContext = {},
): TargetEvidenceProjection {
  const cutoff = metadata.eventCutoff;
  const relevant = sortedByOccurrence(
    events.filter((e) => e.learnerId === learnerId && e.eventType === "OCCURRENCE_OPENED" && e.occurredAt <= cutoff),
  ) as readonly OccurrenceOpenedEvent[];

  const senseTargetsByLexeme = senseTargetIdsByLexeme(registry);
  const senseTargetsBySense = senseTargetIdBySenseId(registry);
  const evidenceByTarget = new Map<string, TargetEvidence[]>();
  const push = (targetId: string, evidence: TargetEvidence): void => {
    const bucket = evidenceByTarget.get(targetId);
    if (bucket === undefined) evidenceByTarget.set(targetId, [evidence]);
    else bucket.push(evidence);
  };

  for (const event of relevant) {
    // SENSE: Sense-exact attribution — see module doc and
    // `resolveEffectiveSenseAttribution`/`senseTargetIdsToCredit` above.
    // A recorded Lexeme with no resolvable effective Sense credits nothing
    // beyond its one unambiguous SENSE target, if it has exactly one; a
    // Lexeme exposure alone is never Sense evidence for a multi-Sense Lexeme.
    if (event.recordedLexemeId !== null) {
      const { lexemeId: effectiveLexemeId, senseId: effectiveSenseId } = resolveEffectiveSenseAttribution(event, attributionContext);
      if (effectiveLexemeId !== null) {
        const creditedTargetIds = senseTargetIdsToCredit(effectiveLexemeId, effectiveSenseId, senseTargetsByLexeme, senseTargetsBySense);
        for (const targetId of creditedTargetIds) {
          push(targetId, {
            learnerId,
            targetId,
            targetType: "SENSE",
            evidenceKind: "LEXEME_ATTRIBUTION",
            lexemeId: effectiveLexemeId,
            senseId: effectiveSenseId,
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
