/**
 * Default, non-deterministic `Clock`/`IdGenerator` implementations.
 *
 * Node-side only; nothing here imports `window`/`localStorage`/React. Tests
 * must not use these — inject a deterministic double instead (see
 * `__tests__/fixtures.ts`) so publish/reannotate output can be asserted for
 * full equality, not "everything except a timestamp."
 */

import type { Clock, IdGenerator } from "../domain/ports.ts";
import { ID_PREFIXES, type StoryEngineIdKind } from "../domain/ids.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(kind: string): string {
    const prefix = ID_PREFIXES[kind as StoryEngineIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    return `${prefix}${crypto.randomUUID()}`;
  }
}
