/**
 * Shared test fixtures for the NLP / Annotation Assistant suite.
 *
 * Mirrors the convention every other engine phase's test suite already
 * uses: publication-safety and lexical-resolution tests that make a claim
 * about *published* data load the real committed `A1-CURRICULUM-v1.51`
 * registry (`registry`/`lexicalEngine` below); the difficult Spanish
 * construction cases (§21-26 of the governing brief) use a small synthetic
 * registry instead, because the real A1 release does not happen to publish
 * an MWU for "darse cuenta" or a grammar unit for the `llevar` + gerund
 * construction — a synthetic fixture proves the *mechanism* (MWU with/without
 * lexical identity, `UNRESOLVED_CANDIDATE` when nothing is published) without
 * pretending those specific phrases are real curriculum content.
 */

import { createRegistry, loadCurriculumRegistry, type CurriculumData, type CurriculumRegistry } from "../../curriculum/index.ts";
import { createLexicalEngine, loadLexicalEngine, LexicalEngine } from "../../lexical-engine/index.ts";
import {
  ID_PREFIXES as STORY_ID_PREFIXES,
  InMemoryStoryRepository,
  assembleStoryVersion,
  asId as asStoryId,
  createStory,
  type Clock,
  type IdGenerator,
  type StoryEngineIdKind,
  type StorySentence,
} from "../../story-engine/index.ts";
import { ID_PREFIXES as NLP_ID_PREFIXES, type NlpIdKind } from "../domain/ids.ts";
import type { CurriculumRelease } from "../../curriculum/domain/release.ts";

/** Every technical id prefix this suite's tests might need to mint, across both the Story Engine's and this feature's own id namespaces. */
const ALL_ID_PREFIXES: Readonly<Record<string, string>> = { ...STORY_ID_PREFIXES, ...NLP_ID_PREFIXES };
type AnyIdKind = StoryEngineIdKind | NlpIdKind;

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

