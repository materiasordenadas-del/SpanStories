/**
 * Query API over the generated image-reference registry.
 *
 * The one operation that matters at read time: given a Sense id, hand back
 * the best remote image reference that is currently servable, walking the
 * rank chain past anything a curator marked as not-servable. A Sense with no
 * binding, or a binding with nothing servable, resolves to `null` — never an
 * error, because most Senses (grammar words, functional MWUs) have no image
 * and that is expected, not a data problem.
 */

import type { SenseImageBinding, SenseImageCandidate } from "../domain/sense-image-binding.ts";

/** Tried in this order: every `APPROVED` candidate outranks every `FALLBACK` one. */
const RESOLUTION_ORDER = ["APPROVED", "FALLBACK"] as const;

export class ImageRegistry {
  private readonly bindings: ReadonlyMap<string, SenseImageBinding>;

  constructor(bindings: readonly SenseImageBinding[]) {
    this.bindings = new Map(bindings.map((binding) => [binding.senseId, binding]));
  }

  getBinding(senseId: string): SenseImageBinding | null {
    return this.bindings.get(senseId) ?? null;
  }

  /**
   * The lowest-rank `APPROVED` candidate; if there is none, the lowest-rank
   * `FALLBACK` candidate; if there is neither, `null`. `APPROVED` always wins
   * over `FALLBACK` regardless of rank — rank only breaks ties within a
   * status, it never lets a `FALLBACK` pre-empt an `APPROVED` at a higher
   * rank number.
   */
  resolveImageForSense(senseId: string): SenseImageCandidate | null {
    const binding = this.bindings.get(senseId);
    if (binding === undefined) return null;

    for (const status of RESOLUTION_ORDER) {
      const inStatus = binding.candidates
        .filter((candidate) => candidate.status === status)
        .sort((a, b) => a.rank - b.rank);
      if (inStatus.length > 0) return inStatus[0] ?? null;
    }
    return null;
  }
}

export function createImageRegistry(bindings: readonly SenseImageBinding[]): ImageRegistry {
  return new ImageRegistry(bindings);
}
