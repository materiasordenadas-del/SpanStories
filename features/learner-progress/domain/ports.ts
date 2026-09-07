/**
 * Ports the domain needs but must not construct for itself.
 *
 * Same rationale as `features/story-engine/domain/ports.ts`: a service that
 * calls `Date.now()`/`crypto.randomUUID()` directly cannot be replayed
 * deterministically, and `../__tests__/` needs exact equality — not
 * "everything except a timestamp" — for its rebuildability tests.
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(kind: string): string;
}
