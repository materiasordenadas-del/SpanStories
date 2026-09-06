/**
 * Query API over the generated registry.
 *
 * Stable, technical lookups proving the registry is an executable authority
 * rather than a pile of files. Two outcomes are kept strictly apart:
 *
 *   an unknown id            -> `NOT_FOUND`
 *   a known id with no rows  -> `FOUND` with an empty list
 *
 * That distinction matters here: grammar units are legitimately addressed by
 * zero SourceAssertions, and returning `[]` for a misspelled id would hide a
 * real integrity problem behind a plausible-looking empty result.
 */

import type {
  CurriculumData,
  CurriculumModule,
  CurriculumTarget,
  GrammarUnit,
  Island,
  Lexeme,
  LexemeForm,
  MwuUnit,
  RecycleEdge,
  ReturnStage,
  Sense,
  SourceAssertion,
  StoryBlueprint,
  TargetType,
} from "../domain/model.ts";
import type { CurriculumRelease } from "../domain/release.ts";

export type QueryResult<T> =
  | { readonly status: "FOUND"; readonly value: T }
  | { readonly status: "NOT_FOUND"; readonly id: string };

function found<T>(value: T): QueryResult<T> {
  return { status: "FOUND", value };
}

function notFound<T>(id: string): QueryResult<T> {
  return { status: "NOT_FOUND", id };
}

/** A target resolved to the registry object it schedules. */
export type ResolvedTarget = {
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly allocation: CurriculumTarget;
  readonly sense: Sense | null;
  readonly mwuUnit: MwuUnit | null;
  readonly grammarUnit: GrammarUnit | null;
};

export type FirstIntroduction = {
  readonly targetId: string;
  readonly allocation: CurriculumTarget;
  readonly module: CurriculumModule;
  readonly island: Island;
  readonly story: StoryBlueprint;
};

export type RecycleStep = {
  readonly returnStage: ReturnStage;
  readonly edge: RecycleEdge;
  readonly story: StoryBlueprint;
};

export type RecyclePath = {
  readonly targetId: string;
  readonly introduction: StoryBlueprint;
  readonly steps: readonly RecycleStep[];
};

function index<T>(rows: readonly T[], key: (value: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(key(row), row);
  return map;
}

function group<T>(rows: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket === undefined) map.set(key(row), [row]);
    else bucket.push(row);
  }
  return map;
}

export class CurriculumRegistry {
  readonly release: CurriculumRelease;
  readonly data: CurriculumData;

  private readonly lexemes: Map<string, Lexeme>;
  private readonly forms: Map<string, LexemeForm>;
  private readonly senses: Map<string, Sense>;
  private readonly mwuUnits: Map<string, MwuUnit>;
  private readonly grammarUnits: Map<string, GrammarUnit>;
  private readonly assertions: Map<string, SourceAssertion>;
  private readonly modules: Map<string, CurriculumModule>;
  private readonly islands: Map<string, Island>;
  private readonly stories: Map<string, StoryBlueprint>;
  private readonly targetsByTargetId: Map<string, CurriculumTarget>;
  private readonly edgesById: Map<string, RecycleEdge>;
  private readonly formsByLexeme: Map<string, LexemeForm[]>;
  private readonly sensesByLexeme: Map<string, Sense[]>;
  private readonly assertionsByTarget: Map<string, SourceAssertion[]>;
  private readonly assertionsBySense: Map<string, SourceAssertion[]>;

