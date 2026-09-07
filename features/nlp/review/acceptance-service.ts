/**
 * `acceptAnnotationCandidate` — the *only* path from a proposal to something
 * the Story Engine recognises. Never automatic, never triggered by
 * `confidence` (§40): a caller decides to call this, once, per candidate.
 *
 * ```text
 * AnnotationCandidate --[this file]--> StoryOccurrence | OccurrenceAnnotationRevision
 * ```
 *
 * Two outcomes, matching §36 exactly:
 *
 *   - `ctx.reannotatesOccurrenceId` set: the candidate proposes a *different*
 *     interpretation of an occurrence the Story Engine already has. This
 *     path *does* write — `OccurrenceAnnotationRevision` via
 *     `reviseOccurrenceAnnotation`/`repository.appendAnnotationRevision`,
 *     the same mechanism a human editor's reannotation uses.
 *   - unset: the candidate proposes a *brand-new* occurrence. `StoryRepository`
 *     has no "append one occurrence to an existing version" method by design
 *     (`docs/story-engine-implementation.md` — a `StoryVersion`'s content is
 *     only ever written whole, via `saveNewVersion`) — so this path
 *     constructs the real `StoryOccurrence` (and, when the candidate names a
 *     curriculum target, a `StoryTargetBinding`) and returns it. It is never
 *     persisted here; whatever authoring workflow assembles the next
 *     `saveNewVersion` call is responsible for including it. This function
 *     never calls `saveNewVersion`, `markPublished` or `publishStoryVersion`
 *     — no `StoryVersion` text is ever touched, and nothing is ever
 *     auto-published.
 *
 * Rejection (`rejectAnnotationCandidate`) is the deliberate non-writing
 * counterpart: it never touches the Story Engine at all.
 */

import {
  createConstructionOccurrence,
  createLexicalOccurrence,
  createStoryTargetBinding,
  createTextAnchor,
  reviseOccurrenceAnnotation,
  resolveAnchorText,
  type Clock,
  type ConstructionOccurrence,
  type IdGenerator,
  type LexicalOccurrence,
  type OccurrenceAnnotationRevision,
  type StorySentence,
  type StoryOccurrence,
  type StoryRepository,
  type StoryTargetBinding,
  type TextAnchor,
} from "../../story-engine/index.ts";
import type { CurriculumRegistry } from "../../curriculum/index.ts";
import { NlpError, nlpIssue, type NlpIssue } from "../domain/errors.ts";
import type { AnnotationCandidate } from "../domain/candidate.ts";

export type AcceptanceContext = {
  readonly storyRepository: StoryRepository;
  readonly registry: CurriculumRegistry;
  readonly currentCurriculumReleaseId: string;
  readonly currentLexiconReleaseId: string;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Set only when this candidate re-interprets an occurrence the Story Engine already has. */
  readonly reannotatesOccurrenceId?: string;
  readonly reason?: string;
  readonly editorialReference?: string | null;
};

export type AcceptanceResult =
  | {
      readonly kind: "NEW_OCCURRENCE";
      readonly occurrence: StoryOccurrence;
      /** The real `TextAnchor`s the occurrence's parts reference — must be included
       *  (alongside `occurrence`) in the caller's next `saveNewVersion` call. */
      readonly anchors: readonly TextAnchor[];
      readonly targetBinding: StoryTargetBinding | null;
    }
  | { readonly kind: "REVISION"; readonly revision: OccurrenceAnnotationRevision };

function fail(code: NlpIssue["code"], reason: string, context: Parameters<typeof nlpIssue>[2] = {}): never {
  throw new NlpError([nlpIssue(code, reason, context)]);
}

