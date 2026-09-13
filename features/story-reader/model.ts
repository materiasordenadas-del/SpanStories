import type {
  Story,
  StoryOccurrence,
  StorySentence,
  StoryTargetBinding,
  StoryVersion,
  TextAnchor,
} from "../story-engine/index.ts";
import type { LexiconReleaseId } from "../lexical-engine/index.ts";
import type { WordPanelViewModel } from "./word-panel.ts";

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

export type StoryReaderScene = {
  readonly number: number;
  readonly sentenceIndexes: readonly number[];
  readonly rosterSentenceIndex: number | null;
};

export type StoryReaderLexicalEntry = {
  readonly occurrenceId: string;
  readonly surface: string;
  readonly context: string;
  readonly lemma: string;
  readonly senseItem: string | null;
  readonly lexicalCategory: string | null;
  readonly panel: WordPanelViewModel;
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
  readonly sentences: readonly StoryReaderSentence[];
  readonly scenes: readonly StoryReaderScene[];
  readonly lexicalEntries: Readonly<Record<string, StoryReaderLexicalEntry>>;
  readonly surfaceEntries: Readonly<Record<string, StoryReaderSurfaceEntry>>;
  /** Present when the published story has canonical lexical occurrences to record. */
  readonly eventContext?: StoryReaderEventContext;
};
