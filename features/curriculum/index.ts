/**
 * Public contract of the curriculum feature (engine phase 1).
 *
 * Downstream phases should import from here rather than reaching into the
 * internals: the file layout below the feature boundary is not a contract, the
 * exports on this line are.
 *
 * Phase 1 scope: importing the published A1 curriculum into a validated,
 * reproducible registry and querying it. It deliberately does not implement the
 * Lexical Engine, the Story Engine, learner progress or persistence.
 */

export type {
  CurriculumErrorCode,
  CurriculumIssue,
  CurriculumIssueContext,
} from "./domain/errors.ts";
export { CurriculumImportError, formatIssue } from "./domain/errors.ts";

export type {
  AllocationId,
  CurriculumTargetId,
  GrammarUnitId,
  IslandId,
  LexemeFormId,
  LexemeId,
  ModuleId,
  MwuUnitId,
  RecycleEdgeId,
  SenseId,
  SourceAssertionId,
  StoryBlueprintId,
} from "./domain/ids.ts";
export { ID_PATTERNS, classifyTargetId, matchesIdPattern } from "./domain/ids.ts";

export type {
  CurriculumData,
  CurriculumModule,
  CurriculumTarget,
  GrammarUnit,
  Island,
  Lexeme,
  LexemeForm,
  LexemeType,
  LevelCode,
  MwuUnit,
  RecycleEdge,
  RecycleEdgeType,
  RecycleStage,
  Sense,
  SenseStatus,
  SourceAssertion,
  StoryBlueprint,
  TargetType,
} from "./domain/model.ts";
export { LEVEL_CODE, RECYCLE_STAGE_BY_EDGE_TYPE } from "./domain/model.ts";

export type {
  CountCheck,
  CurriculumRelease,
  SourceFileManifest,
  ValidationResult,
} from "./domain/release.ts";
export { REGISTRY_SCHEMA_VERSION } from "./domain/release.ts";

export type { CurriculumImportResult, ImportOptions } from "./import/importer.ts";
export {
  CANONICAL_SOURCE_DIR,
  computeContentHash,
  importCurriculum,
  importCurriculumOrThrow,
} from "./import/importer.ts";
export { ARCHITECTURE_EXPECTED_COUNTS } from "./import/expectations.ts";
export { CANONICAL_SOURCES } from "./import/sources.ts";

export { COLLECTION_FILES, REGISTRY_DIR, RELEASE_FILE } from "./registry/files.ts";
export type { LoadedRegistry, WrittenFile } from "./registry/serialize.ts";
export { readRegistry, writeRegistry } from "./registry/serialize.ts";

export type {
  FirstIntroduction,
  QueryResult,
  RecyclePath,
  RecycleStep,
  ResolvedTarget,
} from "./registry/query.ts";
export { CurriculumRegistry, createRegistry } from "./registry/query.ts";

import { readRegistry } from "./registry/serialize.ts";
import { createRegistry, type CurriculumRegistry } from "./registry/query.ts";
import { REGISTRY_DIR } from "./registry/files.ts";

/**
 * Load the generated registry from disk and index it for querying.
 *
 * Node-side only (it reads files). Never call this per request in a UI path:
 * load once at module scope, or import the generated JSON directly.
 */
export function loadCurriculumRegistry(
  inputDir: string = REGISTRY_DIR,
): CurriculumRegistry {
  const { release, data } = readRegistry(inputDir);
  return createRegistry(release, data);
}
