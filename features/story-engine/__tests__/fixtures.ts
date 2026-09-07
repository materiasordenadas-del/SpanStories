/**
 * Shared test fixtures for the Story Engine test suite.
 *
 * Mirrors the curriculum/lexical-engine test convention: identity/publication
 * tests assert against the real committed A1 registry (`loadCurriculumRegistry`,
 * `loadLexicalEngine`), built once at module scope, because the claims they
 * make are about published data — a synthetic fixture would prove nothing
 * about whether the Story Engine actually composes with the real curriculum.
 * Corruption/unit tests that need to control every input use the synthetic
 * builders below instead.
 */

import { loadCurriculumRegistry, type CurriculumRegistry, type LexemeId } from "../../curriculum/index.ts";
import { loadLexicalEngine, LexicalEngine } from "../../lexical-engine/index.ts";
import type { Clock, IdGenerator } from "../domain/ports.ts";
import { asId, ID_PREFIXES, type StoryEngineIdKind } from "../domain/ids.ts";
import { createLexicalOccurrence, createTextAnchor } from "../engine/story-service.ts";
import { createStoryTargetBinding } from "../engine/target-binding.ts";
import type {
  StorySentence,
  StoryOccurrence,
  StoryTargetBinding,
  TextAnchor,
} from "../domain/model.ts";
import type { SentenceId, StoryId, StoryVersionId } from "../domain/ids.ts";

export const registry: CurriculumRegistry = loadCurriculumRegistry();
export const lexicalEngine: LexicalEngine = loadLexicalEngine();

/** A lexeme every fixture in this suite can fall back on: real, always A1. */
export const PLACEHOLDER_LEXEME_ID = "LEX-A1-000001" as LexemeId;

/** A clock that always answers the same instant, for byte-identical output across two runs. */
export class FixedClock implements Clock {
  private readonly instant: Date;
  constructor(instant: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.instant = instant;
  }
  now(): Date {
    return this.instant;
  }
}

/** Deterministic, per-kind sequential ids: `story-1`, `story-2`, ... */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();
  next(kind: string): string {
    const prefix = ID_PREFIXES[kind as StoryEngineIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${prefix}${n}`;
  }
}

function nextId<TKind extends StoryEngineIdKind>(ids: IdGenerator, kind: TKind) {
  return asId(kind, ids.next(kind));
}

/**
 * Build a fully-bound, publishable Story for a real `StoryBlueprintId`.
 *
 * One synthetic sentence + occurrence per curricular obligation (each target
 * first introduced there, each recycle edge returning there). Occurrences are
 * technical placeholders (surface text names the target, not real narrative
 * prose) — this proves the engine and the curriculum registry compose
 * correctly end-to-end, without pretending to author real Story content
 * (Fase 3's job is the engine, not the 32 stories).
 */
export function buildFullyBoundStory(
  storyBlueprintId: string,
  ids: IdGenerator,
): {
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  readonly sentences: StorySentence[];
  readonly anchors: TextAnchor[];
  readonly occurrences: StoryOccurrence[];
  readonly targetBindings: StoryTargetBinding[];
} {
  const storyId = nextId(ids, "StoryId");
  const storyVersionId = nextId(ids, "StoryVersionId");

  const sentences: StorySentence[] = [];
  const anchors: TextAnchor[] = [];
  const occurrences: StoryOccurrence[] = [];
  const targetBindings: StoryTargetBinding[] = [];

  const introduced = registry.getTargetsIntroducedIn(storyBlueprintId);
  const introTargets = introduced.status === "FOUND" ? introduced.value : [];
  const returningEdges = registry.data.recycleEdges.filter((e) => e.returnStoryId === storyBlueprintId);

  let order = 0;
  const addOccurrenceFor = (targetId: string, lexemeId: LexemeId | null) => {
    order += 1;
    const sentenceId: SentenceId = nextId(ids, "SentenceId");
    const text = `Contexto tecnico para ${targetId}.`;
    const sentence: StorySentence = { id: sentenceId, storyVersionId, order, text, tokens: [] };
    sentences.push(sentence);

    const anchor = createTextAnchor(nextId(ids, "TextAnchorId"), storyVersionId, sentence, {
      start: 0,
      end: [...text].length,
    });
    anchors.push(anchor);

    const occurrence = createLexicalOccurrence({
      id: nextId(ids, "StoryOccurrenceId"),
      storyVersionId,
      sentenceId,
      surface: text,
      lexemeId: lexemeId ?? PLACEHOLDER_LEXEME_ID,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "NOT_REQUIRED",
      parts: [{ id: nextId(ids, "OccurrencePartId"), anchor, role: "HEAD" }],
    });
    occurrences.push(occurrence);
    return occurrence;
  };

  for (const target of introTargets) {
    const occurrence = addOccurrenceFor(target.targetId, target.lexemeId);
    targetBindings.push(
      createStoryTargetBinding({
        id: nextId(ids, "StoryTargetBindingId"),
        storyId,
        storyVersionId,
        occurrenceId: occurrence.id,
        targetType: target.targetType,
        targetId: target.targetId,
        bindingKind: "FIRST_INTRO",
        salience: target.introSalience,
      }),
    );
  }

  for (const edge of returningEdges) {
    const resolved = registry.resolveTarget(edge.targetId);
    const lexemeId = resolved?.allocation.lexemeId ?? null;
    const occurrence = addOccurrenceFor(edge.targetId, lexemeId);
    targetBindings.push(
      createStoryTargetBinding({
        id: nextId(ids, "StoryTargetBindingId"),
        storyId,
        storyVersionId,
        occurrenceId: occurrence.id,
        targetType: edge.targetType,
        targetId: edge.targetId,
        bindingKind: edge.returnStage,
      }),
    );
  }

  return { storyId, storyVersionId, sentences, anchors, occurrences, targetBindings };
}