/** §37 — a candidate generated against a different `StoryVersion`/release than what is current now is never silently accepted. */
function assertNotStale(candidate: AnnotationCandidate, ctx: AcceptanceContext): void {
  if (candidate.curriculumReleaseId !== ctx.currentCurriculumReleaseId) {
    fail("STALE_CANDIDATE", `candidate was generated against ${candidate.curriculumReleaseId}, current is ${ctx.currentCurriculumReleaseId}`, {
      recordId: candidate.candidateId,
      expected: ctx.currentCurriculumReleaseId,
      actual: candidate.curriculumReleaseId,
    });
  }
  if (candidate.lexiconReleaseId !== ctx.currentLexiconReleaseId) {
    fail("STALE_CANDIDATE", `candidate was generated against ${candidate.lexiconReleaseId}, current is ${ctx.currentLexiconReleaseId}`, {
      recordId: candidate.candidateId,
      expected: ctx.currentLexiconReleaseId,
      actual: candidate.lexiconReleaseId,
    });
  }
}

function assertReferencesStillExist(candidate: AnnotationCandidate, ctx: AcceptanceContext): void {
  const { registry } = ctx;
  if (candidate.proposedLexemeId !== null && registry.getLexemeById(candidate.proposedLexemeId) === null) {
    fail("CANDIDATE_UNKNOWN_REFERENCE", `proposedLexemeId ${candidate.proposedLexemeId} is not published`, {
      recordId: candidate.candidateId,
      referencedId: candidate.proposedLexemeId,
    });
  }
  if (candidate.proposedFormId !== null && registry.getFormById(candidate.proposedFormId) === null) {
    fail("CANDIDATE_UNKNOWN_REFERENCE", `proposedFormId ${candidate.proposedFormId} is not published`, {
      recordId: candidate.candidateId,
      referencedId: candidate.proposedFormId,
    });
  }
  if (candidate.proposedSenseId !== null) {
    const sense = registry.getSenseById(candidate.proposedSenseId);
    if (sense === null) {
      fail("CANDIDATE_UNKNOWN_REFERENCE", `proposedSenseId ${candidate.proposedSenseId} is not published`, {
        recordId: candidate.candidateId,
        referencedId: candidate.proposedSenseId,
      });
    }
    if (candidate.proposedLexemeId !== null && sense!.lexemeId !== candidate.proposedLexemeId) {
      fail(
        "CANDIDATE_SENSE_LEXEME_MISMATCH",
        `sense ${candidate.proposedSenseId} belongs to ${sense!.lexemeId}, not proposedLexemeId ${candidate.proposedLexemeId}`,
        { recordId: candidate.candidateId, referencedId: candidate.proposedSenseId },
      );
    }
  }
  for (const targetId of [candidate.proposedMwuTargetId, candidate.proposedGrammarTargetId]) {
    if (targetId !== null && registry.resolveTarget(targetId) === null) {
      fail("CANDIDATE_UNKNOWN_REFERENCE", `${targetId} is not a published curriculum target`, {
        recordId: candidate.candidateId,
        referencedId: targetId,
      });
    }
  }
}

/** §33 anchors out-of-bounds/overlap rejected: re-resolve every part's text against the *current* (immutable) sentence content. */
async function assertAnchorsStillResolve(
  candidate: AnnotationCandidate,
  ctx: AcceptanceContext,
): Promise<{ readonly resolvedTexts: Map<string, string>; readonly sentencesById: Map<string, StorySentence> }> {
  const sentences = await ctx.storyRepository.listSentences(candidate.storyVersionId);
  const sentencesById = new Map(sentences.map((s) => [s.id, s]));
  const resolvedTexts = new Map<string, string>();
  for (const part of candidate.parts) {
    const sentence = sentencesById.get(part.sentenceId);
    if (sentence === undefined) {
      fail("STALE_CANDIDATE", `sentence ${part.sentenceId} no longer belongs to storyVersion ${candidate.storyVersionId}`, {
        recordId: candidate.candidateId,
        referencedId: part.sentenceId,
      });
    }
    try {
      const text = resolveAnchorText(sentence!.text, { start: part.start, end: part.end });
      resolvedTexts.set(`${part.sentenceId}:${part.start}:${part.end}`, text);
    } catch {
      fail("CANDIDATE_ANCHOR_INVALID", `[${part.start}, ${part.end}) is out of bounds for sentence ${part.sentenceId}`, {
        recordId: candidate.candidateId,
        referencedId: part.sentenceId,
      });
    }
  }
  return { resolvedTexts, sentencesById };
}

