import islandsJson from "@/generated/curriculum/a1/islands.json";
import modulesJson from "@/generated/curriculum/a1/modules.json";
import blueprintsJson from "@/generated/curriculum/a1/story-blueprints.json";
import { getStoryReaderViewModel } from "@/features/story-reader/reader";

/**
 * Adaptador de solo lectura: currículo A1 generado → props simples para la UI.
 * Las pantallas nunca inventan islas, títulos ni recuentos: salen de aquí.
 */

type RawModule = { readonly id: string; readonly order: number; readonly name: string; readonly islandIds: readonly string[] };
type RawIsland = {
  readonly id: string;
  readonly moduleId: string;
  readonly globalIslandOrder: number;
  readonly name: string;
  readonly storyIds: readonly string[];
  readonly hardPrerequisiteIslandId: string | null;
};
type RawBlueprint = { readonly id: string; readonly islandId: string; readonly storyOrder: number; readonly title: string };

export type A1Story = {
  readonly id: string;
  readonly island: string;
  readonly story: string;
  readonly title: string;
  readonly blurb?: string;
  readonly href: string;
};

export type A1Island = {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly moduleName: string;
  readonly moduleOrder: number;
  /** Solo las islas con historias publicadas en el lector se pueden abrir. */
  readonly published: boolean;
  readonly unlockAfter?: string;
  readonly href: string;
  readonly stories: readonly A1Story[];
};

export type A1Module = { readonly order: number; readonly name: string; readonly islands: readonly A1Island[] };

export type A1Catalog = { readonly modules: readonly A1Module[]; readonly islands: readonly A1Island[]; readonly storyCount: number };

const PUBLISHED_ISLAND_IDS: ReadonlySet<string> = new Set(["A1-M01-I05"]);

/** Texto para estudiantes cuando la historia no trae resumen publicado. */
const STORY_BLURBS: Readonly<Record<string, string>> = {
  "A1-M01-I05-S2": "Una ficha sencilla con nombres, países y preguntas.",
  "A1-M01-I05-S3": "Una conversación nueva durante el recreo.",
  "A1-M01-I05-S4": "Pedir ayuda también es parte de empezar.",
};

export const twoDigits = (value: number) => String(value).padStart(2, "0");

function buildCatalog(): A1Catalog {
  const rawModules = modulesJson as readonly RawModule[];
  const rawIslands = islandsJson as readonly RawIsland[];
  const blueprints = blueprintsJson as readonly RawBlueprint[];
  const islandById = new Map(rawIslands.map((island) => [island.id, island] as const));

  const islands = [...rawIslands].sort((a, b) => a.globalIslandOrder - b.globalIslandOrder).map((island): A1Island => {
    const parent = rawModules.find((candidate) => candidate.id === island.moduleId);
    const number = twoDigits(island.globalIslandOrder);
    const prerequisite = island.hardPrerequisiteIslandId === null ? undefined : islandById.get(island.hardPrerequisiteIslandId);
    const stories = blueprints
      .filter((blueprint) => blueprint.islandId === island.id)
      .sort((a, b) => a.storyOrder - b.storyOrder)
      .map((blueprint): A1Story => ({
        id: blueprint.id,
        island: number,
        story: twoDigits(blueprint.storyOrder),
        title: blueprint.title,
        ...(STORY_BLURBS[blueprint.id] === undefined ? {} : { blurb: STORY_BLURBS[blueprint.id] }),
        href: `/islas/${number}/${twoDigits(blueprint.storyOrder)}`,
      }));
    return {
      id: island.id,
      number,
      name: island.name,
      moduleName: parent?.name ?? "",
      moduleOrder: parent?.order ?? 0,
      published: PUBLISHED_ISLAND_IDS.has(island.id),
      ...(prerequisite === undefined ? {} : { unlockAfter: prerequisite.name }),
      href: `/islas/${number}`,
      stories,
    };
  });

  return {
    modules: [...rawModules].sort((a, b) => a.order - b.order).map((entry) => ({
      order: entry.order,
      name: entry.name,
      islands: islands.filter((island) => island.moduleOrder === entry.order),
    })),
    islands,
    storyCount: islands.reduce((total, island) => total + island.stories.length, 0),
  };
}

const catalog = buildCatalog();

export function getA1Catalog(): A1Catalog {
  return catalog;
}

export function getA1Island(number: string): A1Island | undefined {
  const order = Number(number);
  return Number.isInteger(order) ? catalog.islands.find((island) => island.number === twoDigits(order)) : undefined;
}

export function getA1Story(islandNumber: string, storyNumber: string): A1Story | undefined {
  const order = Number(storyNumber);
  return Number.isInteger(order) ? getA1Island(islandNumber)?.stories.find((story) => story.story === twoDigits(order)) : undefined;
}

/** Isla con los títulos tal como se publican en el lector (pueden afinar el título del blueprint). */
export async function getA1IslandForReading(number: string): Promise<A1Island | undefined> {
  const island = getA1Island(number);
  if (island === undefined || !island.published) return island;
  const stories = await Promise.all(island.stories.map(async (story) => {
    const model = await getStoryReaderViewModel(story.island, story.story);
    const blurb = story.blurb ?? model.summary;
    return { ...story, title: model.title, ...(blurb === undefined ? {} : { blurb }) };
  }));
  return { ...island, stories };
}

/** Lo que sigue después de una historia: la siguiente de la isla o la isla siguiente. */
export function getA1NextStep(islandNumber: string, storyNumber: string): { readonly island?: A1Island; readonly story?: A1Story; readonly nextIsland?: A1Island } {
  const island = getA1Island(islandNumber);
  if (island === undefined) return {};
  const index = island.stories.findIndex((story) => story.story === twoDigits(Number(storyNumber)));
  const story = index >= 0 ? island.stories[index + 1] : undefined;
  if (story !== undefined) return { island, story };
  const nextIsland = catalog.islands[catalog.islands.indexOf(island) + 1];
  return nextIsland === undefined ? { island } : { island, nextIsland };
}
