/**
 * Public contract of the Story Engine (engine phase 3).
 *
 * Downstream code (phase 4's learner-progress, UI adapters) should import
 * from here rather than reaching into `domain/`, `engine/`, `validation/` or
 * `repository/` directly — the file layout below this boundary is not a
 * contract, the exports on this line are.
 *
 * Phase 3 scope: a versioned, publishable domain for narrative content and
 * its lexical/grammatical annotations — `Story`, `StoryVersion`, `TextAnchor`,
 * `StoryOccurrence` (contiguous and discontinuous), `OccurrenceAnnotationRevision`,
 * `StoryTargetBinding`, and the publication validator that ties them to the
 * curriculum and lexical-engine registries. It deliberately does not
 * implement learner events, mastery, NLP, automatic Story generation,
 * authoring of the 32 canonical A1 stories, or persistence — those are
 * phases 4-6 (`docs/architecture/plan-implementacion-motor-v1.0.md`).
 */

export type { StoryEngineIdKind } from "./domain/ids.ts";
export { ID_PREFIXES, matchesIdPattern, asId } from "./domain/ids.ts";
export type {
  StoryId,
  StoryVersionId,
  SentenceId,
  SurfaceTokenId,
  TextAnchorId,
  StoryOccurrenceId,
  OccurrencePartId,
  OccurrenceAnnotationRevisionId,
  StoryTargetBindingId,
} from "./domain/ids.ts";

export type { StoryEngineErrorCode, StoryEngineIssue, StoryEngineIssueContext } from "./domain/errors.ts";
export { StoryEngineError, storyEngineIssue, formatStoryEngineIssue } from "./domain/errors.ts";

export type { Clock, IdGenerator } from "./domain/ports.ts";

export type { AnchorBounds, AnchorValidation } from "./domain/anchors.ts";
export { boundsOverlap, codePointLength, resolveAnchorText, validateAnchorBounds } from "./domain/anchors.ts";

export type {
  ConstructionOccurrence,
  ConstructionPartRole,
  LexicalOccurrence,
  LexicalPartRole,
  OccurrenceAnnotationRevision,
  OccurrencePart,
  OccurrencePartRole,
  ProductiveClaim,
  SenseResolutionStatus,
  Story,
  StoryOccurrence,
  StorySentence,
  StoryStatus,
  StoryTargetBinding,
  StoryTargetBindingKind,
  StoryVersion,
  SurfaceToken,
  TextAnchor,
} from "./domain/model.ts";
export {
  CONSTRUCTION_PART_ROLES,
  LEXICAL_PART_ROLES,
  PRODUCTIVE_CLAIMS,
  SENSE_RESOLUTION_STATUSES,
  STORY_STATUSES,
  STORY_TARGET_BINDING_KINDS,
} from "./domain/model.ts";

export {
  assembleStoryVersion,
  createConstructionOccurrence,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
  nextVersionNumber,
  publishStoryVersion,
  resolvePartText,
} from "./engine/story-service.ts";

export { effectiveAnnotationOf, reviseOccurrenceAnnotation } from "./engine/annotation-revision.ts";

export { createStoryTargetBinding } from "./engine/target-binding.ts";

export type {
  PublicationContext,
  PublicationIssue,
  PublicationIssueCode,
  PublicationValidationResult,
} from "./validation/publication-validator.ts";
export { validateStoryPublication } from "./validation/publication-validator.ts";

export type { NewVersionInput, StoryRepository } from "./repository/story-repository.ts";
export { InMemoryStoryRepository } from "./repository/in-memory-story-repository.ts";

export { RandomIdGenerator, SystemClock } from "./runtime/system-ports.ts";
