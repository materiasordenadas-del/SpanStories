import type { StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import { practiceTargetKey, type PracticeTarget, type PracticeTargetKey } from "./target.ts";

/** Where the learner saved the word. Provenance for context — never part of the identity. */
export type PracticeItemOrigin = {
  readonly storyVersionId: StoryVersionId;
  readonly occurrenceId: StoryOccurrenceId;
};

/**
 * The unit a learner saves: one per PracticeTarget.
 *
 * `PracticeItem != Flashcard`: an item is what was saved; a flashcard is one
 * derived way to practise it. `saving != knowing`: an item records the
 * learner's intent to review a word, not mastery of it.
 */
export type PracticeItem = {
  readonly target: PracticeTarget;
  /** ISO 8601 instant of the first save. */
  readonly savedAt: string;
  readonly savedFrom: PracticeItemOrigin | null;
};

export function createPracticeItem(input: {
  readonly target: PracticeTarget;
  readonly savedAt: Date;
  readonly savedFrom?: PracticeItemOrigin | null;
}): PracticeItem {
  return { target: input.target, savedAt: input.savedAt.toISOString(), savedFrom: input.savedFrom ?? null };
}

export function practiceItemKey(item: PracticeItem): PracticeTargetKey {
  return practiceTargetKey(item.target);
}
