/**
 * A learner's own, self-reported familiarity with a Lexeme.
 *
 * `NEW` / `LEARNING` / `KNOWN` are `USER_DECLARED_STATE`, never
 * `COMPUTED_MASTERY`: nothing in this feature derives one of these three
 * values from exposure count, recognition accuracy or any other evidence.
 * The learner sets it; the projection only ever reports back the latest
 * value they set. See `../engine/declared-state-projection.ts`.
 */
export const DECLARED_STATES = ["NEW", "LEARNING", "KNOWN"] as const;
export type DeclaredState = (typeof DECLARED_STATES)[number];
