/**
 * Public contract of Practice: saved words and the ways to practise them.
 *
 * UI and adapters import from here. Everything exported is browser-safe; the
 * content Practice reads is collected from published reader view models by
 * the caller (see `lib/adapters/practice-library.ts`).
 *
 *   PracticeTarget  canonical identity of a saved word (SenseId or LexemeId)
 *   PracticeItem    the saved unit, one per target
 *   PracticeMode    a registered way to practise saved items
 *   Flashcard       a card derived from an item; never stored
 *
 * `PracticeItem != Flashcard`, `practice != mastery`, `saving != knowing`.
 * Scheduling (SRS), scores and mastery are deliberately out of scope.
 */

export type { PracticeTarget, PracticeTargetKey } from "./domain/target.ts";
export { practiceTargetKey, practiceTargetOf } from "./domain/target.ts";

export type { PracticeItem, PracticeItemOrigin } from "./domain/item.ts";
export { createPracticeItem, practiceItemKey } from "./domain/item.ts";

export type { PracticeImage, PracticeOccurrence, ReaderWordPractice } from "./domain/occurrence.ts";

export type { Flashcard, PracticeSummary } from "./domain/flashcard.ts";
export { buildFlashcard, buildFlashcardDeck, summarizePractice } from "./domain/flashcard.ts";

export type { PracticeMode, PracticeModeId } from "./domain/mode.ts";
export { PRACTICE_MODE_IDS, PRACTICE_MODES, getPracticeMode } from "./domain/mode.ts";

export { collectPracticeOccurrences, readerWordPractice } from "./engine/reader.ts";

export type { FlashcardAttempt, FlashcardOutcome, FlashcardSession, FlashcardSessionSummary } from "./engine/flashcard-session.ts";
export {
  checkFlashcardAnswer,
  currentFlashcard,
  currentFlashcardAttempt,
  nextFlashcard,
  revealFlashcardAnswer,
  startFlashcardSession,
  submitFlashcardAnswer,
  summarizeFlashcardSession,
} from "./engine/flashcard-session.ts";

export type { PracticeItemRepository } from "./repository/practice-item-repository.ts";
export { InMemoryPracticeItemRepository } from "./repository/in-memory-practice-item-repository.ts";
export type { StorageLike } from "./repository/local-storage-practice-item-repository.ts";
export { LocalStoragePracticeItemRepository, PRACTICE_STORAGE_KEY } from "./repository/local-storage-practice-item-repository.ts";
