/**
 * `acceptAnnotationCandidate` — the *only* path from a proposal to something
 * the Story Engine recognises. Never automatic, never triggered by
 * `confidence` (§40): a caller decides to call this, once, per candidate —
 * "once" now enforced by `AnnotationDecisionRepository`
 * (`../domain/decision-repository.ts`), not by convention (Corrección B).
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
 *     the same mechanism a human editor's reannotation uses. Reannotating a
 *     `CONSTRUCTION` occurrence through this (lexical) path is refused
 *     (`CANDIDATE_REANNOTATION_KIND_MISMATCH`, Corrección D) rather than
 *     coerced with a type assertion.
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
 * Both outcomes are recorded exactly once in `ctx.decisionRepository`
 * *before* returning: a second `acceptAnnotationCandidate`/
 * `rejectAnnotationCandidate` call for the same `candidateId` — sequential,
 * concurrent, or after a crash — gets `CANDIDATE_ALREADY_DECIDED`
 * (`../domain/errors.ts`), never a second `StoryOccurrence`/
 * `OccurrenceAnnotationRevision`. See §17/§18 in the corrective task for the
 * exact ordering guarantees below.
 *
 * Rejection (`rejectAnnotationCandidate`) is the deliberate non-writing
 * counterpart: it never touches the Story Engine, but still consumes the
 * same exactly-once decision slot — an accepted candidate can never later be
 * rejected, or vice versa.
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
import type { AnnotationCandidateDecision } from "../domain/decision.ts";
import type { AnnotationDecisionRepository } from "../domain/decision-repository.ts";
import type { AnnotationAcceptanceUnitOfWork } from "../domain/acceptance-unit-of-work.ts";
import type { CurrentStoryVersionResolver } from "../domain/current-version.ts";

export type AcceptanceContext = {
  readonly storyRepository: StoryRepository;
  readonly registry: CurriculumRegistry;
  readonly currentCurriculumReleaseId: string;
  readonly currentLexiconReleaseId: string;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Corrección B — the single persisted authority over accept/reject; see module doc. */
  readonly decisionRepository: AnnotationDecisionRepository;
  /**
   * Corrección C — which `StoryVersion` the editorial workflow currently
   * authors against, per story. `null`/no entry fails closed
   * (`STALE_CANDIDATE`), never falls back to guessing "highest version
   * number" or "most recently created".
   */
  readonly currentStoryVersionResolver: CurrentStoryVersionResolver;
  /**
   * Corrección B §17 — when supplied, the `REVISION` path commits the
   * revision and its decision atomically (real crash safety on a
   * transactional backend). When absent, this falls back to a
   * decision-first-then-revision ordering directly against
   * `decisionRepository`/`storyRepository`: never two decisions, but a crash
   * between the two writes can leave a decision with no revision applied yet
   * (recoverable by replaying the stored `resultingRevisionId`, not by
   * generating a new one) rather than a duplicated revision.
   */
  readonly unitOfWork?: AnnotationAcceptanceUnitOfWork;
  /** Set only when this candidate re-interprets an occurrence the Story Engine already has. */
  readonly reannotatesOccurrenceId?: string;
  readonly reason?: string;
  readonly editorialReference?: string | null;
  /**
   * Corrección C §23 — by default, a candidate naming a `StoryVersion` that
   * is no longer the story's current editable version is `STALE_CANDIDATE`,
   * even for a reannotation. Set this (with a non-empty `editorialReference`)
   * only to explicitly authorize correcting a historical version's
   * annotation without changing its text — never enabled implicitly.
   */
  readonly historicalReannotationAuthorized?: boolean;
};

export type AcceptanceResult =
  | {
      readonly kind: "NEW_OCCURRENCE";
      readonly occurrence: StoryOccurrence;
      /** The real `TextAnchor`s the occurrence's parts reference — must be included
       *  (alongside `occurrence`) in the caller's next `saveNewVersion` call. */
      readonly anchors: readonly TextAnchor[];
      readonly targetBinding: StoryTargetBinding | null;
      readonly decision: AnnotationCandidateDecision;
    }
  | { readonly kind: "REVISION"; readonly revision: OccurrenceAnnotationRevision; readonly decision: AnnotationCandidateDecision };

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

