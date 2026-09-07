/**
 * Public contract of the NLP / Annotation Assistant (engine phase 6).
 *
 * Downstream code should import from here rather than reaching into
 * `domain/`, `engine/`, `review/`, `adapters/` or `runtime/` directly.
 *
 * Phase 6 scope: analyze a `StoryVersion`'s sentences with a pluggable
 * `NlpAnalyzer`, turn the analysis into reviewable `AnnotationCandidate`s
 * (never automatically into published content — see
 * `docs/nlp-annotation-assistant.md`), and an explicit acceptance/rejection
 * service that is the only path from a candidate to a real
 * `StoryOccurrence`/`OccurrenceAnnotationRevision`. It deliberately does not
 * implement automatic Story generation or publication, a mastery model, an
 * LLM cloud API, or any UI.
 */

export type { NlpIdKind, AnnotationCandidateId } from "./domain/ids.ts";
export { ID_PREFIXES, matchesIdPattern, asId } from "./domain/ids.ts";

export type { NlpErrorCode, NlpIssue, NlpIssueContext } from "./domain/errors.ts";
export { NlpError, nlpIssue, formatNlpIssue } from "./domain/errors.ts";

export type { Clock, IdGenerator } from "./domain/ports.ts";

export type { AnalyzerProvenance } from "./domain/provenance.ts";
export type { NlpAnalysis, SentenceAnalysis, TokenAnalysis } from "./domain/analysis.ts";

export type {
  AnnotationCandidate,
  CandidatePart,
  CandidatePartRole,
  CandidateStatus,
  CandidateType,
  LexicalFormMatch,
  LexicalResolution,
  SenseCandidateEntry,
} from "./domain/candidate.ts";
export { CANDIDATE_PART_ROLES, CANDIDATE_STATUSES, CANDIDATE_TYPES } from "./domain/candidate.ts";

export { resolveLexicalCandidates, senseCandidatesFor } from "./engine/lexical-resolution.ts";
export { resolveMwuTargetByPhrase, resolveGrammarTargetByPhrase } from "./engine/mwu-candidates.ts";
export type {
  ConstructionMatch,
  ConstructionPattern,
  DiscontinuousMwuMatch,
  DiscontinuousMwuPattern,
  FusedCliticSplit,
} from "./engine/construction-rules.ts";
export {
  CONSTRUCTION_TABLE,
  DISCONTINUOUS_MWU_TABLE,
  FUSED_CLITIC_TABLE,
  detectConstructions,
  detectDiscontinuousMwus,
  detectFusedCliticSplit,
} from "./engine/construction-rules.ts";
export type { CandidateBuildContext } from "./engine/candidate-builder.ts";
export { buildAnnotationCandidates } from "./engine/candidate-builder.ts";

export type { AnalyzerSentenceInput, NlpAnalyzer } from "./adapters/analyzer.ts";
export { FakeAnalyzer, FAKE_ALGORITHM_VERSION, FAKE_ANALYZER_VERSION } from "./adapters/fake/fake-analyzer.ts";
export { SpaCyAnalyzer, BRIDGE_CONTRACT_VERSION, type SpaCyAnalyzerOptions } from "./adapters/spacy/spacy-analyzer.ts";

export type { AcceptanceContext, AcceptanceResult, RejectedCandidate } from "./review/acceptance-service.ts";
export { acceptAnnotationCandidate, rejectAnnotationCandidate } from "./review/acceptance-service.ts";

export type {
  AnnotationCandidateDecision,
  AcceptedOccurrenceMaterialization,
  DecisionKind,
  DecisionResultKind,
} from "./domain/decision.ts";
export { DECISION_KINDS, DECISION_RESULT_KINDS, effectiveReviewStatus } from "./domain/decision.ts";
export type { AnnotationDecisionRepository, RecordAcceptedInput, RecordRejectedInput } from "./domain/decision-repository.ts";
export type { CurrentStoryVersionResolver } from "./domain/current-version.ts";
export type { AnnotationAcceptanceUnitOfWork } from "./domain/acceptance-unit-of-work.ts";

export { InMemoryAnnotationDecisionRepository } from "./repository/in-memory-annotation-decision-repository.ts";
export { InMemoryCurrentStoryVersionResolver } from "./repository/in-memory-current-story-version-resolver.ts";
export { InMemoryAnnotationAcceptanceUnitOfWork } from "./repository/in-memory-annotation-acceptance-unit-of-work.ts";

export { RandomIdGenerator, SystemClock } from "./runtime/system-ports.ts";
