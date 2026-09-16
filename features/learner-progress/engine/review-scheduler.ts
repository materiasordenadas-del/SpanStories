import type { KnowledgeEvent, KnowledgeState } from "../domain/knowledge.ts";
export const DAY = 86_400_000;
export type ReviewPolicy = Readonly<Record<KnowledgeState, number> & { retryDays: number }>;
export const REVIEW_POLICY_V1: ReviewPolicy = Object.freeze({ NEW: 1, RECOGNIZED: 3, FAMILIAR: 7, LEARNED: 21, KNOWN: 90, retryDays: 1 });

/** Scheduling policy is independent of the meaning of the knowledge states. */
export function scheduleReview(state: KnowledgeState | "UNSEEN", declaration: KnowledgeState | null, events: readonly KnowledgeEvent[], policy = REVIEW_POLICY_V1): string | null {
  if (state === "UNSEEN") return null;
  const relevant = events.filter(e => e.kind === "SAVED" || e.kind === "STATE_DECLARED" || e.kind === "MEANING_REVEALED"
    || (e.kind === "PRACTICE" && e.outcome !== "skipped"));
  const last = relevant.at(-1) ?? events.at(-1);
  if (!last) return null;
  const needsHelp = last.kind === "MEANING_REVEALED" || last.outcome === "incorrect" || last.outcome === "revealed" || last.assisted === true;
  // Respect a known self-report until there is subsequent evidence of difficulty.
  if (!needsHelp && (state === "KNOWN" || declaration === "KNOWN")) return null;
  const days = needsHelp ? policy.retryDays : policy[state];
  return new Date(Date.parse(last.occurredAt) + days * DAY).toISOString();
}