function partSurface(candidate: AnnotationCandidate, resolvedTexts: Map<string, string>): string {
  return candidate.parts.map((p) => resolvedTexts.get(`${p.sentenceId}:${p.start}:${p.end}`) ?? "").join(" ");
}

function buildOccurrence(
  candidate: AnnotationCandidate,
  resolvedTexts: Map<string, string>,
  sentencesById: Map<string, StorySentence>,
  ctx: AcceptanceContext,
): { readonly occurrence: StoryOccurrence; readonly anchors: readonly TextAnchor[] } {
  const occurrenceId = ctx.idGenerator.next("StoryOccurrenceId") as never;
  const anchors: TextAnchor[] = [];
  const anchorFor = (part: AnnotationCandidate["parts"][number]): TextAnchor => {
    const anchor = createTextAnchor(
      ctx.idGenerator.next("TextAnchorId") as never,
      candidate.storyVersionId,
      sentencesById.get(part.sentenceId)!,
      { start: part.start, end: part.end },
    );
    anchors.push(anchor);
    return anchor;
  };

  const surface = partSurface(candidate, resolvedTexts);

  if (candidate.candidateType === "LEXICAL") {
    if (candidate.proposedLexemeId === null) {
      fail("CANDIDATE_UNKNOWN_REFERENCE", "a LEXICAL candidate cannot be accepted with no proposedLexemeId — resolve the ambiguity before accepting", {
        recordId: candidate.candidateId,
      });
    }
    const parts = candidate.parts.map((part) => ({
      id: ctx.idGenerator.next("OccurrencePartId") as never,
      anchor: anchorFor(part),
      role: part.role as "HEAD" | "FIXED" | "CLITIC",
    }));
    const occurrence = createLexicalOccurrence({
      id: occurrenceId,
      storyVersionId: candidate.storyVersionId,
      sentenceId: candidate.sentenceId,
      surface,
      lexemeId: candidate.proposedLexemeId as never,
      senseId: candidate.proposedSenseId as never,
      lexemeFormId: candidate.proposedFormId as never,
      senseResolutionStatus: candidate.proposedSenseId !== null ? "RESOLVED" : "UNRESOLVED",
      parts,
    }) satisfies LexicalOccurrence;
    return { occurrence, anchors };
  }

  if (candidate.constructionId === null) {
    fail("CANDIDATE_UNKNOWN_REFERENCE", "a CONSTRUCTION candidate cannot be accepted with no constructionId", { recordId: candidate.candidateId });
  }
  const parts = candidate.parts.map((part) => ({
    id: ctx.idGenerator.next("OccurrencePartId") as never,
    anchor: anchorFor(part),
    role: part.role as "ANCHOR" | "SLOT",
    slotLabel: part.slotLabel,
  }));
  const occurrence = createConstructionOccurrence({
    id: occurrenceId,
    storyVersionId: candidate.storyVersionId,
    sentenceId: candidate.sentenceId,
    surface,
    constructionId: candidate.constructionId,
    parts,
  }) satisfies ConstructionOccurrence;
  return { occurrence, anchors };
}

/**
 * Best-effort only: proposes a `FIRST_INTRO` binding whenever the candidate
 * names a resolved MWU/grammar target. It does not attempt to determine
 * whether this story is actually that target's scheduled first introduction
 * versus a return — that cross-check already exists, downstream, in
 * `validateStoryPublication` (`features/story-engine`), which every
 * accepted occurrence still has to pass before a `StoryVersion` can be
 * published. Acceptance is deliberately not publication (§36.7).
 */
