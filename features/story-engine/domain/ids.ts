/**
 * Story Engine identity.
 *
 * These are *technical* ids, not published curriculum ids. A `Story` refers to
 * a `StoryBlueprintId` (see `features/curriculum`) but does not reuse its
 * namespace: `StoryBlueprintId == StoryId` is never assumed (see
 * `docs/story-engine-implementation.md` §"Story vs StoryBlueprint").
 *
 * Every kind below carries a fixed lowercase prefix so a technical id can never
 * collide with a curriculum id (`LEX-A1-*`, `A1-M01-I05-S1`, `SEQ-A1-*`, ...),
 * which are uppercase and never share these prefixes. Ids are opaque: nothing
 * here derives an id from a title, a surface string or story content — see
 * `IdGenerator` in `./ports.ts`.
 */

declare const brand: unique symbol;
type Branded<TName extends string> = string & { readonly [brand]: TName };

export type StoryId = Branded<"StoryId">;
export type StoryVersionId = Branded<"StoryVersionId">;
export type SentenceId = Branded<"SentenceId">;
export type SurfaceTokenId = Branded<"SurfaceTokenId">;
export type TextAnchorId = Branded<"TextAnchorId">;
export type StoryOccurrenceId = Branded<"StoryOccurrenceId">;
export type OccurrencePartId = Branded<"OccurrencePartId">;
export type OccurrenceAnnotationRevisionId = Branded<"OccurrenceAnnotationRevisionId">;
export type StoryTargetBindingId = Branded<"StoryTargetBindingId">;

export type StoryEngineIdKind =
  | "StoryId"
  | "StoryVersionId"
  | "SentenceId"
  | "SurfaceTokenId"
  | "TextAnchorId"
  | "StoryOccurrenceId"
  | "OccurrencePartId"
  | "OccurrenceAnnotationRevisionId"
  | "StoryTargetBindingId";

/** Fixed lowercase prefix per id kind. See module doc for why this matters. */
export const ID_PREFIXES: Readonly<Record<StoryEngineIdKind, string>> = {
  StoryId: "story-",
  StoryVersionId: "storyver-",
  SentenceId: "sent-",
  SurfaceTokenId: "tok-",
  TextAnchorId: "anchor-",
  StoryOccurrenceId: "occ-",
  OccurrencePartId: "part-",
  OccurrenceAnnotationRevisionId: "rev-",
  StoryTargetBindingId: "bind-",
};

const SLUG_TAIL = /^[a-z0-9][a-z0-9-]*$/;

export function matchesIdPattern(kind: StoryEngineIdKind, value: string): boolean {
  const prefix = ID_PREFIXES[kind];
  if (!value.startsWith(prefix)) return false;
  return SLUG_TAIL.test(value.slice(prefix.length));
}

/** Narrow a raw technical id string to its branded kind without altering it. */
export function asId<TKind extends StoryEngineIdKind>(
  kind: TKind,
  value: string,
): Branded<TKind> {
  if (!matchesIdPattern(kind, value)) {
    throw new Error(
      `STORY_ENGINE_ID_PATTERN_INVALID: ${JSON.stringify(value)} is not a valid ${kind} (expected prefix ${JSON.stringify(ID_PREFIXES[kind])})`,
    );
  }
  return value as Branded<TKind>;
}
