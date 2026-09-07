/**
 * Public contract of the Learner Event / Progress Engine (engine phase 4).
 *
 * Downstream code (a future UI adapter, phase 5's persistence layer) should
 * import from here rather than reaching into `domain/`, `engine/`,
 * `repository/` or `runtime/` directly.
 *
 * Phase 4 scope: an event-first, append-only, reconstructible record of
 * learner interaction (`OCCURRENCE_OPENED`, `STATE_DECLARED`), lineage-aware
 * reattribution of historical events against the current lexicon release,
 * and projections (declared state, context history, content/evidence
 * progress) rebuilt on demand from the log. It deliberately does not
 * implement spaced repetition, an adaptive recommender, a computed mastery
 * formula, PostgreSQL persistence, auth or any UI. `event != current state`
 * throughout: nothing here is a mutable "current state" record.
 */

export type { LearnerProgressIdKind } from "./domain/ids.ts";
export { ID_PREFIXES, matchesIdPattern, asId } from "./domain/ids.ts";
export type { LearnerEventId, LearnerId } from "./domain/ids.ts";

export type { Clock, IdGenerator } from "./domain/ports.ts";

export type { DeclaredState } from "./domain/declared-state.ts";
export { DECLARED_STATES } from "./domain/declared-state.ts";

export type { LearnerEvent, LearnerEventType, OccurrenceOpenedEvent, StateDeclaredEvent } from "./domain/events.ts";
export { LEARNER_EVENT_TYPES, recordedLexemeOf } from "./domain/events.ts";

export type { AttributionStatus, LearnerEventAttribution } from "./domain/attribution.ts";
export { ATTRIBUTION_STATUSES } from "./domain/attribution.ts";

export type { ProjectionMetadata } from "./domain/projection-metadata.ts";
export { withoutCalculatedAt } from "./domain/projection-metadata.ts";

export type { ContextHistoryEntry, ContextHistoryProjection } from "./domain/context-history.ts";

export type {
  IslandProgress,
  ModuleProgress,
  ProgressProjection,
  StoryProgress,
  TargetCoverage,
} from "./domain/progress.ts";

export { compareLearnerEvents, sortedByOccurrence } from "./engine/ordering.ts";
export { recordOccurrenceOpened, recordStateDeclared } from "./engine/record-event.ts";
export type { EventValidationIssue, EventValidationResult } from "./engine/append-event.ts";
export { appendValidatedEvent, validateLearnerEvent } from "./engine/append-event.ts";
export type { AttributionContext } from "./engine/attribution-engine.ts";
export { resolveAttribution } from "./engine/attribution-engine.ts";
export type { DeclaredStateEntry, DeclaredStateProjection } from "./engine/declared-state-projection.ts";
export { buildDeclaredStateProjection } from "./engine/declared-state-projection.ts";
export { buildContextHistoryProjection } from "./engine/context-history-projection.ts";
export { buildProgressProjection } from "./engine/progress-projection.ts";

export type { LearnerEventRepository } from "./repository/learner-event-repository.ts";
export { InMemoryLearnerEventRepository } from "./repository/in-memory-learner-event-repository.ts";
export type { StorageLike } from "./repository/local-storage-learner-event-repository.ts";
export { DEFAULT_STORAGE_KEY, LocalStorageLearnerEventRepository } from "./repository/local-storage-learner-event-repository.ts";

export { RandomIdGenerator, SystemClock } from "./runtime/system-ports.ts";
