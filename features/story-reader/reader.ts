import { asId, type StorySentence, type SurfaceToken } from "../story-engine/index.ts";
import { loadCurriculumRegistry } from "../curriculum/index.ts";
import type { StoryReaderLexicalEntry, StoryReaderSurfaceEntry, StoryReaderViewModel } from "./model.ts";
import type { StoryReaderScene } from "./model.ts";
import { withQuickGloss } from "./gloss.ts";
import { QUICK_GLOSS_SOURCES } from "./quick-gloss-sources.ts";
import { buildReaderSegments } from "./segments.ts";
import { getStoryOneReaderViewModel } from "./story-one.ts";
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

const STORY_NOUNS = new Set(["apellido", "apellidos", "años", "carné", "chico", "clase", "día", "días", "edad", "escuela", "español", "final", "lista", "mapa", "número", "profesor", "señor", "teléfono"]);
const STORY_VERBS = new Set(["detiene", "dice", "entender", "entiendes", "entiendo", "eres", "es", "escucha", "está", "estás", "empieza", "habla", "hablar", "hablas", "hablo", "llamo", "mira", "puedes", "puedo", "pregunta", "repite", "repetir", "responde", "ríe", "sonríe", "sonríen", "soy", "tengo", "termina", "tiene", "tienes"]);

/**
 * Editorial pilot only, scoped to Story 2 (route "01/02"): the real published
 * senseId for each surface word this story actually uses that lexical-media
 * has an image for. Not a live search — this is curated data naming exactly
 * which Sense a specific word in this specific story realizes, the same kind
 * of editorial fact `LEXICAL_SPECS` records for Story 1 in story-one.ts, just
 * without the full StoryOccurrence/TextAnchor machinery this surface-only
 * reader doesn't build. `decir`, `mirar`, `sonreír`, `responder`, `repetir`,
 * `lista`, `final` and country/demonym words have no entry here even though
 * some appear in this story: see `SURFACE_ONLY_IMAGES_BY_SURFACE` and its
 * comment in lib/adapters/word-panel-image.ts for the ones that still get an
 * image, and for why `repetir` does not.
 */
const STORY_TWO_SENSE_IDS_BY_SURFACE: ReadonlyMap<string, string> = new Map([
  ["clase", "SENSE-A1-000140"],
  ["profesor", "SENSE-A1-000476"],
  ["chico", "SENSE-A1-000134"],
  ["mapa", "SENSE-A1-000353"],
  ["escucha", "SENSE-A1-000228"],
  ["habla", "SENSE-A1-000285"],
  ["años", "SENSE-A1-000040"],
  ["edad", "SENSE-A1-000206"],
  ["tengo", "SENSE-A1-000556"],
  ["tienes", "SENSE-A1-000556"],
  ["rápido", "SENSE-A1-000493"],
  ["mañana", "SENSE-A1-000350"],
]);

/**
 * Editorial pilot only, scoped to Story 1 (route "01/01"): a real published
 * senseId for surface words this story's own text uses that `story-one.ts`'s
 * `LEXICAL_SPECS` does not annotate (that file records canonical
 * StoryOccurrences for phase-2 validation; this is only the lighter,
 * pilot-only surface mapping `lexical-media` needs). Same rules as
 * `STORY_TWO_SENSE_IDS_BY_SURFACE`.
 */
const STORY_ONE_EXTRA_SENSE_IDS_BY_SURFACE: ReadonlyMap<string, string> = new Map([
  ["mañana", "SENSE-A1-000350"],
  ["encantado", "SENSE-A1-000217"],
]);

const curriculum = loadCurriculumRegistry();

function storyPartOfSpeech(surface: string): string | undefined {
  const normalized = surface.toLocaleLowerCase("es");
  if (STORY_NOUNS.has(normalized)) return "Sustantivo";
  if (STORY_VERBS.has(normalized)) return "Verbo";
  return undefined;
}

function focusTokenSurfaces(storyBlueprintId: string): ReadonlySet<string> {
  return new Set(curriculum.data.targets
    .filter((target) => target.firstIntroductionStoryId === storyBlueprintId && target.introSalience === "FOCUS" && (target.targetType === "SENSE" || target.targetType === "MWU_SOURCE_UNIT"))
    .flatMap((target) => [...target.item.matchAll(/[\p{L}\p{M}]+/gu)].map((match) => match[0].toLocaleLowerCase("es"))));
}