/**
 * Corrección C — a `StoryVersion` existing (`storyRepository.getStoryVersion`
 * returning non-null) proves nothing about whether it is still the version
 * the editorial workflow is authoring against: a `StoryVersion` is
 * historical and immutable, so an old one goes on existing forever after a
 * newer one supersedes it. The real check, in `acceptAnnotationCandidate`
 * below, is against `ctx.currentStoryVersionResolver` — an authority NLP
 * never derives on its own (see `../domain/current-version.ts`). This helper
 * only formats the resulting failure.
 */
function failStaleVersion(candidate: AnnotationCandidate, currentEditableId: string | null): never {
  fail(
    "STALE_CANDIDATE",
    currentEditableId === null
      ? `storyVersion ${candidate.storyVersionId} cannot be accepted against: no current editable version has been designated for this story`
      : `storyVersion ${candidate.storyVersionId} is not the current editable version (current: ${currentEditableId})`,
    { recordId: candidate.candidateId, expected: currentEditableId ?? undefined, actual: candidate.storyVersionId },
  );
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

  // Corrección B — cheap early bail before any other work. The real,
  // race-proof exactly-once guarantee is `decisionRepository.recordAccepted`
  // itself (called below, after every validation and every id has been
  // generated) — this first check only avoids wasted work for the common
  // case of a plainly-already-decided candidate.
  const existingDecision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
  if (existingDecision !== null) {
    fail("CANDIDATE_ALREADY_DECIDED", `candidate ${candidate.candidateId} already has a recorded decision (${existingDecision.decision})`, {
      recordId: candidate.candidateId,
    });
  }

  assertNotStale(candidate, ctx);
  const currentVersion = await ctx.storyRepository.getStoryVersion(candidate.storyVersionId);
  if (currentVersion === null) {
    fail("STALE_CANDIDATE", `storyVersion ${candidate.storyVersionId} no longer exists`, {
      recordId: candidate.candidateId,
      referencedId: candidate.storyVersionId,
    });
  }

  // Corrección C — existence is not currency; see `assertCurrentEditableVersion` doc above.
  const currentEditableId = await ctx.currentStoryVersionResolver.currentEditableVersionId(currentVersion!.storyId);
  const isCurrent = currentEditableId !== null && currentEditableId === candidate.storyVersionId;
  const historicallyAuthorized =
    ctx.historicalReannotationAuthorized === true && ctx.editorialReference !== undefined && ctx.editorialReference !== null && ctx.editorialReference !== "";
  if (!isCurrent && !historicallyAuthorized) {
    failStaleVersion(candidate, currentEditableId);
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
    // Corrección D — never coerce a CONSTRUCTION occurrence into a LEXICAL
    // reannotation with a type assertion. `existing` narrows to
    // `LexicalOccurrence` below because every other branch of `kind` throws.
    if (existing!.kind !== "LEXICAL") {
      fail(
        "CANDIDATE_REANNOTATION_KIND_MISMATCH",
        `occurrence ${existing!.id} is a ${existing!.kind} occurrence; a LEXICAL reannotation candidate cannot reinterpret it`,
        { recordId: candidate.candidateId, referencedId: ctx.reannotatesOccurrenceId, expected: "LEXICAL", actual: existing!.kind },
      );
    }

    const revisionId = ctx.idGenerator.next("OccurrenceAnnotationRevisionId") as never;
    const revision = reviseOccurrenceAnnotation(
      revisionId,
      existing,
      {
        newLexemeId: candidate.proposedLexemeId as never,
        newSenseId: candidate.proposedSenseId as never,
        reason: ctx.reason ?? `NLP candidate ${candidate.candidateId} accepted (${candidate.sourceAdapter}/${candidate.algorithmVersion})`,
        lexiconReleaseId: ctx.currentLexiconReleaseId as never,
        editorialReference: ctx.editorialReference ?? null,
      },
      ctx.clock,
    );

    const decisionInput = {
      candidateId: candidate.candidateId,
      decidedAt: ctx.clock.now().toISOString(),
      reason: ctx.reason ?? `NLP candidate ${candidate.candidateId} accepted`,
      editorialReference: ctx.editorialReference ?? null,
      resultKind: "REVISION" as const,
      revisionId: revision.id,
    };

    // Corrección B §17 — decision-first (or atomic-with, when `unitOfWork`
    // is supplied) ordering: never append the revision before the decision
    // is durably exclusive, or two racing callers could both append one.
    // The decision-first fallback is only safe with a decision repository
    // that has no foreign key from the decision row to the revision row
    // (true of `InMemoryAnnotationDecisionRepository`) — a Postgres-backed
    // `decisionRepository` used without `unitOfWork` would violate its own
    // `resulting_revision_id` foreign key here, by design: that combination
    // is not a supported wiring (always supply `unitOfWork` alongside a
    // Postgres-backed decision repository for the REVISION path).
    const decision =
      ctx.unitOfWork !== undefined
        ? await ctx.unitOfWork.runRevisionAcceptance(revision, decisionInput)
        : await (async () => {
            const recorded = await ctx.decisionRepository.recordAccepted(decisionInput);
            await ctx.storyRepository.appendAnnotationRevision(revision);
            return recorded;
          })();

    return { kind: "REVISION", revision, decision };
  }

  const { occurrence, anchors } = buildOccurrence(candidate, resolvedTexts, sentencesById, ctx);
  const targetBinding = buildTargetBinding(candidate, occurrence, currentVersion!.storyId, ctx);

  // Corrección B §18 — the decision (and its materialization) is the only
  // persisted effect of this branch; `occurrence`/`anchors`/`targetBinding`
  // are handed back for the caller's next `saveNewVersion`, never written
  // here. Recording the decision first (exclusively) means a second
  // `acceptAnnotationCandidate` call for this candidate fails before it
  // could ever hand the caller a second, different set of ids.
  const decision = await ctx.decisionRepository.recordAccepted({
    candidateId: candidate.candidateId,
    decidedAt: ctx.clock.now().toISOString(),
    reason: ctx.reason ?? `NLP candidate ${candidate.candidateId} accepted (${candidate.sourceAdapter}/${candidate.algorithmVersion})`,
    editorialReference: ctx.editorialReference ?? null,
    resultKind: "NEW_OCCURRENCE",
    occurrenceId: occurrence.id,
    anchorIds: anchors.map((a) => a.id),
    targetBindingId: targetBinding?.id ?? null,
  });

  return { kind: "NEW_OCCURRENCE", occurrence, anchors, targetBinding, decision };
}

export type RejectedCandidate = { readonly candidateId: string; readonly reason: string; readonly rejectedAt: string };

/** Never touches the Story Engine — but still consumes the same exactly-once decision slot as acceptance. */
export async function rejectAnnotationCandidate(candidate: AnnotationCandidate, reason: string, clock: Clock, ctx: { readonly decisionRepository: AnnotationDecisionRepository }): Promise<RejectedCandidate> {
  if (candidate.status === "ACCEPTED" || candidate.status === "REJECTED") {
    fail("CANDIDATE_NOT_PENDING", `candidate ${candidate.candidateId} is already ${candidate.status}`, { recordId: candidate.candidateId });
  }
  const existingDecision = await ctx.decisionRepository.getByCandidateId(candidate.candidateId);
  if (existingDecision !== null) {
    fail("CANDIDATE_ALREADY_DECIDED", `candidate ${candidate.candidateId} already has a recorded decision (${existingDecision.decision})`, {
      recordId: candidate.candidateId,
    });
  }
  const rejectedAt = clock.now().toISOString();
  await ctx.decisionRepository.recordRejected({ candidateId: candidate.candidateId, decidedAt: rejectedAt, reason });
  return { candidateId: candidate.candidateId, reason, rejectedAt };
}
