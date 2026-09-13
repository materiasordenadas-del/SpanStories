import type {
  Story,
  StoryOccurrence,
  StorySentence,
  StoryTargetBinding,
  StoryVersion,
  TextAnchor,
} from "../story-engine/index.ts";
import type { LexiconReleaseId } from "../lexical-engine/index.ts";
import type { WordPanelExample, WordPanelViewModel } from "./word-panel.ts";

export type StoryReaderTextSegment =
  | { readonly kind: "TEXT"; readonly text: string }
  | {
      readonly kind: "LEXICAL";
      readonly text: string;
      readonly occurrenceId: string;
    }
  | {
      readonly kind: "SURFACE";
      readonly text: string;
      readonly tokenId: string;
    };

export type StoryReaderSentence = {
  readonly id: string;
  readonly text: string;
  readonly presentation: "PARAGRAPH" | "ROSTER";
  readonly segments: readonly StoryReaderTextSegment[];
};

export type StoryReaderSceneIllustration = {
  readonly src: string;
  readonly alt: string;
};

export type StoryReaderScene = {
  readonly number: number;
  readonly sentenceIndexes: readonly number[];
  readonly rosterSentenceIndex: number | null;
  readonly illustration: StoryReaderSceneIllustration;
};

/**
 * Editorial reference content a story authors for one StoryOccurrence. It is
 * not a published lexical source: the panel's published fields stay untouched
 * and the reader shows this in their place.
 */
export type StoryReaderWordReference = {
  readonly translation: string;
  readonly partOfSpeechLabel: string;
  readonly imageCaption: string;
  readonly shortUsage: string;
  readonly examples: readonly WordPanelExample[];
  readonly usageNotes: readonly string[];
  readonly otherStories: readonly { readonly word: string; readonly rest: string; readonly meta: string }[];
  readonly frequency: string;
  readonly relatedWords: readonly string[];
};

export type StoryReaderLexicalEntry = {
  readonly occurrenceId: string;
  readonly surface: string;
  readonly context: string;
  readonly lemma: string;
  readonly senseItem: string | null;
  readonly lexicalCategory: string | null;
  readonly panel: WordPanelViewModel;
  /** Bound to this entry's occurrenceId, never to its surface text. */
  readonly reference?: StoryReaderWordReference;
};

export type StoryReaderSurfaceEntry = {
  readonly tokenId: string;
  readonly surface: string;
  readonly context: string;
  readonly panel: WordPanelViewModel;
};

export type StoryReaderEventContext = {
  readonly story: Story;
  readonly version: StoryVersion;
  readonly sentences: readonly StorySentence[];
  readonly anchors: readonly TextAnchor[];
  readonly occurrences: readonly StoryOccurrence[];
  readonly targetBindings: readonly StoryTargetBinding[];
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: LexiconReleaseId;
};

export type StoryReaderViewModel = {
  readonly storyBlueprintId: string;
  readonly storyId: string;
  readonly storyVersionId: string;
  readonly title: string;
  /** One-line synopsis shown under the title in illustrated mode. */
  readonly summary?: string;
  readonly sentences: readonly StoryReaderSentence[];
  readonly scenes: readonly StoryReaderScene[];
  readonly lexicalEntries: Readonly<Record<string, StoryReaderLexicalEntry>>;
  readonly surfaceEntries: Readonly<Record<string, StoryReaderSurfaceEntry>>;
  /** Present when the published story has canonical lexical occurrences to record. */
  readonly eventContext?: StoryReaderEventContext;
};
