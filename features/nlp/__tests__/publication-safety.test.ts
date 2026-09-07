/**
 * §41 "Publication safety" (items 27-34): proves two distinct things.
 *
 *   27-28: acceptance is never publication. An NLP-produced `StoryOccurrence`/
 *   `StoryTargetBinding` that would violate a curricular rule (an A2-boundary
 *   sense published as A1, a regional-receptive target claimed
 *   `UNIVERSAL`-productive) still gets caught by the *existing*,
 *   unmodified `validateStoryPublication` — this feature adds no exception
 *   for content it itself proposed. Both use real published ids
 *   (`SENSE-A1-000075` A2-boundary, `SENSE-A1-000418` regional-receptive —
 *   the same ones `features/story-engine/__tests__/publication-validator.test.ts`
 *   already exercises).
 *
 *   29-34: `acceptAnnotationCandidate` itself refuses corrupt/stale input
 *   before it ever reaches the Story Engine.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptAnnotationCandidate,
  asId as asNlpId,
  InMemoryAnnotationDecisionRepository,
  InMemoryCurrentStoryVersionResolver,
  type AnnotationCandidate,
  type AcceptanceContext,
} from "../index.ts";
import {
  asId as asStoryId,
  createStoryTargetBinding,
  validateStoryPublication,
  type PublicationContext,
  type SentenceId,
  type StoryVersionId,
} from "../../story-engine/index.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { registry, lexicalEngine, FixedClock, SequentialIdGenerator, buildStoryWithSentences } from "./fixtures.ts";

const clock = new FixedClock();

function baseCandidate(overrides: Partial<AnnotationCandidate>): AnnotationCandidate {
  return {
    candidateId: asNlpId("AnnotationCandidateId", "nlpcand-1"),
    storyVersionId: asStoryId("StoryVersionId", "storyver-does-not-exist"),
    sentenceId: asStoryId("SentenceId", "sent-1"),
    candidateType: "LEXICAL",
    parts: [{ sentenceId: asStoryId("SentenceId", "sent-1"), start: 0, end: 4, role: "HEAD", slotLabel: null }],
    proposedLexemeId: "LEX-A1-000001" as never,
    proposedSenseId: null,
    proposedFormId: null,
    proposedGrammarTargetId: null,
    proposedMwuTargetId: null,
    lexicalResolution: null,
    senseCandidates: [],
    constructionId: null,
    confidence: null,
    evidence: "test fixture",
    sourceAdapter: "test",
    algorithmVersion: "test/1.0.0",
    provenance: { analyzer: "test", analyzerVersion: "1.0.0", modelName: null, modelVersion: null, algorithmVersion: "1.0.0", createdAt: clock.now().toISOString() },
    status: "CANDIDATE",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    ...overrides,
  };
}

async function acceptanceContextFor(sentenceText: string): Promise<{ readonly ctx: AcceptanceContext; readonly storyVersionId: StoryVersionId; readonly sentenceId: SentenceId }> {
  const ids = new SequentialIdGenerator();
  const { repo, storyId, storyVersionId, sentences } = await buildStoryWithSentences([sentenceText], ids, clock);
  const currentStoryVersionResolver = new InMemoryCurrentStoryVersionResolver();
  currentStoryVersionResolver.setCurrentEditableVersion(storyId, storyVersionId);
  const ctx: AcceptanceContext = {
    storyRepository: repo,
    registry,
    currentCurriculumReleaseId: registry.release.releaseId,
    currentLexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    idGenerator: ids,
    clock,
    decisionRepository: new InMemoryAnnotationDecisionRepository(),
    currentStoryVersionResolver,
  };
  return { ctx, storyVersionId, sentenceId: sentences[0].id };
}

describe("nlp / publication safety", () => {
  test("27. an A2-boundary sense candidate, even accepted, cannot be published as A1", async () => {
    const binding = createStoryTargetBinding({
      id: asStoryId("StoryTargetBindingId", "bind-a2"),
      storyId: asStoryId("StoryId", "story-1"),
      storyVersionId: asStoryId("StoryVersionId", "storyver-1"),
      occurrenceId: asStoryId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-000015",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
    });
    const sentences = [{ id: asStoryId("SentenceId", "sent-1"), storyVersionId: asStoryId("StoryVersionId", "storyver-1"), order: 1, text: "x", tokens: [] }];
    const story = { id: asStoryId("StoryId", "story-1"), storyBlueprintId: "A1-M01-I05-S1" as never, status: "DRAFT" as const, createdAt: clock.now().toISOString() };
    const version = { id: asStoryId("StoryVersionId", "storyver-1"), storyId: story.id, versionNumber: 1, title: "T", text: "x", status: "DRAFT" as const, createdAt: clock.now().toISOString(), publishedAt: null };
    const occurrence = {
      kind: "LEXICAL" as const,
      id: asStoryId("StoryOccurrenceId", "occ-1"),
      storyVersionId: version.id,
      sentenceId: sentences[0].id,
      surface: "x",
      lexemeId: "LEX-A1-000015" as never,
      senseId: "SENSE-A1-000075" as never, // A2_BOUNDARY_NOT_A1, per features/story-engine's own fixture
      lexemeFormId: null,
      senseResolutionStatus: "RESOLVED" as const,
      parts: [],
    };
    const ctx: PublicationContext = {
      story,
      storyVersion: version,
      sentences,
      anchors: [],
      occurrences: [occurrence],
      targetBindings: [{ ...binding, targetId: "SENSE-A1-000015" }],
      curriculumRegistry: registry,
      lexicalEngine,
    };
    const result = validateStoryPublication(ctx);
    assert.equal(result.status, "INVALID");
    assert.ok(result.status === "INVALID" && result.issues.some((i) => i.code === "A2_BOUNDARY_PUBLISHED_AS_A1"));
  });

  test("28. a regional-receptive target can never be accepted with a UNIVERSAL productive claim", () => {
    // SENSE-A1-000418 ("okay") is regional-receptive, first introduced FOCUS in A1-M01-I05-S4 (real published data).
    const binding = createStoryTargetBinding({
      id: asStoryId("StoryTargetBindingId", "bind-regional"),
      storyId: asStoryId("StoryId", "story-1"),
      storyVersionId: asStoryId("StoryVersionId", "storyver-1"),
      occurrenceId: asStoryId("StoryOccurrenceId", "occ-1"),
      targetType: "SENSE",
      targetId: "SENSE-A1-000418",
      bindingKind: "FIRST_INTRO",
      salience: "FOCUS",
      productiveClaim: "UNIVERSAL",
    });
    const story = { id: asStoryId("StoryId", "story-1"), storyBlueprintId: "A1-M01-I05-S4" as never, status: "DRAFT" as const, createdAt: clock.now().toISOString() };
    const version = { id: asStoryId("StoryVersionId", "storyver-1"), storyId: story.id, versionNumber: 1, title: "T", text: "x", status: "DRAFT" as const, createdAt: clock.now().toISOString(), publishedAt: null };
    const ctx: PublicationContext = {
      story,
      storyVersion: version,
      sentences: [],
      anchors: [],
      occurrences: [],
      targetBindings: [binding],
      curriculumRegistry: registry,
      lexicalEngine,
    };
    const result = validateStoryPublication(ctx);
    assert.equal(result.status, "INVALID");
    assert.ok(result.status === "INVALID" && result.issues.some((i) => i.code === "TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM"));
  });

  test("29. invalid Lexeme ID candidate no puede aceptarse", async () => {
    const { ctx, storyVersionId, sentenceId } = await acceptanceContextFor("hola mundo");
    const candidate = baseCandidate({ storyVersionId, sentenceId, proposedLexemeId: "LEX-DOES-NOT-EXIST" as never, parts: [{ sentenceId, start: 0, end: 4, role: "HEAD", slotLabel: null }] });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_UNKNOWN_REFERENCE/);
  });

  test("30. invalid Sense ID candidate no puede aceptarse", async () => {
    const { ctx, storyVersionId, sentenceId } = await acceptanceContextFor("hola mundo");
    const candidate = baseCandidate({
      storyVersionId,
      sentenceId,
      proposedLexemeId: "LEX-A1-000001" as never,
      proposedSenseId: "SENSE-DOES-NOT-EXIST" as never,
      parts: [{ sentenceId, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_UNKNOWN_REFERENCE/);
  });

  test("31. Sense/Lexeme mismatch rechazado", async () => {
    const { ctx, storyVersionId, sentenceId } = await acceptanceContextFor("hola mundo");
    // SENSE-A1-000015 belongs to LEX-A1-000015, not LEX-A1-000001.
    const candidate = baseCandidate({
      storyVersionId,
      sentenceId,
      proposedLexemeId: "LEX-A1-000001" as never,
      proposedSenseId: "SENSE-A1-000015" as never,
      parts: [{ sentenceId, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_SENSE_LEXEME_MISMATCH/);
  });

  test("32. anchors fuera de bounds rechazados", async () => {
    const { ctx, storyVersionId, sentenceId } = await acceptanceContextFor("hola");
    const candidate = baseCandidate({ storyVersionId, sentenceId, parts: [{ sentenceId, start: 0, end: 999, role: "HEAD", slotLabel: null }] });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /CANDIDATE_ANCHOR_INVALID/);
  });

  test("33. overlap interno rechazado", async () => {
    const { ctx, storyVersionId, sentenceId } = await acceptanceContextFor("hola mundo");
    const candidate = baseCandidate({
      storyVersionId,
      sentenceId,
      parts: [
        { sentenceId, start: 0, end: 4, role: "HEAD", slotLabel: null },
        { sentenceId, start: 2, end: 6, role: "FIXED", slotLabel: null },
      ],
    });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /PART_OVERLAP/);
  });

  test("34. candidate de StoryVersion vieja (ya no existe) rechazado", async () => {
    const { ctx, sentenceId } = await acceptanceContextFor("hola mundo");
    const candidate = baseCandidate({
      storyVersionId: asStoryId("StoryVersionId", "storyver-superseded"),
      sentenceId,
      parts: [{ sentenceId, start: 0, end: 4, role: "HEAD", slotLabel: null }],
    });
    await assert.rejects(() => acceptAnnotationCandidate(candidate, ctx), /STALE_CANDIDATE/);
  });
});
