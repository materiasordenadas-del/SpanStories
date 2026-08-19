export const LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1"] as const;

export type LevelCode = (typeof LEVEL_CODES)[number];

export type ActivityKind =
  | "introduction"
  | "story"
  | "comprehension"
  | "vocabulary"
  | "challenge";

export type IslandActivitySummary = {
  id: ActivityKind;
  title: string;
  description: string;
};

export type IslandSummary = {
  id: 1;
  slug: "1";
  title: string;
  description: string;
  status: "experimental";
  activities: readonly IslandActivitySummary[];
};

export type ModuleSummary = {
  id: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  status: "experimental" | "planned";
  islands: readonly IslandSummary[];
};

export type LevelSummary = {
  code: LevelCode;
  slug: Lowercase<LevelCode>;
  title: string;
  description: string;
  modules: readonly ModuleSummary[];
};

const ISLAND_ACTIVITIES: readonly IslandActivitySummary[] = [
  {
    id: "introduction",
    title: "Introducción",
    description: "Presenta el objetivo de la isla y prepara el contexto de aprendizaje.",
  },
  {
    id: "story",
    title: "Historia",
    description: "Reserva el espacio de la experiencia narrativa principal de la isla.",
  },
  {
    id: "comprehension",
    title: "Comprensión",
    description: "Comprueba la comprensión global y los detalles esenciales de la historia.",
  },
  {
    id: "vocabulary",
    title: "Vocabulario",
    description: "Agrupa la práctica léxica que más adelante conectará con el Lexical Engine.",
  },
  {
    id: "challenge",
    title: "Reto",
    description: "Cierra la isla con una actividad breve de consolidación.",
  },
];

function createExperimentalIsland(level: LevelCode): IslandSummary {
  return {
    id: 1,
    slug: "1",
    title: "Isla 1 · Laboratorio",
    description: `Primera isla experimental de ${level}. Su contenido es provisional y sirve para validar navegación e interfaz.`,
    status: "experimental",
    activities: ISLAND_ACTIVITIES,
  };
}

const createModules = (level: LevelCode): readonly ModuleSummary[] => [
  {
    id: 1,
    title: "Módulo 1",
    description: "Contiene la primera isla experimental de SpanStories.",
    status: "experimental",
    islands: [createExperimentalIsland(level)],
  },
  {
    id: 2,
    title: "Módulo 2",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
    islands: [],
  },
  {
    id: 3,
    title: "Módulo 3",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
    islands: [],
  },
  {
    id: 4,
    title: "Módulo 4",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
    islands: [],
  },
];

export const LEVELS: readonly LevelSummary[] = [
  {
    code: "A1",
    slug: "a1",
    title: "A1 · Inicial",
    description: "Primer contacto con historias y estructuras fundamentales.",
    modules: createModules("A1"),
  },
  {
    code: "A2",
    slug: "a2",
    title: "A2 · Básico",
    description: "Expansión del repertorio cotidiano y narrativo.",
    modules: createModules("A2"),
  },
  {
    code: "B1",
    slug: "b1",
    title: "B1 · Intermedio",
    description: "Historias más extensas, conectores y mayor autonomía.",
    modules: createModules("B1"),
  },
  {
    code: "B2",
    slug: "b2",
    title: "B2 · Intermedio alto",
    description: "Mayor precisión, matices y variedad discursiva.",
    modules: createModules("B2"),
  },
  {
    code: "C1",
    slug: "c1",
    title: "C1 · Avanzado",
    description: "Uso flexible del español y comprensión de textos complejos.",
    modules: createModules("C1"),
  },
];

export function getLevelBySlug(slug: string): LevelSummary | undefined {
  return LEVELS.find((level) => level.slug === slug.toLowerCase());
}

export function getModuleById(
  level: LevelSummary,
  moduleId: string,
): ModuleSummary | undefined {
  const id = Number(moduleId);

  if (!Number.isInteger(id)) {
    return undefined;
  }

  return level.modules.find((module) => module.id === id);
}

export function getIslandBySlug(
  module: ModuleSummary,
  islandSlug: string,
): IslandSummary | undefined {
  return module.islands.find((island) => island.slug === islandSlug);
}
