import { asId, type StorySentence, type SurfaceToken } from "../story-engine/index.ts";
import type { StoryReaderSurfaceEntry, StoryReaderViewModel } from "./model.ts";
import { buildReaderSegments } from "./segments.ts";
import { getStoryOneReaderViewModel, isStoryOneRoute } from "./story-one.ts";
import { buildSurfaceWordPanel } from "./word-panel.ts";

export type StoryReaderSource = {
  readonly island: string;
  readonly story: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
};

const DEFAULT_PARAGRAPHS = [
  "Hoy es mi primer día en la escuela. Entro en el aula y veo a la profesora. Ella sonríe y dice: «Buenos días».",
  "Hay muchas personas en la clase. Me siento cerca de una chica. Se llama Ana y es de Colombia. Yo digo mi nombre y empezamos a hablar.",
  "No entiendo todas las palabras, pero entiendo la historia. Poco a poco, el español empieza a ser un lugar conocido.",
] as const;

const TITLES: Readonly<Record<string, string>> = {
  "01/02": "La ficha del grupo",
  "01/03": "Conocer a un compañero",
  "01/04": "No entiendo",
};

function tokenize(sentence: StorySentence, routeKey: string): readonly SurfaceToken[] {
  return [...sentence.text.matchAll(/[\p{L}\p{M}]+/gu)].map((match, tokenIndex) => {
    const utf16Start = match.index;
    return {
      id: asId("SurfaceTokenId", `tok-reader-${routeKey}-${sentence.order}-${tokenIndex + 1}`),
      sentenceId: sentence.id,
      surface: match[0],
      startOffset: [...sentence.text.slice(0, utf16Start)].length,
      endOffset: [...sentence.text.slice(0, utf16Start + match[0].length)].length,
      order: tokenIndex + 1,
    };
  });
}

/**
 * General reader fallback: every Unicode word receives a surface panel and
 * browser pronunciation, even before editorial lexical annotation exists.
 */
export function createSurfaceStoryReader(source: StoryReaderSource): StoryReaderViewModel {
  const routeKey = `${Number(source.island) || 0}-${Number(source.story) || 0}`;
  const storyVersionId = asId("StoryVersionId", `storyver-reader-${routeKey}`);
  const sentences: StorySentence[] = source.paragraphs.map((text, index) => {
    const base: StorySentence = {
      id: asId("SentenceId", `sent-reader-${routeKey}-${index + 1}`),
      storyVersionId,
      order: index + 1,
      text,
      tokens: [],
    };
    return { ...base, tokens: tokenize(base, routeKey) };
  });
  const surfaceEntries: Record<string, StoryReaderSurfaceEntry> = {};
  const readerSentences = sentences.map((sentence) => {
    for (const token of sentence.tokens) {
      surfaceEntries[token.id] = {
        tokenId: token.id,
        surface: token.surface,
        context: sentence.text,
        panel: buildSurfaceWordPanel(token, sentence),
      };
    }
    return {
      id: sentence.id,
      text: sentence.text,
      presentation: "PARAGRAPH" as const,
      segments: buildReaderSegments(sentence, [], []),
    };
  });

  return {
    storyBlueprintId: `reader-${routeKey}`,
    storyId: `story-reader-${routeKey}`,
    storyVersionId,
    title: source.title,
    sentences: readerSentences,
    scenes: [],
    lexicalEntries: {},
    surfaceEntries,
  };
}

export async function getStoryReaderViewModel(island: string, story: string) {
  if (isStoryOneRoute(island, story)) return getStoryOneReaderViewModel();
  const key = `${island.padStart(2, "0")}/${story.padStart(2, "0")}`;
  return createSurfaceStoryReader({
    island,
    story,
    title: TITLES[key] ?? "Una nueva historia",
    paragraphs: DEFAULT_PARAGRAPHS,
  });
}