  constructor(release: CurriculumRelease, data: CurriculumData) {
    this.release = release;
    this.data = data;
    this.lexemes = index(data.lexemes, (v) => v.id);
    this.forms = index(data.lexemeForms, (v) => v.id);
    this.senses = index(data.senses, (v) => v.id);
    this.mwuUnits = index(data.mwuUnits, (v) => v.id);
    this.grammarUnits = index(data.grammarUnits, (v) => v.id);
    this.assertions = index(data.sourceAssertions, (v) => v.id);
    this.modules = index(data.modules, (v) => v.id);
    this.islands = index(data.islands, (v) => v.id);
    this.stories = index(data.storyBlueprints, (v) => v.id);
    this.targetsByTargetId = index(data.targets, (v) => v.targetId);
    this.edgesById = index(data.recycleEdges, (v) => v.id);
    this.formsByLexeme = group(data.lexemeForms, (v) => v.lexemeId);
    this.sensesByLexeme = group(data.senses, (v) => v.lexemeId);
    this.assertionsByTarget = group(data.sourceAssertions, (v) => v.targetId);
    this.assertionsBySense = group(
      data.sourceAssertions.filter((v) => v.senseId !== null),
      (v) => v.senseId as string,
    );
  }

  // ------------------------------------------------------------- identities

  getLexemeById(id: string): Lexeme | null {
    return this.lexemes.get(id) ?? null;
  }

  getFormById(id: string): LexemeForm | null {
    return this.forms.get(id) ?? null;
  }

  getSenseById(id: string): Sense | null {
    return this.senses.get(id) ?? null;
  }

  getMwuUnitById(id: string): MwuUnit | null {
    return this.mwuUnits.get(id) ?? null;
  }

  getGrammarUnitById(id: string): GrammarUnit | null {
    return this.grammarUnits.get(id) ?? null;
  }

  getSourceAssertionById(id: string): SourceAssertion | null {
    return this.assertions.get(id) ?? null;
  }

  /** Sense -> Lexeme. Null only when the sense id itself is unknown. */
  getLexemeOfSense(senseId: string): Lexeme | null {
    const sense = this.senses.get(senseId);
    if (sense === undefined) return null;
    return this.lexemes.get(sense.lexemeId) ?? null;
  }

  /** Form -> Lexeme. Null only when the form id itself is unknown. */
  getLexemeOfForm(formId: string): Lexeme | null {
    const form = this.forms.get(formId);
    if (form === undefined) return null;
    return this.lexemes.get(form.lexemeId) ?? null;
  }

  getFormsOfLexeme(lexemeId: string): QueryResult<readonly LexemeForm[]> {
    if (!this.lexemes.has(lexemeId)) return notFound(lexemeId);
    return found(this.formsByLexeme.get(lexemeId) ?? []);
  }

  getSensesOfLexeme(lexemeId: string): QueryResult<readonly Sense[]> {
    if (!this.lexemes.has(lexemeId)) return notFound(lexemeId);
    return found(this.sensesByLexeme.get(lexemeId) ?? []);
  }

  // ------------------------------------------------------ source assertions

  /** Assertions carrying this sense id, whatever object they target. */
  getSourceAssertionsForSense(senseId: string): QueryResult<readonly SourceAssertion[]> {
    if (!this.senses.has(senseId)) return notFound(senseId);
    return found(this.assertionsBySense.get(senseId) ?? []);
  }

  /**
   * Assertions addressed directly at a scheduled target.
   *
   * Grammar units resolve to an empty list: the published assertions cover
   * senses and MWU source units, never `GRAM-A1-*` ids.
   */
  getSourceAssertionsForTarget(targetId: string): QueryResult<readonly SourceAssertion[]> {
    if (!this.targetsByTargetId.has(targetId)) return notFound(targetId);
    return found(this.assertionsByTarget.get(targetId) ?? []);
  }

  // -------------------------------------------------------------- sequence

  /** Modules in curricular order. */
  getModulesInOrder(): readonly CurriculumModule[] {
    return this.data.modules;
  }

  /** Islands in global curricular order, across all modules. */
  getIslandsInOrder(): readonly Island[] {
    return this.data.islands;
  }

  getIslandsOfModule(moduleId: string): QueryResult<readonly Island[]> {
    // Named `curriculumModule`: `module` is reserved by the Next.js lint rules.
    const curriculumModule = this.modules.get(moduleId);
    if (curriculumModule === undefined) return notFound(moduleId);
    return found(
      curriculumModule.islandIds
        .map((id) => this.islands.get(id))
        .filter((value): value is Island => value !== undefined),
    );
  }

