/**
 * Default, non-deterministic `Clock`/`IdGenerator` implementations.
 *
 * Node-side only. Tests must not use these — inject a deterministic double
 * instead (see `__tests__/fixtures.ts`) so two builds of the same
 * `NlpAnalysis` can be asserted equal, not "everything except an id."
 */

import type { Clock, IdGenerator } from "../domain/ports.ts";
import { ID_PREFIXES, type NlpIdKind } from "../domain/ids.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(kind: string): string {
    const prefix = ID_PREFIXES[kind as NlpIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    return `${prefix}${crypto.randomUUID()}`;
  }
}
