/**
 * NLP / Annotation Assistant identity (engine phase 6).
 *
 * Technical ids, not published curriculum ids — same convention as
 * `features/story-engine/domain/ids.ts` and
 * `features/learner-progress/domain/ids.ts`. An `AnnotationCandidateId`
 * never shares a namespace with a `StoryOccurrenceId`: a candidate is a
 * proposal, not yet a `StoryOccurrence`, and the id itself makes that
 * impossible to confuse.
 */

declare const brand: unique symbol;
type Branded<TName extends string> = string & { readonly [brand]: TName };

export type AnnotationCandidateId = Branded<"AnnotationCandidateId">;

export type NlpIdKind = "AnnotationCandidateId";

export const ID_PREFIXES: Readonly<Record<NlpIdKind, string>> = {
  AnnotationCandidateId: "nlpcand-",
};

const SLUG_TAIL = /^[a-z0-9][a-z0-9-]*$/;

export function matchesIdPattern(kind: NlpIdKind, value: string): boolean {
  const prefix = ID_PREFIXES[kind];
  if (!value.startsWith(prefix)) return false;
  return SLUG_TAIL.test(value.slice(prefix.length));
}

export function asId<TKind extends NlpIdKind>(kind: TKind, value: string): Branded<TKind> {
  if (!matchesIdPattern(kind, value)) {
    throw new Error(
      `NLP_ID_PATTERN_INVALID: ${JSON.stringify(value)} is not a valid ${kind} (expected prefix ${JSON.stringify(ID_PREFIXES[kind])})`,
    );
  }
  return value as Branded<TKind>;
}
