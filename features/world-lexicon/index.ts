/**
 * Public contract of World Lexicon: vocabulary interaction inside 3D worlds.
 *
 * A learner taps an object in a story scene, hears its Spanish word, types it,
 * and a correct answer saves the word. This feature owns the HOST side of that
 * loop (validation, evidence, saving). The 3D viewer only collects taps and
 * typed text and never decides correctness, progress or mastery.
 *
 *   WorldLexiconMap     editorial map: 3D object groups → published SenseId
 *   NounAnnotation      editorial gender, because the published registry has none
 *   evaluateAttempt     the single validation authority (tildes, articles, spacing)
 *   WorldLexiconService attempts → KnowledgeEvent (PRACTICE/SAVED) + PracticeItem
 *   HostBridge          strict postMessage bridge for an iframe-hosted viewer
 *
 * `answering != knowing`: a correct answer is written-form evidence. It never
 * declares KNOWN and never sets a mastery value.
 */

export type { AccentPolicy, ArticleForm, AttemptExpectation, AttemptOutcome, AttemptReason, AttemptVerdict } from "./domain/attempt.ts";
export { ACCENT_POLICIES, ARTICLE_FORMS, MAX_TYPED_LENGTH, evaluateAttempt, isArticleForm, normalizeTyped } from "./domain/attempt.ts";

export type { LexiconLookup, SenseFacts } from "./domain/lexicon-lookup.ts";
export { CANONICAL_RELATION, createLexiconLookup } from "./domain/lexicon-lookup.ts";

export type {
  WorldLexiconEntry,
  WorldLexiconIssue,
  WorldLexiconIssueCode,
  WorldLexiconMap,
  WorldLexiconMapResult,
  WorldObjectSelector,
} from "./domain/scene-map.ts";
export { WORLD_LEXICON_MAP_VERSION, validateWorldLexiconMap } from "./domain/scene-map.ts";

export type { NounAnnotation, NounAnnotationIndex, NounAnnotationIssue, NounGender } from "./editorial/noun-annotations.ts";
export {
  ARTICLES_BY_GENDER,
  PILOT_NOUN_ANNOTATIONS,
  acceptedArticlesFor,
  articlesAreGenderConsistent,
  createNounAnnotationIndex,
  validateNounAnnotations,
} from "./editorial/noun-annotations.ts";

export type {
  AttemptRequest,
  AttemptResponse,
  SavedStatus,
  WorldKnowledgeEvent,
  WorldKnowledgePort,
  WorldLexiconErrorCode,
  WorldLexiconService,
  WorldSavedWordsPort,
} from "./engine/service.ts";
export { WorldLexiconError, createSavedWordsPort, createWorldLexiconService } from "./engine/service.ts";

export type { AttemptRequestMessage, HostBridge, HostBridgeEvent, HostReplyMessage } from "./bridge/protocol.ts";
export {
  WORLD_LEXICON_CHANNEL,
  WORLD_LEXICON_PROTOCOL_VERSION,
  createHostBridge,
  parseAttemptMessage,
} from "./bridge/protocol.ts";
