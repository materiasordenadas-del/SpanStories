import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import type { StoryOccurrence, SurfaceToken } from "../../story-engine/index.ts";

/**
 * What a saved word points at: its published lexical identity, never its text.
 *
 *   Sense RESOLVED                          → SENSE  (SenseId)
 *   Sense not resolved + known Lexeme       → LEXEME (LexemeId)
 *   no Lexeme (SurfaceToken, construction)  → no target: it cannot enter Practice yet
 *
 * `surface != identity` and `lemma != identity`: «soy» and «es» are one target
 * when they share a Sense, two Senses of one Lexeme are two targets, and two
 * Lexemes that share a form are two targets. A Sense is never inferred to fill
 * in an occurrence the story left unresolved.
 */
export type PracticeTarget =
  | { readonly type: "SENSE"; readonly senseId: SenseId; readonly lexemeId: LexemeId }
  | { readonly type: "LEXEME"; readonly lexemeId: LexemeId };

/** Stable key of a target. Built only from the id that identifies it. */
export type PracticeTargetKey = `SENSE:${string}` | `LEXEME:${string}`;

export function practiceTargetKey(target: PracticeTarget): PracticeTargetKey {
  return target.type === "SENSE" ? `SENSE:${target.senseId}` : `LEXEME:${target.lexemeId}`;
}

/** The practice target of something a learner selected in a story, or null when it has no Lexeme. */
export function practiceTargetOf(word: StoryOccurrence | SurfaceToken | undefined): PracticeTarget | null {
  // A SurfaceToken carries no `kind`: it is selectable text without a published Lexeme.
  if (word === undefined || !("kind" in word) || word.kind !== "LEXICAL") return null;
  if (word.senseResolutionStatus === "RESOLVED" && word.senseId !== null) {
    return { type: "SENSE", senseId: word.senseId, lexemeId: word.lexemeId };
  }
  return { type: "LEXEME", lexemeId: word.lexemeId };
}
