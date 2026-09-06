/**
 * Public contract of the lexical engine (engine phase 2).
 *
 * UI and other features import from here. The file layout below this boundary
 * is not a contract; the exports on this line are.
 *
 * Phase 2 scope: resolving lexical identity and relations over the canonical
 * curriculum registry produced in phase 1 — Lexeme/Form/Sense resolution by
 * published id, MWU lexical identity where it exists, homograph grouping,
 * pronominality and lifecycle as an annotation layer, typed lexical relations,
 * and lexeme lineage with its validation rules.
 *
 * It deliberately does not implement the Story Engine, learner events, mastery,
 * NLP, dictionary import or persistence. `StoryOccurrence` and `TextAnchor` are
 * phase 3; `LearnerEventAttribution` and `UserLexemeState` are phase 4.
 */

export type {
  LexicalErrorCode,
  LexicalIssue,
  LexicalIssueContext,
  LexicalIssueSeverity,
} from "./domain/errors.ts";
export { LexicalEngineError, formatLexicalIssue, lexicalIssue } from "./domain/errors.ts";

export type {
  HomographGroupId,
  LexicalIdKind,
  LexicalRelationId,
  LexiconReleaseId,
  LineageEventId,
} from "./domain/ids.ts";
export {
  LEXICAL_ID_PATTERNS,
  asLexicalId,
  matchesLexicalIdPattern,
} from "./domain/ids.ts";

export type {
  AnnotationAuthority,
  LexemeLifecycleStatus,
  LexicalIdentity,
  Pronominality,
} from "./domain/identity.ts";
export {
  ANNOTATION_AUTHORITIES,
  LEXEME_LIFECYCLE_STATUSES,
  PRONOMINALITY_VALUES,
  isUnauthorizedClassification,
  publishedIdentity,
} from "./domain/identity.ts";

export type {
  HomographBasis,
  HomographGroup,
  HomographMember,
} from "./domain/homograph.ts";
export { HOMOGRAPH_BASES, isSamePosGroup } from "./domain/homograph.ts";

export type {
  LexicalRelation,
  LexicalRelationType,
  RelationBasis,
} from "./domain/relations.ts";
export {
  LEXICAL_RELATION_TYPES,
  RELATION_BASES,
  SYMMETRIC_RELATION_TYPES,
  isSymmetric,
} from "./domain/relations.ts";

export type {
  LexemeLineageEvent,
  LineageEventKind,
  LineageSemantics,
  TransferPolicy,
} from "./domain/lineage.ts";
export {
  ALLOWED_TRANSFER_POLICIES,
  LINEAGE_CARDINALITY,
  LINEAGE_EVENT_KINDS,
  LINEAGE_SEMANTICS,
  TRANSFER_POLICIES,
  lifecycleAfterEvent,
} from "./domain/lineage.ts";

export type { LexiconRelease } from "./domain/release.ts";
export { LEXICON_SCHEMA_VERSION } from "./domain/release.ts";

export type { LexicalResult, MwuIdentityResult } from "./domain/result.ts";
export { expectFound, found, isFound, notFound } from "./domain/result.ts";

export type { LineageResolution, LineageValidation } from "./engine/lineage-graph.ts";
export { LineageGraph, validateLineage } from "./engine/lineage-graph.ts";

export {
  canonicalFormOf,
  deriveHomographGroups,
  deriveHomographRelations,
} from "./engine/annotations.ts";

export type { LexicalEngineOptions } from "./engine/lexicon.ts";
export {
  CURRENT_LEXICON_RELEASE_ID,
  LexicalEngine,
  createLexicalEngine,
} from "./engine/lexicon.ts";

import { loadCurriculumRegistry } from "../curriculum/index.ts";
import {
  LexicalEngine,
  type LexicalEngineOptions,
} from "./engine/lexicon.ts";

/**
 * Load the generated curriculum registry and build the lexical engine over it.
 *
 * Node-side only (it reads files). Never call this per request in a UI path:
 * build it once at module scope. Callers that already hold a registry should
 * use `createLexicalEngine` instead of loading a second copy.
 */
export function loadLexicalEngine(
  options: LexicalEngineOptions = {},
): LexicalEngine {
  return new LexicalEngine(loadCurriculumRegistry(), options);
}
