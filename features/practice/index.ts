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

export type {
  ConjugationCheck,
  ConjugationFormPart,
  ConjugationPair,
  ConjugationPerson,
  ConjugationPersonInfo,
  ConjugationQuestion,
  ConjugationSettings,
  ConjugationTableRow,
  ConjugationVerb,
  VerbCategory,
  VerbGroup,
} from "./domain/conjugation.ts";
export {
  A1_VERBS,
  CONJUGATION_PERSONS,
  CONJUGATION_PERSON_IDS,
  VERB_GROUPS,
  buildConjugationPool,
  buildConjugationQuestion,
  checkConjugationAnswer,
  conjugationPersonLabel,
  conjugationTable,
  findConjugationVerb,
  hasConjugationSentence,
  isVerbTypeOn,
  savedConjugationVerbs,
  sentenceWithAnswer,
  withoutMarks,
} from "./domain/conjugation.ts";

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

export type { ConjugationAttempt, ConjugationOutcome, ConjugationSession, ConjugationSessionSummary } from "./engine/conjugation-session.ts";
export {
  currentConjugationAttempt,
  currentConjugationQuestion,
  nextConjugationQuestion,
  revealConjugationAnswer,
  startConjugationSession,
  submitConjugationAnswer,
  summarizeConjugationSession,
} from "./engine/conjugation-session.ts";

export type { PracticeItemRepository } from "./repository/practice-item-repository.ts";
export { InMemoryPracticeItemRepository } from "./repository/in-memory-practice-item-repository.ts";
export type { StorageLike } from "./repository/local-storage-practice-item-repository.ts";
export { LocalStoragePracticeItemRepository, PRACTICE_STORAGE_KEY } from "./repository/local-storage-practice-item-repository.ts";
export { FirestorePracticeItemRepository } from "./repository/firestore-practice-item-repository.ts";

/**
 * PersonalPracticeItem: vocabulary typed by hand in the learner's notes, not
 * seen in any Story. Distinct identity and repository from PracticeItem
 * (see `domain/personal-item.ts`) — merged into Flashcards, kept out of
 * StoryOccurrence/curriculum entirely.
 */
export type {
  PersonalPracticeAddedBy,
  PersonalPracticeItem,
  PersonalPracticeItemId,
  PersonalPracticeItemType,
  PersonalPracticeResolutionStatus,
  PersonalPracticeSource,
} from "./domain/personal-item.ts";
export { createPersonalPracticeItem, normalizeSpaces, withResolution, withUpdatedSurface } from "./domain/personal-item.ts";

export type { PersonalPracticeSyncResult } from "./engine/personal-practice-notes.ts";
export { syncPersonalPracticeNotes } from "./engine/personal-practice-notes.ts";

export type { PersonalFlashcard } from "./domain/personal-flashcard.ts";
export { PERSONAL_FLASHCARD_KEY_PREFIX, buildPersonalFlashcard, buildPersonalFlashcardDeck } from "./domain/personal-flashcard.ts";

export type { PersonalPracticeItemRepository } from "./repository/personal-practice-item-repository.ts";
export { InMemoryPersonalPracticeItemRepository } from "./repository/in-memory-personal-practice-item-repository.ts";
export { LocalStoragePersonalPracticeItemRepository, PERSONAL_PRACTICE_STORAGE_KEY } from "./repository/local-storage-personal-practice-item-repository.ts";
export { personalPracticeStorageKey } from "./repository/personal-practice-storage-key.ts";
export { FirestorePersonalPracticeItemRepository } from "./repository/firestore-personal-practice-item-repository.ts";
