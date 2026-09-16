import { KNOWLEDGE_STATES, type KnowledgeEvent, type KnowledgeState, type LearnerLexicalKnowledgeProjection } from "../domain/knowledge.ts";
import { DAY, scheduleReview } from "./review-scheduler.ts";

export type KnowledgePolicy = Readonly<{ familiarDays: number; learnedDays: number; knownGapDays: number; revealCooldownMs: number; independentGapMs: number; failuresToDemote: number; recentDays: number }>;
export const KNOWLEDGE_POLICY_V1: KnowledgePolicy = Object.freeze({ familiarDays: 1, learnedDays: 3, knownGapDays: 21, revealCooldownMs: 600_000, independentGapMs: 60_000, failuresToDemote: 2, recentDays: 7 });

/** Pure replay, scoped to exactly one learner and identity. No surface/lexeme expansion. */
export function projectKnowledge(events: readonly KnowledgeEvent[], learnerId: string, targetKey: string, productive: boolean, calculatedAt: string, policy = KNOWLEDGE_POLICY_V1): LearnerLexicalKnowledgeProjection {
  const unique = new Map<string, KnowledgeEvent>();
  for (const event of events) if (event.learnerId === learnerId && event.targetKey === targetKey && Date.parse(event.occurredAt) <= Date.parse(calculatedAt)) unique.set(event.eventId, event);
  const ordered = [...unique.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  let state: KnowledgeState | "UNSEEN" = "UNSEEN";
  let declaredState: KnowledgeState | null = null;
  let encounterCount = 0, lapseCount = 0, failures = 0;
  let revealAt: string | null = null, failureAt: string | null = null, encounterAt: string | null = null;
  const contexts = new Set<string>();
  const successes: KnowledgeEvent[] = [];
  const attempts = new Set<string>();
  const strengths = { RECOGNITION: 0, MEANING_RECALL: 0, FORM_RECALL: 0, PRODUCTION: 0 };
  for (const e of ordered) {
    const now = Date.parse(e.occurredAt);
    if (e.kind !== "OCCURRENCE_ENCOUNTERED" && state === "UNSEEN") state = "NEW";
    if (["OCCURRENCE_ENCOUNTERED", "OCCURRENCE_OPENED", "SAVED"].includes(e.kind)) {
      encounterCount++;
      encounterAt = e.occurredAt;
      if (e.storyVersionId) contexts.add(e.storyVersionId);
    }
    if (e.kind === "STATE_DECLARED") declaredState = e.declaredState!;
    if (e.kind === "MEANING_REVEALED") revealAt = e.occurredAt;
    if (e.kind !== "PRACTICE" || attempts.has(e.attemptId!)) continue;
    attempts.add(e.attemptId!);
    if (e.outcome === "skipped") continue;
    if (e.storyVersionId) contexts.add(e.storyVersionId);
    if (e.outcome === "revealed") { revealAt = e.occurredAt; continue; }
    if (e.outcome === "incorrect") {
      if (failureAt && now - Date.parse(failureAt) > policy.recentDays * DAY) failures = 0;
      failureAt = e.occurredAt;
      if (state === "LEARNED" || state === "KNOWN") lapseCount++;
      failures++;
      if (failures >= policy.failuresToDemote && state !== "UNSEEN") {
        state = KNOWLEDGE_STATES[Math.max(0, KNOWLEDGE_STATES.indexOf(state) - 1)];
        failures = 0;
      }
      continue;
    }
    const previous = successes.at(-1);
    const independent = !e.assisted && (!revealAt || now - Date.parse(revealAt) >= policy.revealCooldownMs)
      && (!previous || now - Date.parse(previous.occurredAt) >= policy.independentGapMs);
    if (!independent) continue;
    failures = 0;
    successes.push(e);
    strengths[e.evidence!]++;
    const recalls = successes.filter(s => s.evidence !== "RECOGNITION");
    const successContexts = new Set(successes.map(s => s.storyVersionId).filter(Boolean));
    const elapsed = now - Date.parse(successes[0].occurredAt);
    const hasForm = successes.some(s => s.evidence === "FORM_RECALL" || s.evidence === "PRODUCTION");
    const recentReveals = ordered.filter(s => (s.kind === "MEANING_REVEALED" || s.outcome === "revealed")
      && Date.parse(s.occurredAt) <= now && now - Date.parse(s.occurredAt) <= policy.recentDays * DAY).length;
    const recentSuccesses = successes.filter(s => now - Date.parse(s.occurredAt) <= policy.recentDays * DAY).length;
    // Rebuild criteria after failures: recovery requires fresh successes, never exposures.
    let candidate: KnowledgeState = "RECOGNIZED";
    if (successes.length >= 2 && successContexts.size >= 2 && elapsed >= policy.familiarDays * DAY && recentReveals < recentSuccesses) candidate = "FAMILIAR";
    const recallSpacing = recalls.length >= 2 && Date.parse(recalls.at(-1)!.occurredAt) - Date.parse(recalls[0].occurredAt) >= policy.learnedDays * DAY;
    if (candidate === "FAMILIAR" && recallSpacing && (!productive || hasForm)) candidate = "LEARNED";
    const previousRetrieval = recalls.at(-2);
    if (candidate === "LEARNED" && e.evidence !== "RECOGNITION" && previousRetrieval
      && now - Date.parse(previousRetrieval.occurredAt) >= policy.knownGapDays * DAY
      && (!failureAt || now - Date.parse(failureAt) >= policy.learnedDays * DAY)) candidate = "KNOWN";
    const rank = state === "UNSEEN" ? 0 : KNOWLEDGE_STATES.indexOf(state);
    // Recover at most one step per successful independent attempt after a demotion.
    if (KNOWLEDGE_STATES.indexOf(candidate) > rank) state = KNOWLEDGE_STATES[rank + 1];
  }
  const retrievals = successes.filter(s => s.evidence !== "RECOGNITION");
  return Object.freeze({ learnerId, targetKey, computedState: state, declaredState, encounterCount, contextDiversity: contexts.size,
    successfulRetrievalCount: retrievals.length, lapseCount, recognitionStrength: strengths.RECOGNITION,
    meaningRecallStrength: strengths.MEANING_RECALL, formRecallStrength: strengths.FORM_RECALL, productionStrength: strengths.PRODUCTION,
    lastEncounterAt: encounterAt, lastSuccessfulRetrievalAt: retrievals.at(-1)?.occurredAt ?? null,
    lastFailureAt: failureAt, lastMeaningRevealAt: revealAt, nextReviewAt: scheduleReview(state, declaredState, ordered),
    projectionAlgorithmVersion: "KNOWLEDGE_PROJECTION_V1", eventCutoff: ordered.at(-1)?.eventId ?? null, calculatedAt });
}
