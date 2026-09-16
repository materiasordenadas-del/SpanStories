import { loadImageRegistry } from "../../features/lexical-media/index.ts";
import type { StoryReaderViewModel } from "../../features/story-reader/model.ts";
import type { WordPanelDictionaryImage } from "../../features/story-reader/word-panel.ts";

/**
 * Pilot gate for `lexical-media` inside the story reader.
 *
 * Deliberately closed: `PILOT_STORY_IDS` lists the only two storyIds allowed
 * to show a dictionary image, even though `bindings.json` may carry an
 * APPROVED image for a Sense that appears in some other story. This is the
 * one place that knowledge lives — never inside `features/lexical-media`
 * (which has no notion of stories) and never inside `WordPanel` (which only
 * ever sees the resolved `dictionaryImage` or its absence).
 *
 *   "story-reader-1-1"  Story 1 — route 01/01, "El primer día de Samuel". Real StoryOccurrence/Sense
 *                       wiring exists internally (features/story-reader/story-one.ts), but the id the
 *                       page and WordPanel actually see is this reader-assembled one, not that
 *                       internal Story's own uuid — `getStoryReaderViewModel` never republishes it.
 *   "story-reader-1-2"  Story 2 — route 01/02, "Samuel conoce a Mateo". Surface-fallback reader;
 *                       senseId comes from STORY_TWO_SENSE_IDS_BY_SURFACE in reader.ts.
 *
 * Neither id is a published identity, only the reader's own
 * `story-reader-${island}-${story}` convention (see `createSurfaceStoryReader`
 * in features/story-reader/reader.ts). A test calls the real
 * `getStoryReaderViewModel` for both routes and asserts the ids it returns
 * match these two exactly, so a future refactor of the naming scheme cannot
 * silently widen or close the pilot without failing a test.
 *
 * `features/story-reader` never imports this file: it only surfaces a plain
 * `senseId` on the entries it already builds. This module is applied once,
 * at the composition root (`app/islas/[island]/[story]/page.tsx`), after the
 * reader has produced its ViewModel — never the other way around, which
 * would make `features/story-reader` depend on the adapter layer.
 */
export const PILOT_STORY_IDS: ReadonlySet<string> = new Set([
  "story-reader-1-1",
  "story-reader-1-2",
]);

const registry = loadImageRegistry();

const CANADA_FLAG: WordPanelDictionaryImage = {
  src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/Flag_of_Canada.svg/330px-Flag_of_Canada.svg.png",
  alt: "la bandera de Canadá",
  creator: "George F. G. Stanley, E Pluribus Anthony, Mzajac",
  license: "Dominio público",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Flag_of_Canada.svg",
  provider: "wikimedia",
};

const COLOMBIA_FLAG: WordPanelDictionaryImage = {
  src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/21/Flag_of_Colombia.svg/330px-Flag_of_Colombia.svg.png",
  alt: "la bandera de Colombia",
  creator: "Wikimedia Commons",
  license: "Dominio público",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Flag_of_Colombia.svg",
  provider: "wikimedia",
};

/**
 * Words this pilot images by surface text rather than by Sense, because
 * there is no `senseId` to resolve them through `lexical-media`:
 *
 *   - Canadá, Colombia: proper nouns naming a country ("de Canadá", "de
 *     Colombia", in both Story 1 and Story 2). Country names are not part of
 *     this curriculum's core vocabulary, so there is no Sense to bind. A flag
 *     is not a lexical illustration of a *meaning* anyway — it identifies a
 *     specific, unambiguous country.
 *   - canadiense, colombiano: the demonym adjectives for the same two
 *     countries, same gap, same flags — a nationality adjective is at least
 *     as well identified by its country's flag as the country name is.
 *   - decir, mirar, sonreír, responder, lista, vez, final: real A1
 *     vocabulary in Story 1/2 that this curriculum snapshot simply has not
 *     published a Sense for yet (verified against generated/curriculum/a1;
 *     the same gap as gato/perro/dormir/caminar found in the original
 *     20-Sense editorial batch). `repetir`, `apellido` and `día` *do* have a
 *     published Sense but no clear photographic candidate turned up after
 *     several searches, so they are left with no binding at all rather than
 *     an ambiguous one — the same "NO IMAGE beats a wrong image" rule the
 *     Sense-based pipeline follows.
 *
 * This table is exactly the "surface text → buscar imagen" path
 * `features/lexical-media` is forbidden from taking for ordinary words, so it
 * stays here, in the pilot's own editorial layer, never inside that feature.
 */
