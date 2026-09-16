import type { StoryOccurrenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { WordPanelTextPart } from "../../story-reader/word-panel.ts";
import type { PracticeItemOrigin } from "./item.ts";
import type { PracticeTarget } from "./target.ts";

export type PracticeImage = { readonly src: string; readonly alt: string };

/**
 * One published lexical occurrence, as Practice reads it from the story reader.
 *
 * Every value comes from the Lexical Engine, the Story Engine or the reader's
 * editorial references. Optional fields are omitted — never filled with a
 * guess — when nothing publishes them.
 */
export type PracticeOccurrence = {
  readonly target: PracticeTarget;
  readonly storyVersionId: StoryVersionId;
  readonly occurrenceId: StoryOccurrenceId;
  /** `Lexeme.lemma`: the form the learner writes. Display only, never identity. */
  readonly lemma: string;
  readonly translation?: string;
  readonly partOfSpeechLabel?: string;
  readonly cefrLevel?: string;
  /** Current curricular expectation, supplied by the server content adapter. */
  readonly productive?: boolean;
  /** The story sentence, with the occurrence highlighted by code point range. */
  readonly context: { readonly text: string; readonly parts: readonly WordPanelTextPart[] };
  /** Reserved for a per-word image. No source publishes one yet: story scene illustrations are not word images. */
  readonly image?: PracticeImage;
};

/** A word selected in the reader that can be saved, with where it was selected. */
export type ReaderWordPractice = {
  readonly target: PracticeTarget;
  readonly savedFrom: PracticeItemOrigin;
};
