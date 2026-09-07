/**
 * Default, non-deterministic `Clock`/`IdGenerator`. Node-side only; nothing
 * here imports `window`/`localStorage`/React. Tests inject a deterministic
 * double instead — see `__tests__/fixtures.ts`.
 */

import type { Clock, IdGenerator } from "../domain/ports.ts";
import { ID_PREFIXES, type LearnerProgressIdKind } from "../domain/ids.ts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(kind: string): string {
    const prefix = ID_PREFIXES[kind as LearnerProgressIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    return `${prefix}${crypto.randomUUID()}`;
  }
}
