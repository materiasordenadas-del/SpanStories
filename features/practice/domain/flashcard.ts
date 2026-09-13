import { practiceItemKey, type PracticeItem } from "./item.ts";
import type { PracticeImage, PracticeOccurrence } from "./occurrence.ts";
import { practiceTargetKey, type PracticeTargetKey } from "./target.ts";

/**
 * A written-recall card derived from a PracticeItem: the learner sees the
 * translation and writes the Spanish word. It is recomputed from published
 * content every time and never stored.
 */
export type Flashcard = {
  readonly key: PracticeTargetKey;
  /** Published translation shown as the prompt. */
  readonly prompt: string;
  /** Spanish form the learner must write (the lemma). */
  readonly answer: string;
  /** Short grammatical labels, e.g. part of speech and level. */
  readonly details: readonly string[];
  readonly context?: PracticeOccurrence["context"];
  readonly image?: PracticeImage;
};

/**
 * Builds the flashcard of a saved item, or null when published content is not
 * enough for a valid card. The item stays saved either way.
 *
 * Only a resolved Sense guarantees that all its occurrences mean the same, so
 * a SENSE item may take its translation from any occurrence of that Sense. A
 * LEXEME item keeps to the occurrence it was saved from: another occurrence of
 * the Lexeme may be a different, unresolved meaning.
 */
export function buildFlashcard(item: PracticeItem, occurrences: readonly PracticeOccurrence[]): Flashcard | null {
  const key = practiceItemKey(item);
  const candidates = occurrences.filter((occurrence) => practiceTargetKey(occurrence.target) === key);
  const origin = item.savedFrom === null
    ? undefined
    : candidates.find((occurrence) => occurrence.occurrenceId === item.savedFrom?.occurrenceId && occurrence.storyVersionId === item.savedFrom.storyVersionId);
  const pool = item.target.type === "SENSE" ? candidates : origin === undefined ? [] : [origin];
  const main = origin ?? pool[0];
  if (main === undefined) return null;

  const translated = [main, ...pool].find((occurrence) => (occurrence.translation?.trim() ?? "") !== "");
  const prompt = translated?.translation?.trim();
  const answer = main.lemma.trim();
  if (translated === undefined || prompt === undefined || answer === "") return null;

  const details = [main.partOfSpeechLabel ?? translated.partOfSpeechLabel, main.cefrLevel ?? translated.cefrLevel]
    .filter((detail): detail is string => detail !== undefined);
  const image = main.image ?? translated.image;
  return { key, prompt, answer, details, context: main.context, ...(image === undefined ? {} : { image }) };
}

/** Flashcards for every eligible item, in the order the items were saved. */
export function buildFlashcardDeck(items: readonly PracticeItem[], occurrences: readonly PracticeOccurrence[]): readonly Flashcard[] {
  return items.flatMap((item) => buildFlashcard(item, occurrences) ?? []);
}

export type PracticeSummary = {
  /** Every saved item, eligible or not. */
  readonly savedCount: number;
  /** Saved items that published content can turn into a flashcard today. */
  readonly flashcardEligibleCount: number;
};

export function summarizePractice(items: readonly PracticeItem[], occurrences: readonly PracticeOccurrence[]): PracticeSummary {
  return { savedCount: items.length, flashcardEligibleCount: buildFlashcardDeck(items, occurrences).length };
}
