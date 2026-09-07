/**
 * Learner Event / Progress Engine identity.
 *
 * Technical ids, not published curriculum ids — same convention as
 * `features/story-engine/domain/ids.ts`. `LearnerId` is deliberately the only
 * "user" concept this feature knows about: an opaque identifier, never a
 * login, password or profile. Auth is out of scope for every engine phase
 * (see `docs/architecture/plan-implementacion-motor-v1.0.md` §14 "No
 * introducir auth completo").
 */

declare const brand: unique symbol;
type Branded<TName extends string> = string & { readonly [brand]: TName };

export type LearnerEventId = Branded<"LearnerEventId">;
export type LearnerId = Branded<"LearnerId">;

export type LearnerProgressIdKind = "LearnerEventId" | "LearnerId";

export const ID_PREFIXES: Readonly<Record<LearnerProgressIdKind, string>> = {
  LearnerEventId: "levt-",
  LearnerId: "learner-",
};

const SLUG_TAIL = /^[a-z0-9][a-z0-9-]*$/;

export function matchesIdPattern(kind: LearnerProgressIdKind, value: string): boolean {
  const prefix = ID_PREFIXES[kind];
  if (!value.startsWith(prefix)) return false;
  return SLUG_TAIL.test(value.slice(prefix.length));
}

export function asId<TKind extends LearnerProgressIdKind>(
  kind: TKind,
  value: string,
): Branded<TKind> {
  if (!matchesIdPattern(kind, value)) {
    throw new Error(
      `LEARNER_PROGRESS_ID_PATTERN_INVALID: ${JSON.stringify(value)} is not a valid ${kind} (expected prefix ${JSON.stringify(ID_PREFIXES[kind])})`,
    );
  }
  return value as Branded<TKind>;
}