function buildTargetBinding(candidate: AnnotationCandidate, occurrence: StoryOccurrence, storyId: string, ctx: AcceptanceContext): StoryTargetBinding | null {
  const targetId = candidate.proposedMwuTargetId ?? candidate.proposedGrammarTargetId;
  if (targetId === null) return null;
  const resolved = ctx.registry.resolveTarget(targetId)!;
  return createStoryTargetBinding({
    id: ctx.idGenerator.next("StoryTargetBindingId") as never,
    storyId: storyId as never,
    storyVersionId: occurrence.storyVersionId,
    occurrenceId: occurrence.id,
    targetType: resolved.targetType,
    targetId,
    bindingKind: "FIRST_INTRO",
    salience: resolved.allocation.introSalience,
  });
}

export async function acceptAnnotationCandidate(candidate: AnnotationCandidate, ctx: AcceptanceContext): Promise<AcceptanceResult> {
  if (candidate.status === "ACCEPTED" || candidate.status === "REJECTED") {
    fail("CANDIDATE_NOT_PENDING", `candidate ${candidate.candidateId} is already ${candidate.status}`, { recordId: candidate.candidateId });
  }

  assertNotStale(candidate, ctx);
  const currentVersion = await ctx.storyRepository.getStoryVersion(candidate.storyVersionId);
  if (currentVersion === null) {
    fail("STALE_CANDIDATE", `storyVersion ${candidate.storyVersionId} no longer exists`, {
      recordId: candidate.candidateId,
      referencedId: candidate.storyVersionId,
    });
  }
  assertReferencesStillExist(candidate, ctx);
  const { resolvedTexts, sentencesById } = await assertAnchorsStillResolve(candidate, ctx);

  if (ctx.reannotatesOccurrenceId !== undefined) {
    const existing = await ctx.storyRepository.getOccurrence(ctx.reannotatesOccurrenceId as never);
    if (existing === null) {
      fail("STALE_CANDIDATE", `occurrence ${ctx.reannotatesOccurrenceId} no longer exists`, {
        recordId: candidate.candidateId,
        referencedId: ctx.reannotatesOccurrenceId,
      });
    }
    const revision = reviseOccurrenceAnnotation(
      ctx.idGenerator.next("OccurrenceAnnotationRevisionId") as never,
      existing as LexicalOccurrence,
      {
        newLexemeId: candidate.proposedLexemeId as never,
        newSenseId: candidate.proposedSenseId as never,
        reason: ctx.reason ?? `NLP candidate ${candidate.candidateId} accepted (${candidate.sourceAdapter}/${candidate.algorithmVersion})`,
        lexiconReleaseId: ctx.currentLexiconReleaseId as never,
        editorialReference: ctx.editorialReference ?? null,
      },
      ctx.clock,
    );
    await ctx.storyRepository.appendAnnotationRevision(revision);
    return { kind: "REVISION", revision };
  }

  const { occurrence, anchors } = buildOccurrence(candidate, resolvedTexts, sentencesById, ctx);
  const targetBinding = buildTargetBinding(candidate, occurrence, currentVersion!.storyId, ctx);
  return { kind: "NEW_OCCURRENCE", occurrence, anchors, targetBinding };
}

export type RejectedCandidate = { readonly candidateId: string; readonly reason: string; readonly rejectedAt: string };

/** Pure — never touches the Story Engine. A rejected candidate can never contaminate the published domain. */
export function rejectAnnotationCandidate(candidate: AnnotationCandidate, reason: string, clock: Clock): RejectedCandidate {
  if (candidate.status === "ACCEPTED" || candidate.status === "REJECTED") {
    fail("CANDIDATE_NOT_PENDING", `candidate ${candidate.candidateId} is already ${candidate.status}`, { recordId: candidate.candidateId });
  }
  return { candidateId: candidate.candidateId, reason, rejectedAt: clock.now().toISOString() };
}