const STORIES: Readonly<Record<string, { readonly title: string; readonly summary: string; readonly paragraphs: readonly string[] }>> = {
  "01/01": {
    title: "El primer día de Samuel",
    summary: "El señor Gómez mira una lista.",
    paragraphs: [
      "—Hola. Buenos días —dice Samuel.",
      "—Buenos días —dice el señor Gómez—. ¿Cómo estás?",
      "—Bien, gracias.",
      "El señor Gómez mira una lista.",
      "—¿Quién es Samuel López?",
      "—Eh… perdón, señor. Yo soy Samuel Jhonson.",
      "—¿Jhonson?",
      "—Sí. Mi apellido es Jhonson.",
      "El señor Gómez mira la lista otra vez.",
      "—La lista dice Samuel Gómez.",
      "Samuel sonríe.",
      "—No. Yo soy Samuel Jhonson.",
      "—Bien. Samuel Jhonson. Encantado.",
      "—Encantado, señor Gómez.",
      "—¿De dónde eres, Samuel?",
      "—Soy de Toronto, Canadá.",
      "Al final de la clase, el profesor dice:",
      "—Hasta mañana, Samuel Jhonson.",
      "Samuel responde:",
      "—Hasta mañana, señor Gómez.",
      "Esta vez, el apellido está bien.",
    ],
  },
  "01/02": {
    title: "Samuel conoce a Mateo",
    summary: "Samuel está en la clase.",
    paragraphs: [
      "Samuel está en la clase.",
      "—Hola, ¿qué tal? —dice un chico.",
      "—Hola. Yo soy Mateo.",
      "—Hola. Yo soy Samuel.",
      "—Encantado, Samuel.",
      "—Encantado —dice Samuel.",
      "Mateo mira a Samuel.",
      "—¿De dónde eres?",
      "Samuel escucha:",
      "—¿Dónde?",
      "Samuel mira la clase.",
      "—Aquí.",
      "Mateo sonríe.",
      "—No. ¿De dónde eres?",
      "Samuel mira a Mateo.",
      "—¿Cómo?",
      "—¿De dónde eres, Samuel?",
      "Hay un mapa en la clase.",
      "Mateo mira el mapa.",
      "—¿De dónde eres? —repite Mateo.",
      "Samuel mira el mapa.",
      "—Ah… soy de Canadá.",
      "—Yo soy de Colombia —dice Mateo.",
      "Samuel sonríe.",
      "—Colombiano y canadiense.",
      "—Sí.",
      "Mateo mira a Samuel.",
      "—¿Hablas español?",
      "—Un poco —dice Samuel.",
      "—¡Ah, muy bien!",
      "Mateo habla muy rápido.",
      "Samuel lo mira.",
      "—¿Cómo? —dice Samuel.",
      "—¿Qué edad tienes? —dice Mateo.",
      "—Tengo 15 (quince) años —responde Samuel.",
      "—Yo tengo 14 (catorce) —dice Mateo.",
      "El profesor dice:",
      "—Hasta mañana.",
      "—Chao —dice Mateo.",
      "—Chao —dice Samuel.",
    ],
  },
  "01/03": {
    title: "Mateo Rojas García",
    summary: "Samuel está en clase con Mateo.",
    paragraphs: [
      "Samuel está en clase con Mateo.",
      "Mateo tiene un carné.",
      "El carné dice:",
      "MATEO ROJAS GARCÍA",
      "Samuel mira el carné.",
      "—¿Mateo Rojas García?",
      "—Sí. Me llamo Mateo Rojas García.",
      "Samuel mira a Mateo.",
      "—¿Cuál es tu apellido?",
      "—Rojas García.",
      "Samuel mira otra vez el carné.",
      "—¿Dos?",
      "Mateo sonríe.",
      "—Sí. Tengo dos apellidos: Rojas y García.",
      "—¿Dos apellidos?",
      "—Sí.",
      "Samuel lo mira.",
      "—¿Cómo?",
      "Mateo sonríe.",
      "—¿Y tú?",
      "—Samuel Jhonson.",
      "—¿Cuál es tu apellido?",
      "—Jhonson.",
      "Mateo pregunta:",
      "—¿Un apellido?",
      "—Sí. Tengo un apellido.",
      "Mateo empieza a hablar muy rápido.",
      "Samuel lo mira.",
      "—Despacio, Mateo.",
      "Mateo se detiene.",
      "—Perdón.",
      "Samuel sonríe.",
      "—Hablo poco español.",
      "Mateo sonríe también.",
      "—¿Tienes teléfono? —dice Mateo.",
      "—Sí, yo tengo teléfono —dice Samuel.",
      "—Silencio —dice el profesor.",
    ],
  },
  "01/04": {
    title: "¿Puedes repetir?",
    summary: "La clase termina.",
    paragraphs: [
      "La clase termina.",
      "Mateo mira a Samuel y pregunta:",
      "—¿Tienes teléfono?",
      "—Sí.",
      "Mateo dice:",
      "—Mi número es seis, uno, cuatro, ocho, tres, cinco, nueve, dos…",
      "Mateo habla muy rápido.",
      "Samuel lo mira y dice:",
      "—¿Cómo? No entiendo. ¿Puedes repetir, lento, por favor?",
      "Mateo repite el número.",
      "—Sí. Mi número es seis, uno, cuatro, ocho, tres, cinco, nueve, dos…",
      "Samuel mira el teléfono.",
      "—Muy bien.",
      "Mateo sonríe.",
      "—¿Entiendes?",
      "—Sí —dice Samuel.",
      "Samuel mira a Mateo.",
      "—Hablas español muy rápido.",
      "Mateo se ríe.",
      "—Perdón.",
      "—Ahora puedo entender —dice Samuel.",
      "Mateo y Samuel sonríen.",
    ],
  },
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
export function createSurfaceStoryReader(source: StoryReaderSource, scenes: readonly StoryReaderScene[] = [], senseIdsBySurface: ReadonlyMap<string, string> = new Map()): StoryReaderViewModel {
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
      const panel = buildSurfaceWordPanel(token, sentence);
      const inferredPartOfSpeech = storyPartOfSpeech(token.surface);
      const senseId = senseIdsBySurface.get(token.surface.toLocaleLowerCase("es"));
      surfaceEntries[token.id] = {
        tokenId: token.id,
        surface: token.surface,
        context: sentence.text,
        ...(senseId === undefined ? {} : { senseId }),
        panel: inferredPartOfSpeech === undefined ? panel : { ...panel, partOfSpeechLabel: inferredPartOfSpeech },
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
    scenes,
    lexicalEntries: {},
    surfaceEntries,
  };
}

async function enrichStoryOne(model: StoryReaderViewModel): Promise<StoryReaderViewModel> {
  const published = await getStoryOneReaderViewModel();
  const available = new Map<string, StoryReaderLexicalEntry[]>();
  // La señal se lee de la malla publicada completa. No depende de que la
  // anotación editorial ya tenga un binding para cada FOCUS de la historia.
  const focusSurfaces = focusTokenSurfaces(published.storyBlueprintId);
  for (const entry of Object.values(published.lexicalEntries)) {
    const key = entry.surface.toLocaleLowerCase("es");
    available.set(key, [...(available.get(key) ?? []), entry]);
  }
  const lexicalEntries: Record<string, StoryReaderLexicalEntry> = {};
  const sentences = model.sentences.map((sentence) => ({
    ...sentence,
    segments: sentence.segments.map((segment) => {
      if (segment.kind !== "SURFACE") return segment;
      const curriculumFocus = focusSurfaces.has(segment.text.toLocaleLowerCase("es"));
      const entry = available.get(segment.text.toLocaleLowerCase("es"))?.shift();
      const surfacePanel = model.surfaceEntries[segment.tokenId]?.panel;
      if (entry === undefined || surfacePanel === undefined) return curriculumFocus ? { ...segment, curriculumFocus: true as const } : segment;
      lexicalEntries[entry.occurrenceId] = {
        ...entry,
        surface: segment.text,
        context: sentence.text,
        panel: {
          ...entry.panel,
          surface: segment.text,
          partOfSpeechLabel: entry.panel.partOfSpeechLabel ?? storyPartOfSpeech(segment.text),
          currentContext: surfacePanel.currentContext,
        },
      };
      return {
        kind: "LEXICAL" as const,
        text: segment.text,
        occurrenceId: entry.occurrenceId,
        ...(curriculumFocus ? { curriculumFocus: true as const } : {}),
      };
    }),
  }));
  return { ...model, sentences, lexicalEntries, eventContext: published.eventContext };
}

export async function getStoryReaderViewModel(island: string, story: string) {
  const key = `${String(Number(island)).padStart(2, "0")}/${String(Number(story)).padStart(2, "0")}`;
  const publishedStory = STORIES[key];
  if (publishedStory !== undefined) {
    const scenes: readonly StoryReaderScene[] = key === "01/01"
      ? [[0, 1, 2], [3], [4, 5], [6, 7, 8], [9, 10, 11], [12, 13], [14, 15], [16, 17, 18, 19], [20]].map((sentenceIndexes, index) => ({
          number: index + 1,
          sentenceIndexes,
          rosterSentenceIndex: null,
          illustration: {
            src: `/stories/historia-01/scenes/scene-${String(index + 1).padStart(2, "0")}.png`,
            alt: `Escena ${index + 1} de El primer día de Samuel`,
          },
        }))
      : [];
    const senseIdsBySurface = key === "01/02"
      ? STORY_TWO_SENSE_IDS_BY_SURFACE
      : key === "01/01"
        ? STORY_ONE_EXTRA_SENSE_IDS_BY_SURFACE
        : new Map<string, string>();
    const model = createSurfaceStoryReader({ island, story, title: publishedStory.title, paragraphs: publishedStory.paragraphs }, scenes, senseIdsBySurface);
    const enrichedModel = key === "01/01" ? await enrichStoryOne(model) : model;
    return withQuickGloss({
      ...enrichedModel,
      summary: publishedStory.summary,
    }, QUICK_GLOSS_SOURCES[key]);
  }
  return withQuickGloss(createSurfaceStoryReader({
    island,
    story,
    title: TITLES[key] ?? "Una nueva historia",
    paragraphs: DEFAULT_PARAGRAPHS,
  }));
}
