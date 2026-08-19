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
