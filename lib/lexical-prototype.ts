/**
 * Prototype types for the vertical slice. NOT the canonical lexical contract.
 *
 * Status after engine phase 2: **partially superseded, deliberately kept**.
 *
 * The canonical contract now lives in `features/lexical-engine`. `Pronominality`
 * there is the authority — it adds `UNSPECIFIED`, which this file lacks and
 * which every published A1 lexeme currently holds, and it records the authority
 * behind a classification. `LexicalType` here (`SINGLE_WORD` / `MULTIWORD`) is
 * the same partition as the published `LexemeType` (`ATOMIC` / `MULTIWORD`)
 * under different names; the published names win. New code must import from
 * `features/lexical-engine`, never from this file.
 *
 * This file is not deleted, and no adapter was written, for one reason: the
 * story-shaped types below (`PrototypeStory`, `PrototypeStoryOccurrence`,
 * `PrototypeStorySentence`) have no canonical replacement yet. `StoryOccurrence`
 * and `TextAnchor` belong to the Story Engine in phase 3. Its hand-authored
 * fixture ids (`lex-ir`, `sense-ir-move`) are also not curriculum ids and cannot
 * be mapped onto `LEX-A1-*` without an editorial decision that no authority has
 * published. Removing this file now would break `components/story-reader.tsx`
 * and `content/a1/module-1/island-1/story-1.ts` and buy nothing.
 *
 * Retire it when the Story Engine publishes canonical occurrences.
 */

export type LearnerDeclaredState = "NEW" | "LEARNING" | "KNOWN";

export type LexicalType = "SINGLE_WORD" | "MULTIWORD";

export type Pronominality =
  | "NONE"
  | "OBLIGATORY"
  | "LEXICALIZED_ALTERNANT";

export type OccurrencePartRole = "HEAD" | "FIXED" | "CLITIC";

export type PrototypeLexeme = {
  id: string;
  canonicalForm: string;
  partOfSpeech: string;
  lexicalType: LexicalType;
  pronominality: Pronominality;
};

export type PrototypeSense = {
  id: string;
  lexemeId: string;
  glossEn: string;
  definitionEs: string;
};

export type PrototypeOccurrencePart = {
  id: string;
  text: string;
  role: OccurrencePartRole;
};

export type PrototypeStoryOccurrence = {
  id: string;
  storyId: string;
  sentenceId: string;
  lexemeId: string;
  senseId: string;
  surface: string;
  parts: readonly PrototypeOccurrencePart[];
};

export type PrototypeStorySegment = {
  text: string;
  occurrenceId?: string;
};

export type PrototypeStorySentence = {
  id: string;
  segments: readonly PrototypeStorySegment[];
};

export type PrototypeStory = {
  id: string;
  title: string;
  summary: string;
  sentences: readonly PrototypeStorySentence[];
  lexemes: readonly PrototypeLexeme[];
  senses: readonly PrototypeSense[];
  occurrences: readonly PrototypeStoryOccurrence[];
};
