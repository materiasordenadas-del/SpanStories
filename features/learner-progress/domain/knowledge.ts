/** V1 lexical evidence. Separate from the legacy lexeme-level declarations. */
export const KNOWLEDGE_STATES = ["NEW", "RECOGNIZED", "FAMILIAR", "LEARNED", "KNOWN"] as const;
export type KnowledgeState = typeof KNOWLEDGE_STATES[number];
export type PracticeEvidenceType = "RECOGNITION" | "MEANING_RECALL" | "FORM_RECALL" | "PRODUCTION";
export type KnowledgeEventKind = "SAVED" | "OCCURRENCE_ENCOUNTERED" | "OCCURRENCE_OPENED" | "MEANING_REVEALED" | "STATE_DECLARED" | "PRACTICE";
export type KnowledgeEvent = Readonly<{
  eventId: string;
  learnerId: string;
  targetKey: string;
  occurredAt: string;
  kind: KnowledgeEventKind;
  storyVersionId: string | null;
  occurrenceId: string | null;
  curriculumRelease: string;
  lexiconRelease: string;
  practiceSessionId?: string;
  attemptId?: string;
  evidence?: PracticeEvidenceType;
  outcome?: "correct" | "incorrect" | "revealed" | "skipped";
  assisted?: boolean;
  targetProductive?: boolean;
  declaredState?: KnowledgeState;
  source?: "LEGACY_MIGRATION";
}>;

export type LearnerLexicalKnowledgeProjection = Readonly<{
  learnerId: string;
  targetKey: string;
  computedState: KnowledgeState | "UNSEEN";
  declaredState: KnowledgeState | null;
  encounterCount: number;
  contextDiversity: number;
  successfulRetrievalCount: number;
  lapseCount: number;
  recognitionStrength: number;
  meaningRecallStrength: number;
  formRecallStrength: number;
  productionStrength: number;
  lastEncounterAt: string | null;
  lastSuccessfulRetrievalAt: string | null;
  lastFailureAt: string | null;
  lastMeaningRevealAt: string | null;
  nextReviewAt: string | null;
  projectionAlgorithmVersion: "KNOWLEDGE_PROJECTION_V1";
  eventCutoff: string | null;
  calculatedAt: string;
}>;

export function validateKnowledgeEvent(value: unknown): asserts value is KnowledgeEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid lexical event");
  const e = value as KnowledgeEvent;
  if (![e.eventId, e.learnerId, e.targetKey, e.curriculumRelease, e.lexiconRelease].every(v => typeof v === "string" && v.length > 0)
    || !Number.isFinite(Date.parse(e.occurredAt))
    || !["SAVED", "OCCURRENCE_ENCOUNTERED", "OCCURRENCE_OPENED", "MEANING_REVEALED", "STATE_DECLARED", "PRACTICE"].includes(e.kind)
    || !(e.storyVersionId === null || typeof e.storyVersionId === "string")
    || !(e.occurrenceId === null || typeof e.occurrenceId === "string")) throw new Error("Invalid lexical event");
  if (e.kind === "STATE_DECLARED" && !KNOWLEDGE_STATES.includes(e.declaredState!)) throw new Error("Invalid declared state");
  if (e.kind === "PRACTICE" && (!e.attemptId || !e.practiceSessionId
    || !["RECOGNITION", "MEANING_RECALL", "FORM_RECALL", "PRODUCTION"].includes(e.evidence!)
    || !["correct", "incorrect", "revealed", "skipped"].includes(e.outcome!))) throw new Error("Invalid practice evidence");
}

export function createKnowledgeEvent(input: KnowledgeEvent): KnowledgeEvent {
  validateKnowledgeEvent(input);
  return Object.freeze({ ...input });
}

/** Legacy declarations remain self-reports; migration never invents a success. */
export function migrateDeclaredState(state: "NEW" | "LEARNING" | "KNOWN"): KnowledgeState {
  return state === "LEARNING" ? "RECOGNIZED" : state;
}
