/**
 * Shared test fixtures for the Learner Event / Progress Engine suite.
 *
 * Mirrors `features/story-engine/__tests__/fixtures.ts`: identity-sensitive
 * tests (attribution, progress) load the real committed A1 registry and
 * lexical engine; everything else uses deterministic synthetic builders.
 */

import { loadCurriculumRegistry, type CurriculumRegistry } from "../../curriculum/index.ts";
import {
  asLexicalId,
  loadLexicalEngine,
  LexicalEngine,
  type LexemeLineageEvent,
  type LineageEventId,
  type LineageEventKind,
  type LineageSemantics,
  type TransferPolicy,
} from "../../lexical-engine/index.ts";
import {
  asId as asStoryId,
  createLexicalOccurrence,
  createStory,
  createTextAnchor,
  assembleStoryVersion,
  InMemoryStoryRepository,
  type StoryId,
  type StoryOccurrenceId,
  type StoryVersionId,
} from "../../story-engine/index.ts";
import type { Clock, IdGenerator } from "../domain/ports.ts";
import { ID_PREFIXES, type LearnerProgressIdKind } from "../domain/ids.ts";

export const registry: CurriculumRegistry = loadCurriculumRegistry();
export const lexicalEngine: LexicalEngine = loadLexicalEngine();

export class FixedClock implements Clock {
  private readonly instant: Date;
  constructor(instant: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.instant = instant;
  }
  now(): Date {
    return this.instant;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();
  next(kind: string): string {
    const prefix = ID_PREFIXES[kind as LearnerProgressIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${prefix}${n}`;
  }
}

/**
 * A minimal, real Story Engine repository holding exactly one published
 * StoryVersion with one LEXICAL occurrence — enough for `appendValidatedEvent`
 * to accept an event naming it, and for attribution tests to have a real
 * `StoryOccurrence` to reannotate.
 */
export function buildStoryFixture(lexemeId = "LEX-A1-000001") {
  const repo = new InMemoryStoryRepository();
  const clock = new FixedClock();
  const storyId: StoryId = asStoryId("StoryId", "story-fixture-1");
  const storyVersionId: StoryVersionId = asStoryId("StoryVersionId", "storyver-fixture-1");
  const story = createStory(storyId, null, clock);
  repo.saveStory(story);

  const text = "hola mundo";
  const sentence = { id: asStoryId("SentenceId", "sent-fixture-1"), storyVersionId, order: 1, text, tokens: [] };
  const anchor = createTextAnchor(asStoryId("TextAnchorId", "anchor-fixture-1"), storyVersionId, sentence, { start: 0, end: 4 });
  const occurrenceId: StoryOccurrenceId = asStoryId("StoryOccurrenceId", "occ-fixture-1");
  const occurrence = createLexicalOccurrence({
    id: occurrenceId,
    storyVersionId,
    sentenceId: sentence.id,
    surface: "hola",
    lexemeId: lexemeId as never,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "NOT_REQUIRED",
    parts: [{ id: asStoryId("OccurrencePartId", "part-fixture-1"), anchor, role: "HEAD" }],
  });
  const version = assembleStoryVersion({
    id: storyVersionId,
    storyId,
    versionNumber: 1,
    title: "Fixture",
    sentences: [sentence],
    status: "DRAFT",
    clock,
  });
  repo.saveNewVersion({ version, sentences: [sentence], anchors: [anchor], occurrences: [occurrence], targetBindings: [] });

  return { repo, storyId, storyVersionId, occurrenceId, occurrence };
}

let lineageEventCounter = 0;

/**
 * A `LexemeLineageEvent` over real published lexeme ids — same convention
 * `features/lexical-engine/__tests__/lineage.test.ts` uses ("lineage over
 * published ids"): the A1 release itself has no lineage history, so every
 * lineage scenario here is a technical fixture, but the ids it moves between
 * are real, so `LexicalEngine.resolveLineage`/`getLexemeForSense` behave
 * exactly as they would over genuine editorial history.
 */
export function lineageEvent(
  kind: LineageEventKind,
  sources: readonly string[],
  targets: readonly string[],
  overrides: {
    readonly semantics?: LineageSemantics;
    readonly transferPolicy?: TransferPolicy;
    readonly reason?: string;
  } = {},
): LexemeLineageEvent {
  lineageEventCounter += 1;
  const id = asLexicalId("LineageEventId", `LIN-A1-${String(900000 + lineageEventCounter).padStart(6, "0")}`) as LineageEventId;
  return {
    id,
    kind,
    sourceLexemeIds: sources as never,
    targetLexemeIds: targets as never,
    semantics: overrides.semantics ?? "EQUIVALENT_IDENTITY",
    transferPolicy: overrides.transferPolicy ?? "CONTEXTUAL",
    effectiveRelease: asLexicalId("LexiconReleaseId", "A1-LEXICON-v9.9") as never,
    reason: overrides.reason ?? "fixture lineage event",
  };
}

export function buildLexicalEngineWithLineage(events: readonly LexemeLineageEvent[]): LexicalEngine {
  return new LexicalEngine(registry, { lineageEvents: events });
}
