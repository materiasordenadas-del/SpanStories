import { buildFlashcard } from "./flashcard.ts";
import type { PracticeImage, PracticeOccurrence } from "./occurrence.ts";
import type { PersonalPracticeItem, PersonalPracticeItemId } from "./personal-item.ts";

/**
 * A flashcard derived from a PersonalPracticeItem. Kept separate from
 * `Flashcard`/`buildFlashcardDeck` on purpose: a personal item never carries
 * a StoryOccurrence, so its card must never be attributed to one, even when
 * the item happens to resolve to a Sense that a Story also uses (the
 * translation text is reused for display; the provenance is not).
 */
export type PersonalFlashcard = {
  readonly key: string;
  readonly itemId: PersonalPracticeItemId;
  readonly prompt: string;
  readonly answer: string;
  readonly details: readonly string[];
  readonly context?: PracticeOccurrence["context"];
  readonly image?: PracticeImage;
};

export const PERSONAL_FLASHCARD_KEY_PREFIX = "PERSONAL:";

/**
 * A resolved item borrows its translation from any published occurrence of
 * the same Sense (never one flagged as this item's own — it has none). An
 * ambiguous or unresolved item still gets a card: the learner practises
 * recognizing/writing what they typed, with no translation available.
 */
export function buildPersonalFlashcard(item: PersonalPracticeItem, occurrences: readonly PracticeOccurrence[]): PersonalFlashcard {
  const key = `${PERSONAL_FLASHCARD_KEY_PREFIX}${item.id}`;
  if (item.resolutionStatus === "RESOLVED" && item.senseId !== null && item.lexemeId !== null) {
    const borrowed = buildFlashcard(
      { target: { type: "SENSE", senseId: item.senseId, lexemeId: item.lexemeId }, savedAt: item.createdAt, savedFrom: null },
      occurrences,
    );
    if (borrowed !== null) return { ...borrowed, key, itemId: item.id };
  }
  return { key, itemId: item.id, prompt: item.surface, answer: item.surface, details: ["Nota personal"] };
}

export function buildPersonalFlashcardDeck(items: readonly PersonalPracticeItem[], occurrences: readonly PracticeOccurrence[]): readonly PersonalFlashcard[] {
  return items.map((item) => buildPersonalFlashcard(item, occurrences));
}
