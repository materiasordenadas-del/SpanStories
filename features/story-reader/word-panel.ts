import type { Lexeme, Sense } from "../curriculum/index.ts";
import type {
  LexicalOccurrence,
  StoryOccurrence,
  StorySentence,
  SurfaceToken,
  TextAnchor,
} from "../story-engine/index.ts";
import type { StoryReaderScene } from "./model.ts";

/**
 * Learner-facing contract of the word panel in the story reader.
 *
 *   Lexical Engine / Story Engine / Learner Progress → this adapter → WordPanelViewModel → visual UI
 *
 * No ids, enums or engine objects cross this boundary. Every optional field is
 * omitted — never filled with a placeholder — when no published source provides
 * it: translation, usage, examples, audio and images have no source yet, so they
 * stay absent until one is published.
 */

export type WordPanelTextPart = {
  readonly text: string;
  readonly highlighted: boolean;
};

export type WordPanelContext = {
  readonly text: string;
  readonly parts: readonly WordPanelTextPart[];
  readonly storyTitle?: string;
  readonly islandLabel?: string;
  readonly sceneLabel?: string;
};

export type WordPanelExample = {
  readonly text: string;
  readonly translation?: string;
  readonly audioSrc?: string;
};

export type WordPanelViewModel = {
  readonly id: string;
  /** `SURFACE` is a selectable token without a published lexical identity. */
  readonly kind: "LEXICAL" | "SURFACE";
  readonly surface: string;
  readonly translation?: string;
  readonly partOfSpeechLabel?: string;
  readonly cefrLevel?: string;
  readonly pronunciation?: { readonly audioSrc?: string };
  readonly image?: { readonly src: string; readonly alt: string };
  readonly shortUsage?: string;
  readonly currentContext: WordPanelContext & { readonly highlightedSurface: string };
  readonly examples?: readonly WordPanelExample[];
  /** Other occurrences of the same Sense (or Lexeme, when unresolved) in this StoryVersion. */
  readonly storyContexts?: readonly WordPanelContext[];
  /** Occurrences in other published stories. */
  readonly previousContexts?: readonly WordPanelContext[];
  /** Reserved for real save/practice actions: opening a word is neither saving nor mastery. */
  readonly canSave?: boolean;
  readonly canPractice?: boolean;
};

/** Published annotation → learner label. Unlisted values get no label rather than a guess. */
const CATEGORY_LABELS: ReadonlyMap<string, string> = new Map([
  ["NOUN", "Sustantivo"],
  ["TEMPORAL_NOUN", "Sustantivo"],
  ["ADJECTIVE", "Adjetivo"],
  ["TEMPORAL_ADVERB", "Adverbio"],
  ["PREPOSITION", "Preposición"],
  ["PERSONAL_PRONOUN_SUBJECT", "Pronombre"],
  ["CLITIC", "Pronombre"],
  ["DEFINED_ARTICLE", "Artículo"],
  ["INDEFINITE_ARTICLE", "Artículo"],
  ["DEMONSTRATIVE", "Demostrativo"],
  ["ATONIC_POSSESSIVE", "Posesivo"],
  ["INTERROGATIVE", "Interrogativo"],
  ["QUANTIFIER_DEGREE", "Cuantificador"],
  ["ORDINAL_NUMERAL", "Numeral"],
  ["CONJUNCTION_CONNECTOR", "Conjunción"],
  ["MWU_CHUNK", "Expresión"],
  ["INTERROGATIVE_LOCUTION", "Expresión"],
  ["ADVERBIAL_OR_PREPOSITIONAL_LOCUTION", "Expresión"],
]);

const ENGINE_POS_LABELS: ReadonlyMap<string, string> = new Map([
  ["NOUN", "Sustantivo"],
  ["ADJ", "Adjetivo"],
  ["ADV", "Adverbio"],
  ["ADP", "Preposición"],
  ["PRON", "Pronombre"],
  ["ARTICLE", "Artículo"],
  ["DET", "Determinante"],
  ["DEMONSTRATIVE", "Demostrativo"],
  ["INTERROGATIVE", "Interrogativo"],
  ["QUANTIFIER", "Cuantificador"],
  ["CCONJ", "Conjunción"],
  ["SCONJ", "Conjunción"],
  ["MWU", "Expresión"],
]);

export function partOfSpeechLabel(
  lexeme: Pick<Lexeme, "type" | "lexicalCategory" | "enginePos">,
  sense: Pick<Sense, "lexicalCategory" | "enginePos"> | null,
): string | undefined {
  for (const category of [sense?.lexicalCategory, lexeme.lexicalCategory]) {
    const label = category == null ? undefined : CATEGORY_LABELS.get(category);
    if (label !== undefined) return label;
  }
  for (const pos of [sense?.enginePos, lexeme.enginePos]) {
    const label = pos == null ? undefined : ENGINE_POS_LABELS.get(pos);
    if (label !== undefined) return label;
  }
  return lexeme.type === "MULTIWORD" ? "Expresión" : undefined;
}