const SURFACE_ONLY_IMAGES_BY_SURFACE: ReadonlyMap<string, WordPanelDictionaryImage> = new Map([
  ["canadá", CANADA_FLAG],
  ["canadiense", CANADA_FLAG],
  ["colombia", COLOMBIA_FLAG],
  ["colombiano", COLOMBIA_FLAG],
  [
    "dice",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Man_sitting_in_a_chair_by_a_window_while_talking_on_his_phone_in_a_modern_indoor_space.jpg/330px-Man_sitting_in_a_chair_by_a_window_while_talking_on_his_phone_in_a_modern_indoor_space.jpg",
      alt: "un hombre hablando, para decir algo",
      creator: "Shixart1985",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Man_sitting_in_a_chair_by_a_window_while_talking_on_his_phone_in_a_modern_indoor_space.jpg",
      provider: "wikimedia",
    },
  ],
  [
    "mira",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Snowy_meadow_through_binoculars_%28Unsplash%29.jpg/330px-Snowy_meadow_through_binoculars_%28Unsplash%29.jpg",
      alt: "mirando a través de unos prismáticos",
      creator: "Caleb George",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Snowy_meadow_through_binoculars_(Unsplash).jpg",
      provider: "wikimedia",
    },
  ],
  [
    "sonríe",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/Smiling_senior_woman_with_curly_hair_portrait.jpg/330px-Smiling_senior_woman_with_curly_hair_portrait.jpg",
      alt: "una mujer sonriendo",
      creator: "Shixart1985",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Smiling_senior_woman_with_curly_hair_portrait.jpg",
      provider: "wikimedia",
    },
  ],
  [
    "responde",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f6/1964_Hammond_Slides_Student_Raising_Hand.jpg/330px-1964_Hammond_Slides_Student_Raising_Hand.jpg",
      alt: "un estudiante levanta la mano para responder",
      creator: "Thomas Taylor Hammond (1920-1993)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:1964_Hammond_Slides_Student_Raising_Hand.jpg",
      provider: "wikimedia",
    },
  ],
  [
    "lista",
    {
      src: "https://upload.wikimedia.org/wikipedia/commons/d/de/Crystal_Clear_app_lists.png",
      alt: "el icono de una lista",
      creator: "Everaldo Coelho and YellowIcon",
      license: "LGPL",
      licenseUrl: "http://www.gnu.org/licenses/lgpl.html",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Crystal_Clear_app_lists.png",
      provider: "wikimedia",
    },
  ],
  [
    "vez",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Wooden_hourglass_3.jpg/330px-Wooden_hourglass_3.jpg",
      alt: "un reloj de arena",
      creator: "S Sepp",
      license: "CC BY-SA 3.0",
      licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Wooden_hourglass_3.jpg",
      provider: "wikimedia",
    },
  ],
  [
    "final",
    {
      src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Better_Half_Dash_-_Checkered_Flag_%2822043586992%29.jpg/330px-Better_Half_Dash_-_Checkered_Flag_%2822043586992%29.jpg",
      alt: "una bandera de cuadros, meta final",
      creator: "Trailers of the East Coast",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Better_Half_Dash_-_Checkered_Flag_(22043586992).jpg",
      provider: "wikimedia",
    },
  ],
]);

/**
 * Resolve the dictionary image for one Sense, or `undefined` when the story
 * is outside the pilot, the Sense has no binding, or the binding has nothing
 * servable. Never throws: a missing or stale image is an expected, silent
 * outcome, not a domain error.
 */
export function resolveDictionaryImage(
  storyId: string,
  senseId: string | null | undefined,
): WordPanelDictionaryImage | undefined {
  if (senseId == null || !PILOT_STORY_IDS.has(storyId)) return undefined;
  const candidate = registry.resolveImageForSense(senseId);
  if (candidate === null) return undefined;
  return {
    src: candidate.thumbnailUrl,
    alt: candidate.altText,
    creator: candidate.creator,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourcePageUrl: candidate.sourcePageUrl,
    provider: candidate.provider,
  };
}

/** Resolves a surface-only image (no Sense involved), gated by the same pilot storyIds. */
export function resolveSurfaceOnlyImage(storyId: string, surface: string): WordPanelDictionaryImage | undefined {
  if (!PILOT_STORY_IDS.has(storyId)) return undefined;
  return SURFACE_ONLY_IMAGES_BY_SURFACE.get(surface.toLocaleLowerCase("es"));
}

function resolveEntryImage(
  storyId: string,
  entry: { readonly surface: string; readonly senseId?: string },
): WordPanelDictionaryImage | undefined {
  return resolveSurfaceOnlyImage(storyId, entry.surface) ?? resolveDictionaryImage(storyId, entry.senseId);
}

/**
 * Attaches `panel.dictionaryImage` to every lexical/surface entry of a
 * StoryReaderViewModel that belongs to a pilot story and either carries a
 * `senseId` the registry can resolve, or names a country this pilot knows
 * the flag of. Outside the pilot this is a no-op that returns the model
 * unchanged — no lexical-media lookup even runs.
 */
export function withPilotDictionaryImages(model: StoryReaderViewModel): StoryReaderViewModel {
  if (!PILOT_STORY_IDS.has(model.storyId)) return model;

  const lexicalEntries = Object.fromEntries(
    Object.entries(model.lexicalEntries).map(([id, entry]) => {
      const dictionaryImage = resolveEntryImage(model.storyId, entry);
      return [id, dictionaryImage === undefined ? entry : { ...entry, panel: { ...entry.panel, dictionaryImage } }];
    }),
  );
  const surfaceEntries = Object.fromEntries(
    Object.entries(model.surfaceEntries).map(([id, entry]) => {
      const dictionaryImage = resolveEntryImage(model.storyId, entry);
      return [id, dictionaryImage === undefined ? entry : { ...entry, panel: { ...entry.panel, dictionaryImage } }];
    }),
  );
  return { ...model, lexicalEntries, surfaceEntries };
}