  getModuleById(id: string): CurriculumModule | null {
    return this.modules.get(id) ?? null;
  }

  getIslandById(id: string): Island | null {
    return this.islands.get(id) ?? null;
  }

  getStoryBlueprintById(id: string): StoryBlueprint | null {
    return this.stories.get(id) ?? null;
  }

  /** Every story blueprint in the single canonical A1 order. */
  getStoriesInSequence(): readonly StoryBlueprint[] {
    return this.data.storyBlueprints;
  }

  getStoriesOfIsland(islandId: string): QueryResult<readonly StoryBlueprint[]> {
    const island = this.islands.get(islandId);
    if (island === undefined) return notFound(islandId);
    return found(
      island.storyIds
        .map((id) => this.stories.get(id))
        .filter((value): value is StoryBlueprint => value !== undefined),
    );
  }

  // --------------------------------------------------------------- targets

  /** Resolve a scheduled target id to its allocation and registry object. */
  resolveTarget(targetId: string): ResolvedTarget | null {
    const allocation = this.targetsByTargetId.get(targetId);
    if (allocation === undefined) return null;
    return {
      targetType: allocation.targetType,
      targetId,
      allocation,
      sense: this.senses.get(targetId) ?? null,
      mwuUnit: this.mwuUnits.get(targetId) ?? null,
      grammarUnit: this.grammarUnits.get(targetId) ?? null,
    };
  }

  /** Where a target is introduced for the first and only time. */
  getFirstIntroduction(targetId: string): QueryResult<FirstIntroduction> {
    const allocation = this.targetsByTargetId.get(targetId);
    if (allocation === undefined) return notFound(targetId);
    const curriculumModule = this.modules.get(allocation.firstIntroductionModuleId);
    const island = this.islands.get(allocation.firstIntroductionIslandId);
    const story = this.stories.get(allocation.firstIntroductionStoryId);
    if (curriculumModule === undefined || island === undefined || story === undefined) {
      // Unreachable for a validated release; a corrupted registry must not be
      // reported as a plausible empty answer.
      throw new Error(
        `CURRICULUM_REFERENCE_NOT_FOUND: first introduction of ${targetId} points at a missing module, island or story`,
      );
    }
    return found({ targetId, allocation, module: curriculumModule, island, story });
  }

  getRecycleEdgesForTarget(targetId: string): QueryResult<readonly RecycleEdge[]> {
    const allocation = this.targetsByTargetId.get(targetId);
    if (allocation === undefined) return notFound(targetId);
    return found(
      allocation.recycleEdgeIds
        .map((id) => this.edgesById.get(id))
        .filter((value): value is RecycleEdge => value !== undefined),
    );
  }

  /** Introduction plus the ordered recycling legs scheduled for a target. */
  getRecyclePath(targetId: string): QueryResult<RecyclePath> {
    const introduction = this.getFirstIntroduction(targetId);
    if (introduction.status === "NOT_FOUND") return notFound(targetId);
    const edges = this.getRecycleEdgesForTarget(targetId);
    if (edges.status === "NOT_FOUND") return notFound(targetId);
    const steps: RecycleStep[] = [];
    for (const edge of edges.value) {
      const story = this.stories.get(edge.returnStoryId);
      if (story === undefined) {
        throw new Error(
          `CURRICULUM_REFERENCE_NOT_FOUND: recycle edge ${edge.id} points at missing story ${edge.returnStoryId}`,
        );
      }
      steps.push({ returnStage: edge.returnStage, edge, story });
    }
    return found({ targetId, introduction: introduction.value.story, steps });
  }

  /** Targets first introduced in a given story, in allocation order. */
  getTargetsIntroducedIn(storyId: string): QueryResult<readonly CurriculumTarget[]> {
    if (!this.stories.has(storyId)) return notFound(storyId);
    return found(
      this.data.targets.filter((value) => value.firstIntroductionStoryId === storyId),
    );
  }
}

export function createRegistry(
  release: CurriculumRelease,
  data: CurriculumData,
): CurriculumRegistry {
  return new CurriculumRegistry(release, data);
}
