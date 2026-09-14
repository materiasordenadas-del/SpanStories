import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import type { StoryOccurrence, StoryOccurrenceId, StoryVersionId, SurfaceToken, SurfaceTokenId } from "../../story-engine/index.ts";

/**
 * What a saved word points at: its published lexical identity, or — when
 * there is none yet — the exact selection that saved it.
 *
 *   Sense RESOLVED                          → SENSE  (SenseId)
 *   Sense not resolved + known Lexeme       → LEXEME (LexemeId)
 *   no Lexeme (SurfaceToken, construction)  → UNRESOLVED_SURFACE
 *
 * `surface != identity` and `lemma != identity`: «soy» and «es» are one target
 * when they share a Sense, two Senses of one Lexeme are two targets, and two
 * Lexemes that share a form are two targets. A Sense is never inferred to fill
 * in an occurrence the story left unresolved.
 *
 * UNRESOLVED_SURFACE is never keyed by its `surface`: two different
 * selections that happen to read the same text stay two separate targets —
 * the identity is `storyVersionId` + `anchorId` (the occurrence or
 * SurfaceToken selected), and `surface`/`normalizedSurface` are carried only
 * for display. Saving a word with no Lexeme is never the same as minting one
 * from its text. If the selection is later resolved to a canonical Lexeme,
 * the saved item still keeps this original target until something migrates it
 * to SENSE/LEXEME explicitly — it is never silently reinterpreted by text.
 */
export type PracticeTarget =
  | { readonly type: "SENSE"; readonly senseId: SenseId; readonly lexemeId: LexemeId }
  | { readonly type: "LEXEME"; readonly lexemeId: LexemeId }
  | {
      readonly type: "UNRESOLVED_SURFACE";
      readonly storyVersionId: StoryVersionId;
      readonly anchorId: StoryOccurrenceId | SurfaceTokenId;
      readonly surface: string;
      readonly normalizedSurface: string;
    };

/** Stable key of a target. Built only from the id(s) that identify it. */
export type PracticeTargetKey = `SENSE:${string}` | `LEXEME:${string}` | `SURFACE:${string}:${string}`;

export function practiceTargetKey(target: PracticeTarget): PracticeTargetKey {
  if (target.type === "SENSE") return `SENSE:${target.senseId}`;
  if (target.type === "LEXEME") return `LEXEME:${target.lexemeId}`;
  return `SURFACE:${target.storyVersionId}:${target.anchorId}`;
}

const normalizeSurface = (text: string) =>
  text.trim().toLocaleLowerCase("es").replace(/\s+/g, " ").normalize("NFD").replace(/\p{M}/gu, "");

function unresolvedSurfaceTarget(storyVersionId: StoryVersionId, anchorId: StoryOccurrenceId | SurfaceTokenId, surface: string): PracticeTarget {
  return { type: "UNRESOLVED_SURFACE", storyVersionId, anchorId, surface, normalizedSurface: normalizeSurface(surface) };
}

/**
 * The practice target of something a learner selected in a story.
 *
 * Every selectable word can be saved now, published Lexeme or not: a real
 * Lexeme/Sense yields SENSE or LEXEME as before, and a construction
 * occurrence or a bare SurfaceToken yields UNRESOLVED_SURFACE instead of null.
 *
 * `storyVersionId` only matters for a bare SurfaceToken, which carries no
 * `storyVersionId` of its own — an occurrence (LEXICAL or CONSTRUCTION)
 * already carries one, so the argument is ignored for it. Returns null only
 * when there is nothing to select, or a bare SurfaceToken with no
 * `storyVersionId` to anchor it to.
 */
export function practiceTargetOf(
  word: StoryOccurrence | Pick<SurfaceToken, "id" | "surface"> | undefined,
  storyVersionId?: StoryVersionId,
): PracticeTarget | null {
  if (word === undefined) return null;
  if ("kind" in word) {
    if (word.kind === "LEXICAL") {
      if (word.senseResolutionStatus === "RESOLVED" && word.senseId !== null) {
        return { type: "SENSE", senseId: word.senseId, lexemeId: word.lexemeId };
      }
      return { type: "LEXEME", lexemeId: word.lexemeId };
    }
    return unresolvedSurfaceTarget(word.storyVersionId, word.id, word.surface);
  }
  if (storyVersionId === undefined) return null;
  return unresolvedSurfaceTarget(storyVersionId, word.id, word.surface);
}
