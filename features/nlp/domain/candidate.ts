/**
 * `AnnotationCandidate` — a proposal, never truth.
 *
 * The whole point of this feature (`docs/nlp-annotation-assistant.md` §1):
 *
 *   StoryVersion -> NLP analysis -> AnnotationCandidate[] -> canonical
 *   registry validation -> editorial review / deterministic acceptance ->
 *   StoryOccurrence / OccurrenceAnnotationRevision -> Publication Validator
 *
 * never `NLP -> publicación directa`. A candidate becoming `ACCEPTED` is
 * always an explicit call to `../review/acceptance-service.ts`'s
 * `acceptAnnotationCandidate` — never an automatic consequence of a
 * `confidence` value crossing a threshold (§40).
 *
 * `LEXICAL` candidates cover both a real `Lexeme`'s occurrence *and* a
 * `MWU_SOURCE_UNIT` target with lexical identity (`proposedLexemeId` set);
 * `CONSTRUCTION` candidates cover both grammar constructions and
 * `MWU_SOURCE_UNIT` targets *without* lexical identity
 * (`proposedMwuTargetId` set, `proposedLexemeId` absent) — see
 * `../engine/mwu-candidates.ts`. Neither kind ever mints a `Lexeme`, `Sense`
 * or `LexemeForm`: `proposedLexemeId`/`proposedSenseId`/`proposedFormId` are
 * always a reference to something the registries already publish, or `null`.
 */

import type { LexemeFormId, LexemeId, SenseId } from "../../curriculum/index.ts";
import type { SentenceId, StoryVersionId } from "../../story-engine/index.ts";
import type { AnnotationCandidateId } from "./ids.ts";
import type { AnalyzerProvenance } from "./provenance.ts";

export const CANDIDATE_TYPES = ["LEXICAL", "CONSTRUCTION"] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

/**
 * Mirrors `OccurrencePartRole` (`features/story-engine/domain/model.ts`) —
 * `HEAD`/`FIXED`/`CLITIC` for `LEXICAL`, `ANCHOR`/`SLOT` for `CONSTRUCTION`.
 * Kept as this feature's own type (not imported) because a candidate part is
 * not yet a real `OccurrencePart`: it names a *proposed* anchor, not a
 * `TextAnchorId` the Story Engine has issued.
 */
export const CANDIDATE_PART_ROLES = ["HEAD", "FIXED", "CLITIC", "ANCHOR", "SLOT"] as const;
export type CandidatePartRole = (typeof CANDIDATE_PART_ROLES)[number];

/**
 * A proposed anchor: `[start, end)` Unicode code point offsets into one
 * sentence's exact text — see `../domain/analysis.ts`'s offset contract.
 * Not a `TextAnchor`: no id has been minted, and nothing here is persisted
 * until `acceptAnnotationCandidate` builds a real occurrence from it.
 */
export type CandidatePart = {
  readonly sentenceId: SentenceId;
  readonly start: number;
  readonly end: number;
  readonly role: CandidatePartRole;
  readonly slotLabel: string | null;
};

/**
 * Resolution status for a `LEXICAL` candidate's identity — §28's priority
 * order, never surface-only: a published `LexemeForm` id match, else the set
 * of `Lexeme` candidates a published form suggests, else canonical-form
 * candidates (candidates gathered by lemma, unresolved to one form), else
 * unresolved. A homograph lemma (20 groups in the A1 lexicon) legitimately
 * produces more than one candidate at any resolved tier — `resolveLexicalCandidates`
 * (`../engine/lexical-resolution.ts`) never picks one on its own.
 */
export type LexicalFormMatch = { readonly lexemeFormId: LexemeFormId; readonly lexemeId: LexemeId };

export type LexicalResolution =
  | { readonly tier: "PUBLISHED_FORM"; readonly matches: readonly LexicalFormMatch[] }
  | { readonly tier: "LEXEME_CANDIDATES"; readonly lexemeIds: readonly LexemeId[] }
  | { readonly tier: "CANONICAL_FORM_CANDIDATES"; readonly lexemeIds: readonly LexemeId[] }
  | { readonly tier: "UNRESOLVED" };

/** One ranked `Sense` candidate — never a final answer, even when it is the only one published for a `Lexeme`. */
export type SenseCandidateEntry = {
  readonly senseId: SenseId;
  readonly rank: number;
};

export const CANDIDATE_STATUSES = ["CANDIDATE", "REVIEW_REQUIRED", "ACCEPTED", "REJECTED"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type AnnotationCandidate = {
  readonly candidateId: AnnotationCandidateId;
  readonly storyVersionId: StoryVersionId;
  readonly sentenceId: SentenceId;
  readonly candidateType: CandidateType;
  readonly parts: readonly CandidatePart[];

  readonly proposedLexemeId: LexemeId | null;
  readonly proposedSenseId: SenseId | null;
  readonly proposedFormId: LexemeFormId | null;
  /** `GRAM-A1-*`-shaped id, or `null`. Never a fabricated construction-as-Lexeme id. */
  readonly proposedGrammarTargetId: string | null;
  /** `*-MWU-*`-shaped id, or `null` — set whether or not the MWU has lexical identity. */
  readonly proposedMwuTargetId: string | null;

  /** Full candidate set behind `proposedLexemeId`, `LEXICAL` only; `null` for `CONSTRUCTION`. */
  readonly lexicalResolution: LexicalResolution | null;
  /** Ranked, never collapsed to one — `LEXICAL` only. */
  readonly senseCandidates: readonly SenseCandidateEntry[];
  /** Technical construction label (e.g. `"LLEVAR_DURATION_GERUND"`), `CONSTRUCTION` only. Never a curriculum id. */
  readonly constructionId: string | null;

  readonly confidence: number | null;
  /** Human-readable explanation of why this candidate was proposed — not a formula, a note. */
  readonly evidence: string;
  readonly sourceAdapter: string;
  readonly algorithmVersion: string;
  readonly provenance: AnalyzerProvenance;
  readonly status: CandidateStatus;

  /** The releases in force when this candidate was generated — never updated
   *  later; staleness is judged by comparing these to the *current* releases
   *  at acceptance time, not by mutating this field. See `../review/acceptance-service.ts`. */
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
};
