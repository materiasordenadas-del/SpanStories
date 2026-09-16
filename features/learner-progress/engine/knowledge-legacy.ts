import { createKnowledgeEvent, migrateDeclaredState, type KnowledgeEvent } from "../domain/knowledge.ts";
import type { LearnerEvent } from "../domain/events.ts";
import { resolveAttribution, type AttributionContext } from "./attribution-engine.ts";

/** Reuse the domain's lineage resolver; never spread an ambiguous event to its children. */
export function legacyKnowledgeEvent(event: LearnerEvent, learnerId: string, context: AttributionContext): KnowledgeEvent | null {
  const attribution = resolveAttribution(event, context);
  if (attribution.status === "AMBIGUOUS_LEGACY" || attribution.status === "UNATTRIBUTED" || !attribution.effectiveLexemeId) return null;
  // A corrected occurrence needs the current target-evidence projection's exact sense decision.
  // Until that decision is supplied, keep its history without transferring mastery.
  if (attribution.status === "BY_OCCURRENCE") return null;
  // Sense-specific historical evidence cannot silently move to a different sense after reannotation.
  const sense = event.recordedSenseId;
  const targetKey = sense ? `SENSE:${sense}` : `LEXEME:${attribution.effectiveLexemeId}`;
  return createKnowledgeEvent({ eventId: `legacy:${event.eventId}`, learnerId, targetKey, occurredAt: event.occurredAt,
    kind: event.eventType === "STATE_DECLARED" ? "STATE_DECLARED" : "OCCURRENCE_OPENED",
    storyVersionId: event.storyVersionId, occurrenceId: event.occurrenceId,
    curriculumRelease: event.curriculumReleaseId, lexiconRelease: event.lexiconReleaseId,
    ...(event.eventType === "STATE_DECLARED" ? { declaredState: migrateDeclaredState(event.declaredState) } : {}), source: "LEGACY_MIGRATION" });
}

/** Browser legacy log has no reliable account ownership. Only the guest may import it. */
export function importBrowserLegacyDeclarations(value: unknown, owner: string): readonly KnowledgeEvent[] {
  if (owner !== "guest" || !value || typeof value !== "object") return [];
  const log = value as { events?: unknown };
  if (!Array.isArray(log.events)) return [];
  return log.events.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const e = raw as Record<string, unknown>;
    const state = e.declaredState ?? e.value;
    if ((e.eventType ?? e.type) !== "STATE_DECLARED" || !["NEW", "LEARNING", "KNOWN"].includes(String(state))) return [];
    const sense = e.recordedSenseId;
    const lexeme = e.recordedLexemeId;
    // Historical lexeme declarations remain lexeme-level. No fan-out to every sense.
    const key = typeof sense === "string" && /^SENSE-A1-\d+$/.test(sense) ? `SENSE:${sense}`
      : typeof lexeme === "string" && /^LEX-A1-\d+$/.test(lexeme) ? `LEXEME:${lexeme}` : null;
    const id = e.eventId ?? e.id;
    if (!key || typeof id !== "string" || typeof e.occurredAt !== "string" || !Number.isFinite(Date.parse(e.occurredAt))) return [];
    return [createKnowledgeEvent({ eventId: `legacy:${id}`, learnerId: owner, targetKey: key, occurredAt: e.occurredAt,
      kind: "STATE_DECLARED", declaredState: migrateDeclaredState(state as "NEW" | "LEARNING" | "KNOWN"), source: "LEGACY_MIGRATION",
      storyVersionId: typeof e.storyVersionId === "string" ? e.storyVersionId : null,
      occurrenceId: typeof e.occurrenceId === "string" ? e.occurrenceId : null,
      curriculumRelease: typeof e.curriculumReleaseId === "string" ? e.curriculumReleaseId : "legacy-unversioned",
      lexiconRelease: typeof (e.lexiconReleaseId ?? e.lexiconRelease) === "string" ? String(e.lexiconReleaseId ?? e.lexiconRelease) : "legacy-unversioned" })];
  });
}