/** Splits `text` around half-open code point ranges, the unit every TextAnchor uses. */
export function highlightParts(
  text: string,
  ranges: readonly { readonly start: number; readonly end: number }[],
): readonly WordPanelTextPart[] {
  const codePoints = [...text];
  const parts: WordPanelTextPart[] = [];
  let cursor = 0;
  for (const { start, end } of [...ranges].sort((a, b) => a.start - b.start)) {
    const from = Math.max(start, cursor);
    if (end <= from) continue;
    if (from > cursor) parts.push({ text: codePoints.slice(cursor, from).join(""), highlighted: false });
    parts.push({ text: codePoints.slice(from, end).join(""), highlighted: true });
    cursor = end;
  }
  if (cursor < codePoints.length) parts.push({ text: codePoints.slice(cursor).join(""), highlighted: false });
  return parts;
}

export type WordPanelStoryIndex = {
  readonly sentencesById: ReadonlyMap<string, StorySentence>;
  readonly anchorsById: ReadonlyMap<string, TextAnchor>;
  readonly occurrences: readonly StoryOccurrence[];
  readonly sceneLabelBySentenceId: ReadonlyMap<string, string>;
};

export function createWordPanelStoryIndex(
  sentences: readonly StorySentence[],
  anchors: readonly TextAnchor[],
  occurrences: readonly StoryOccurrence[],
  scenes: readonly StoryReaderScene[],
): WordPanelStoryIndex {
  const sceneLabelBySentenceId = new Map<string, string>();
  for (const scene of scenes) {
    for (const sentenceIndex of scene.sentenceIndexes) {
      const sentence = sentences[sentenceIndex];
      if (sentence !== undefined) sceneLabelBySentenceId.set(sentence.id, `Escena ${scene.number}`);
    }
  }
  return {
    sentencesById: new Map(sentences.map((sentence) => [sentence.id, sentence] as const)),
    anchorsById: new Map(anchors.map((anchor) => [anchor.id, anchor] as const)),
    occurrences,
    sceneLabelBySentenceId,
  };
}

function occurrenceContext(occurrence: LexicalOccurrence, index: WordPanelStoryIndex): WordPanelContext {
  const sentence = index.sentencesById.get(occurrence.sentenceId);
  if (sentence === undefined) throw new Error(`WORD_PANEL_SENTENCE_NOT_FOUND: ${occurrence.id}`);
  const ranges = occurrence.parts.flatMap((part) => {
    const anchor = index.anchorsById.get(part.anchorId);
    return anchor !== undefined && anchor.sentenceId === sentence.id ? [anchor] : [];
  });
  const sceneLabel = index.sceneLabelBySentenceId.get(sentence.id);
  return {
    text: sentence.text,
    parts: highlightParts(sentence.text, ranges),
    ...(sceneLabel === undefined ? {} : { sceneLabel }),
  };
}

function sharesMeaning(selected: LexicalOccurrence, candidate: LexicalOccurrence): boolean {
  // An unresolved sense is never presented as "this exact meaning" (docs/lexical-engine.md §41).
  if (selected.senseResolutionStatus === "RESOLVED" && selected.senseId !== null) {
    return candidate.senseResolutionStatus === "RESOLVED" && candidate.senseId === selected.senseId;
  }
  return candidate.lexemeId === selected.lexemeId;
}

export function buildLexicalWordPanel(input: {
  readonly occurrence: LexicalOccurrence;
  readonly lexeme: Lexeme;
  readonly sense: Sense | null;
  readonly levelCode: string;
  readonly index: WordPanelStoryIndex;
}): WordPanelViewModel {
  const { occurrence, lexeme, sense, levelCode, index } = input;
  const label = partOfSpeechLabel(lexeme, sense);
  const sceneLabel = index.sceneLabelBySentenceId.get(occurrence.sentenceId);
  const sceneNumber = Number(sceneLabel?.replace(/^Escena\s+/, ""));
  const sentenceOrder = (candidate: LexicalOccurrence) => index.sentencesById.get(candidate.sentenceId)?.order ?? 0;
  const storyContexts = index.occurrences
    .filter((candidate): candidate is LexicalOccurrence =>
      candidate.kind === "LEXICAL" && candidate.id !== occurrence.id && sharesMeaning(occurrence, candidate))
    .sort((a, b) => sentenceOrder(a) - sentenceOrder(b))
    .map((candidate) => occurrenceContext(candidate, index));
  const hasCurricularLevel = occurrence.senseResolutionStatus === "RESOLVED" && sense?.isA1 === true;

  return {
    id: occurrence.id,
    kind: "LEXICAL",
    surface: occurrence.surface,
    ...(label === undefined ? {} : { partOfSpeechLabel: label }),
    ...(hasCurricularLevel ? { cefrLevel: levelCode } : {}),
    ...(Number.isInteger(sceneNumber) && sceneNumber > 0
      ? { image: { src: `/stories/historia-01/scenes/scene-${String(sceneNumber).padStart(2, "0")}.png`, alt: `Ilustración de la escena ${sceneNumber}` } }
      : {}),
    currentContext: { ...occurrenceContext(occurrence, index), highlightedSurface: occurrence.surface },
    ...(storyContexts.length > 0 ? { storyContexts } : {}),
  };
}

export function buildSurfaceWordPanel(token: SurfaceToken, sentence: StorySentence): WordPanelViewModel {
  return {
    id: token.id,
    kind: "SURFACE",
    surface: token.surface,
    currentContext: {
      text: sentence.text,
      parts: highlightParts(sentence.text, [{ start: token.startOffset, end: token.endOffset }]),
      highlightedSurface: token.surface,
    },
  };
}
