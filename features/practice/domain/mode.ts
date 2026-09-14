import { savedConjugationVerbs } from "./conjugation.ts";
import { buildFlashcardDeck } from "./flashcard.ts";
import type { PracticeItem } from "./item.ts";
import type { PracticeOccurrence } from "./occurrence.ts";

/**
 * Registry of practice modes. A new mode is one entry here plus its route
 * under `/progreso/practica/<slug>`; the practice hub lists whatever is
 * registered and needs no change.
 */
export const PRACTICE_MODE_IDS = ["flashcards", "conjugacion"] as const;
export type PracticeModeId = (typeof PRACTICE_MODE_IDS)[number];

export type PracticeMode = {
  readonly id: PracticeModeId;
  /** Route segment under the practice hub. */
  readonly slug: string;
  /**
   * How many saved items this mode can practise with the content published today.
   * Conjugation also works without saved words (the A1 verb list); this counts the saved verbs.
   */
  readonly countAvailable: (items: readonly PracticeItem[], occurrences: readonly PracticeOccurrence[]) => number;
};

export const PRACTICE_MODES: readonly PracticeMode[] = [
  {
    id: "flashcards",
    slug: "flashcards",
    countAvailable: (items, occurrences) => buildFlashcardDeck(items, occurrences).length,
  },
  {
    id: "conjugacion",
    slug: "verbos",
    countAvailable: (items, occurrences) => savedConjugationVerbs(items, occurrences).length,
  },
];

export function getPracticeMode(id: PracticeModeId): PracticeMode {
  const mode = PRACTICE_MODES.find((candidate) => candidate.id === id);
  if (mode === undefined) throw new Error(`UNKNOWN_PRACTICE_MODE: ${id}`);
  return mode;
}
