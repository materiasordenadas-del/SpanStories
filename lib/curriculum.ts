export const LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1"] as const;

export type LevelCode = (typeof LEVEL_CODES)[number];

export type ModuleSummary = {
  id: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  status: "experimental" | "planned";
};

export type LevelSummary = {
  code: LevelCode;
  slug: Lowercase<LevelCode>;
  title: string;
  description: string;
  modules: readonly ModuleSummary[];
};

const createModules = (): readonly ModuleSummary[] => [
  {
    id: 1,
    title: "Módulo 1",
    description: "Contendrá la primera isla experimental de SpanStories.",
    status: "experimental",
  },
  {
    id: 2,
    title: "Módulo 2",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
  },
  {
    id: 3,
    title: "Módulo 3",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
  },
  {
    id: 4,
    title: "Módulo 4",
    description: "Reservado para ampliar el nivel después del vertical slice.",
    status: "planned",
  },
];

export const LEVELS: readonly LevelSummary[] = [
  {
    code: "A1",
    slug: "a1",
    title: "A1 · Inicial",
    description: "Primer contacto con historias y estructuras fundamentales.",
    modules: createModules(),
  },
  {
    code: "A2",
    slug: "a2",
    title: "A2 · Básico",
    description: "Expansión del repertorio cotidiano y narrativo.",
    modules: createModules(),
  },
  {
    code: "B1",
    slug: "b1",
    title: "B1 · Intermedio",
    description: "Historias más extensas, conectores y mayor autonomía.",
    modules: createModules(),
  },
  {
    code: "B2",
    slug: "b2",
    title: "B2 · Intermedio alto",
    description: "Mayor precisión, matices y variedad discursiva.",
    modules: createModules(),
  },
  {
    code: "C1",
    slug: "c1",
    title: "C1 · Avanzado",
    description: "Uso flexible del español y comprensión de textos complejos.",
    modules: createModules(),
  },
];

export function getLevelBySlug(slug: string): LevelSummary | undefined {
  return LEVELS.find((level) => level.slug === slug.toLowerCase());
}