/**
 * Deterministic, per-kind sequential ids. Spans both the Story Engine's id
 * namespace (needed by `acceptAnnotationCandidate`, which mints real
 * `StoryOccurrence`/`TextAnchor`/... ids) and this feature's own
 * (`AnnotationCandidateId`, needed by `buildAnnotationCandidates`) — tests
 * routinely need both from the same generator instance.
 */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();
  next(kind: string): string {
    const prefix = ALL_ID_PREFIXES[kind as AnyIdKind];
    if (prefix === undefined) throw new Error(`UNKNOWN_ID_KIND: ${kind}`);
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${prefix}${n}`;
  }
}

/** A minimal, valid `StoryVersion` (DRAFT, no occurrences yet) over the given sentence texts. */
export async function buildStoryWithSentences(sentenceTexts: readonly string[], ids: IdGenerator, clock: Clock) {
  const repo = new InMemoryStoryRepository();
  const storyId = asStoryId("StoryId", ids.next("StoryId"));
  const storyVersionId = asStoryId("StoryVersionId", ids.next("StoryVersionId"));
  const story = createStory(storyId, null, clock);
  await repo.saveStory(story);

  const sentences: StorySentence[] = sentenceTexts.map((text, i) => ({
    id: asStoryId("SentenceId", ids.next("SentenceId")),
    storyVersionId,
    order: i + 1,
    text,
    tokens: [],
  }));
  const version = assembleStoryVersion({ id: storyVersionId, storyId, versionNumber: 1, title: "NLP fixture", sentences, status: "DRAFT", clock });
  await repo.saveNewVersion({ version, sentences, anchors: [], occurrences: [], targetBindings: [] });

  return { repo, storyId, storyVersionId, sentences };
}

// ------------------------------------------------------- synthetic registry

function release(): CurriculumRelease {
  return {
    releaseId: "A1-CURRICULUM-vNLPTEST",
    schemaVersion: "curriculum-registry/2.0.0",
    level: "A1",
    curriculumVersions: {},
    sourceFiles: [],
    sourceHashes: {},
    generatedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "test",
    expectedCounts: {},
    actualCounts: {},
    countChecks: [],
    validationResult: { status: "PASS", issueCount: 0, issues: [], invariants: [] },
  };
}

export const DARSE_CUENTA_TARGET_ID = "MWU-T-DARSE-CUENTA";
export const DARSE_CUENTA_LEXEME_ID = "LEX-T-000001";

/**
 * A small registry naming exactly what the difficult-construction tests
 * need: one MWU (`"darse cuenta"`) — with or without lexical identity,
 * depending on `withLexicalIdentity` — and one grammar unit. The real A1
 * release has none of these exact phrases published.
 */
export function buildConstructionTestRegistry(withLexicalIdentity: boolean, includeGrammarUnit = true): CurriculumRegistry {
  const data: CurriculumData = {
    level: "A1",
    modules: [],
    islands: [],
    storyBlueprints: [],
    lexemes: withLexicalIdentity
      ? [
          {
            id: DARSE_CUENTA_LEXEME_ID as never,
            lemma: "dar",
            lexemeKey: "dar",
            type: "ATOMIC",
            enginePos: null,
            lexicalCategory: null,
            regionalConceptAnchor: null,
            release: "vNLPTEST",
            curriculumLayer: "test",
            curriculumInclusion: "test",
          },
        ]
      : [],
    lexemeForms: [],
    senses: [],
    mwuUnits: [
      {
        id: DARSE_CUENTA_TARGET_ID as never,
        item: "darse cuenta",
        objectClass: "MWU",
        subtype: "VERBAL",
        frameKey: null,
        identityPolicy: withLexicalIdentity ? "LEXICAL_IDENTITY" : "NO_LEXICAL_IDENTITY",
        classificationConfidence: "HIGH",
        lexicalCategory: "VERB",
        lexemeId: withLexicalIdentity ? (DARSE_CUENTA_LEXEME_ID as never) : null,
        senseId: null,
      },
    ],
    grammarUnits: includeGrammarUnit
      ? [{ id: "GRAM-T-000001" as never, item: "LLEVAR_DURATION_GERUND", pcicSection: "test", category: "test", kind: "test" }]
      : [],
    sourceAssertions: [],
    targets: [
      {
        allocationId: "ALLOC-T-000001" as never,
        targetType: "MWU_SOURCE_UNIT",
        targetId: DARSE_CUENTA_TARGET_ID,
        item: "darse cuenta",
        lexemeId: withLexicalIdentity ? (DARSE_CUENTA_LEXEME_ID as never) : null,
        senseId: null,
        objectClass: "MWU",
        senseStatus: "",
        expectedReceptive: "",
        expectedProductive: "",
        formulaicExpectation: "",
        regionalPolicy: null,
        introSalience: "FOCUS",
        allocationAuthority: "test",
        allocationBasis: "test",
        allocationReason: "test",
        sourceAssertionIds: [],
        sourceCatalogueRefs: [],
        firstIntroductionModuleId: "M-T" as never,
        firstIntroductionIslandId: "I-T" as never,
        firstIntroductionStoryId: "S-T" as never,
        storyBlueprintStatus: "test",
        recycleEdgeIds: [],
      },
      ...(includeGrammarUnit
        ? [
            {
              allocationId: "ALLOC-T-000003" as never,
              targetType: "GRAMMAR_UNIT" as const,
              targetId: "GRAM-T-000001",
              item: "LLEVAR_DURATION_GERUND",
              lexemeId: null,
              senseId: null,
              objectClass: "GRAMMAR",
              senseStatus: "",
              expectedReceptive: "",
              expectedProductive: "",
              formulaicExpectation: "",
              regionalPolicy: null,
              introSalience: "FOCUS" as const,
              allocationAuthority: "test",
              allocationBasis: "test",
              allocationReason: "test",
              sourceAssertionIds: [],
              sourceCatalogueRefs: [],
              firstIntroductionModuleId: "M-T" as never,
              firstIntroductionIslandId: "I-T" as never,
              firstIntroductionStoryId: "S-T" as never,
              storyBlueprintStatus: "test",
              recycleEdgeIds: [],
            },
          ]
        : []),
    ],
    recycleEdges: [],
  };
  return createRegistry(release(), data);
}

export function buildConstructionTestLexicalEngine(constructionRegistry: CurriculumRegistry): LexicalEngine {
  return createLexicalEngine(constructionRegistry);
}
