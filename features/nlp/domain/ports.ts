/**
 * Ports the domain needs but must not construct for itself — same rationale
 * as `features/story-engine/domain/ports.ts` and
 * `features/learner-progress/domain/ports.ts`: candidate generation must be
 * deterministic given the same analysis (§39 — "same input -> same logical
 * candidates"), so nothing here calls `Date.now()`/`crypto.randomUUID()` directly.
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(kind: string): string;
}
