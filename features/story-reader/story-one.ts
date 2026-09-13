import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEVEL_CODE,
  loadCurriculumRegistry,
  type CurriculumTarget,
  type Lexeme,
  type LexemeForm,
  type Sense,
} from "../curriculum/index.ts";
import { createLexicalEngine } from "../lexical-engine/index.ts";
import {
  InMemoryStoryRepository,
  asId,
  assembleStoryVersion,
  createConstructionOccurrence,
  createLexicalOccurrence,
  createStory,
  createStoryTargetBinding,
  createTextAnchor,
  publishStoryVersion,
  validateStoryPublication,
  type Clock,
  type LexicalOccurrence,
  type StoryOccurrence,
  type StorySentence,
  type SurfaceToken,
  type StoryTargetBinding,
  type TextAnchor,
} from "../story-engine/index.ts";
import type { StoryReaderEventContext, StoryReaderLexicalEntry, StoryReaderScene, StoryReaderSurfaceEntry, StoryReaderViewModel } from "./model.ts";
import { buildReaderSegments } from "./segments.ts";
import { buildLexicalWordPanel, buildSurfaceWordPanel, createWordPanelStoryIndex } from "./word-panel.ts";

export const STORY_ONE_BLUEPRINT_ID = "A1-M01-I05-S1";
export const STORY_ONE_ID = asId("StoryId", "story-9f0d8a61-70c4-4ad1-819b-4b2e988bd0a4");
export const STORY_ONE_VERSION_ID = asId("StoryVersionId", "storyver-56a93a29-50a8-4be3-9e72-930fb8c8fb44");

const STORY_ONE_SOURCE_FILE = "A1-M01-I05-S1__primer-dia-de-clases-bogota_BORRADOR_AUDITADO_v1.0.md";
const storyOneSourcePaths = ["Mi versión", "Mi version", "Mi versin"].map((directory) => join(
  process.cwd(),
  "Claude outputs",
  directory,
  STORY_ONE_SOURCE_FILE,
));

export const STORY_ONE_SOURCE_PATH = storyOneSourcePaths.find(existsSync) ?? storyOneSourcePaths[0];

const MATERIALIZED_AT = "2026-09-11T12:00:00.000Z";
const clock: Clock = { now: () => new Date(MATERIALIZED_AT) };
const curriculum = loadCurriculumRegistry();
const lexicalEngine = createLexicalEngine(curriculum);

const KNOWN_MISSING_TARGET_IDS = new Set([
  "SENSE-A1-000015",
  "SENSE-A1-000133",
  "SENSE-A1-000217",
  "SENSE-A1-000255",
  "SENSE-A1-000345",
  "SENSE-A1-000406",
  "SENSE-A1-000510",
  "SENSE-A1-000601",
  "GRAM-A1-002",
  "12B1-MWU-0006",
  "12B1-MWU-0209",
  "12B1-MWU-0210",
  "12B1-MWU-0211",
  "12B1-MWU-0213",
]);

type LexicalSpec = {
  readonly key: string;
  readonly sentence: number;
  readonly surface: string;
  readonly lexemeId: string;
  readonly senseId: string;
};

const LEXICAL_SPECS: readonly LexicalSpec[] = [
  { key: "hola-1", sentence: 0, surface: "Hola", lexemeId: "LEX-A1-000287", senseId: "SENSE-A1-000292" },
  { key: "yo-1", sentence: 0, surface: "Yo", lexemeId: "LEX-A1-000598", senseId: "SENSE-A1-000607" },
  { key: "ser-1", sentence: 0, surface: "soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520" },
  { key: "ser-2", sentence: 1, surface: "Soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520" },
  { key: "de-1", sentence: 1, surface: "de", lexemeId: "LEX-A1-000176", senseId: "SENSE-A1-000178" },
  { key: "escuela-1", sentence: 2, surface: "escuela", lexemeId: "LEX-A1-000225", senseId: "SENSE-A1-000229" },
  { key: "clase-1", sentence: 3, surface: "clase", lexemeId: "LEX-A1-000138", senseId: "SENSE-A1-000140" },
  { key: "hola-2", sentence: 4, surface: "Hola", lexemeId: "LEX-A1-000287", senseId: "SENSE-A1-000292" },
  { key: "profesor-1", sentence: 4, surface: "profesor", lexemeId: "LEX-A1-000467", senseId: "SENSE-A1-000476" },
  { key: "el-1", sentence: 5, surface: "El", lexemeId: "LEX-A1-000206", senseId: "SENSE-A1-000210" },
  { key: "quien-1", sentence: 6, surface: "Quién", lexemeId: "LEX-A1-000478", senseId: "SENSE-A1-000487" },
  { key: "eh-1", sentence: 8, surface: "Eh", lexemeId: "LEX-A1-000204", senseId: "SENSE-A1-000208" },
  { key: "perdon-1", sentence: 8, surface: "Perdón", lexemeId: "LEX-A1-000434", senseId: "SENSE-A1-000442" },
  { key: "senor-1", sentence: 8, surface: "señor", lexemeId: "LEX-A1-000508", senseId: "SENSE-A1-000517" },
  { key: "yo-2", sentence: 8, surface: "Yo", lexemeId: "LEX-A1-000598", senseId: "SENSE-A1-000607" },
  { key: "ser-3", sentence: 8, surface: "soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520" },
  { key: "apellido-1", sentence: 8, surface: "apellido", lexemeId: "LEX-A1-000046", senseId: "SENSE-A1-000046" },
  { key: "ser-4", sentence: 8, surface: "es", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520" },
  { key: "el-2", sentence: 9, surface: "El", lexemeId: "LEX-A1-000206", senseId: "SENSE-A1-000210" },
  { key: "nombre-1", sentence: 11, surface: "NOMBRE", lexemeId: "LEX-A1-000396", senseId: "SENSE-A1-000403" },
  { key: "apellido-2", sentence: 11, surface: "APELLIDO", lexemeId: "LEX-A1-000046", senseId: "SENSE-A1-000046" },
  { key: "un-1", sentence: 12, surface: "un", lexemeId: "LEX-A1-000566", senseId: "SENSE-A1-000575" },
  { key: "de-2", sentence: 13, surface: "de", lexemeId: "LEX-A1-000176", senseId: "SENSE-A1-000178" },
  { key: "ser-5", sentence: 14, surface: "Soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520" },
  { key: "de-3", sentence: 14, surface: "de", lexemeId: "LEX-A1-000176", senseId: "SENSE-A1-000178" },
  { key: "gracias-1", sentence: 16, surface: "Gracias", lexemeId: "LEX-A1-000270", senseId: "SENSE-A1-000275" },
  { key: "senor-2", sentence: 16, surface: "señor", lexemeId: "LEX-A1-000508", senseId: "SENSE-A1-000517" },
  { key: "estar-1", sentence: 17, surface: "está", lexemeId: "LEX-A1-000234", senseId: "SENSE-A1-000238" },
  { key: "dia-1", sentence: 17, surface: "día", lexemeId: "LEX-A1-000186", senseId: "SENSE-A1-000189" },
  { key: "de-4", sentence: 17, surface: "de", lexemeId: "LEX-A1-000176", senseId: "SENSE-A1-000178" },
  { key: "clase-2", sentence: 17, surface: "clases", lexemeId: "LEX-A1-000138", senseId: "SENSE-A1-000140" },
] as const;

type ConstructionSpec = {
  readonly key: string;
  readonly sentence: number;
  readonly constructionId: string;
  readonly parts: readonly { readonly surface: string; readonly role: "ANCHOR" | "SLOT"; readonly slotLabel?: string }[];
};

const CONSTRUCTION_SPECS: readonly ConstructionSpec[] = [
  { key: "given-name", sentence: 0, constructionId: "NAME_WITHOUT_ARTICLE", parts: [{ surface: "Samuel", role: "ANCHOR" }] },
  { key: "ser-ident", sentence: 0, constructionId: "SER_IDENTIFICATION", parts: [{ surface: "soy", role: "ANCHOR" }, { surface: "Samuel", role: "SLOT", slotLabel: "IDENTITY" }] },
  { key: "ser-de", sentence: 1, constructionId: "SER_DE_ORIGIN", parts: [{ surface: "Soy", role: "ANCHOR" }, { surface: "de Argentina", role: "SLOT", slotLabel: "ORIGIN" }] },
  { key: "greeting", sentence: 3, constructionId: "GREETING_FORMULA", parts: [{ surface: "Buenos días", role: "ANCHOR" }] },
  { key: "treatment", sentence: 3, constructionId: "NOMINAL_TREATMENT", parts: [{ surface: "Sr.", role: "ANCHOR" }] },
  { key: "vocative", sentence: 3, constructionId: "VOCATIVE", parts: [{ surface: "clase", role: "ANCHOR" }] },
  { key: "surname", sentence: 6, constructionId: "SURNAME_WITHOUT_ARTICLE", parts: [{ surface: "López", role: "ANCHOR" }] },
  { key: "de-donde", sentence: 13, constructionId: "DE_DONDE_ORIGIN_QUESTION", parts: [{ surface: "de dónde", role: "ANCHOR" }] },
] as const;

const STORY_ONE_SCENES: readonly StoryReaderScene[] = [
  { number: 1, sentenceIndexes: [0, 1, 2], rosterSentenceIndex: null },
  { number: 2, sentenceIndexes: [3], rosterSentenceIndex: null },
  { number: 3, sentenceIndexes: [4], rosterSentenceIndex: null },
  { number: 4, sentenceIndexes: [5, 6, 7], rosterSentenceIndex: null },
  { number: 5, sentenceIndexes: [8], rosterSentenceIndex: null },
  { number: 6, sentenceIndexes: [9, 10, 11], rosterSentenceIndex: 11 },
  { number: 7, sentenceIndexes: [12, 13], rosterSentenceIndex: null },
  { number: 8, sentenceIndexes: [14, 15, 16], rosterSentenceIndex: null },
  { number: 9, sentenceIndexes: [17], rosterSentenceIndex: null },
];

function tokenizeSentence(sentenceId: StorySentence["id"], text: string, sentenceIndex: number): readonly SurfaceToken[] {
  return [...text.matchAll(/[\p{L}\p{M}]+/gu)].map((match, tokenIndex) => {
    const utf16Start = match.index;
    const surface = match[0];
    return {
      id: asId("SurfaceTokenId", `tok-0a73b0a2-c512-4cac-9692-${String(sentenceIndex * 1000 + tokenIndex + 1).padStart(12, "0")}`),
      sentenceId,
      surface,
      startOffset: [...text.slice(0, utf16Start)].length,
      endOffset: [...text.slice(0, utf16Start + surface.length)].length,
      order: tokenIndex + 1,
    };
  });
}

function extractCoreStory(markdown: string): readonly string[] {
  const coreStart = markdown.indexOf("### CORE_STORY");
  if (coreStart < 0) throw new Error("BLOCKER_STORY_SOURCE_MISSING: CORE_STORY section not found");
  const section = markdown.slice(coreStart + "### CORE_STORY".length);
  const end = section.indexOf("\n---");
  const lines = (end < 0 ? section : section.slice(0, end)).split(/\r?\n/);
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === ">") {
      if (current.length > 0) paragraphs.push(current.join("\n"));
      current = [];
      continue;
    }
    if (!line.startsWith("> ")) continue;
    current.push(line.slice(2).replace(/\*\*/g, "").replace(/\s{2}$/, ""));
  }
  if (current.length > 0) paragraphs.push(current.join("\n"));
  if (paragraphs.length !== 18) {
    throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: expected 18 CORE_STORY paragraphs, found ${paragraphs.length}`);
  }
  return paragraphs;
}

export function readStoryOneCoreText(): string {
  return extractCoreStory(readFileSync(STORY_ONE_SOURCE_PATH, "utf8")).join("\n");
}

function locateUnique(text: string, surface: string): { start: number; end: number } {
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"))];
  if (matches.length !== 1 || matches[0].index === undefined) {
    throw new Error(`STORY_ONE_ANCHOR_NOT_UNIQUE: ${JSON.stringify(surface)} in ${JSON.stringify(text)}`);
  }
  const start = matches[0].index;
  return { start: [...text.slice(0, start)].length, end: [...text.slice(0, start + surface.length)].length };
}

function expectLexicalIdentity(lexemeId: string, senseId: string): { lexeme: Lexeme; sense: Sense; form: LexemeForm | null } {
  const lexeme = lexicalEngine.resolveLexeme(lexemeId);
  const sense = lexicalEngine.resolveSense(senseId);
  if (lexeme.status !== "FOUND" || sense.status !== "FOUND" || sense.value.lexemeId !== lexeme.value.id) {
    throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: invalid lexical identity ${lexemeId}/${senseId}`);
  }
  return { lexeme: lexeme.value, sense: sense.value, form: null };
}

function target(id: string): CurriculumTarget {
  const resolved = curriculum.resolveTarget(id);
  if (resolved === null) throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: target ${id} does not exist`);
  return resolved.allocation;
}

export function isStoryOneRoute(island: string, story: string): boolean {
  return Number(island) === 1 && Number(story) === 1;
}

export async function getStoryOneReaderViewModel(): Promise<StoryReaderViewModel & { readonly eventContext: StoryReaderEventContext }> {
  const blueprint = curriculum.getStoryBlueprintById(STORY_ONE_BLUEPRINT_ID);
  if (blueprint === null) throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: ${STORY_ONE_BLUEPRINT_ID} is not published`);

  const sourceParagraphs = extractCoreStory(readFileSync(STORY_ONE_SOURCE_PATH, "utf8"));
  const story = createStory(STORY_ONE_ID, blueprint.id, clock);
  const sentences: StorySentence[] = sourceParagraphs.map((text, index) => {
    const id = asId("SentenceId", `sent-7cc12f18-40b8-4c4f-a946-${String(index + 1).padStart(12, "0")}`);
    return {
      id,
      storyVersionId: STORY_ONE_VERSION_ID,
      order: index + 1,
      text,
      tokens: tokenizeSentence(id, text, index),
    };
  });
  const draftVersion = assembleStoryVersion({
    id: STORY_ONE_VERSION_ID,
    storyId: STORY_ONE_ID,
    versionNumber: 1,
    title: "Primer día de clases en Bogotá",
    sentences,
    status: "DRAFT",
    clock,
  });

  const anchors: TextAnchor[] = [];
  const occurrences: StoryOccurrence[] = [];
  const lexicalByKey = new Map<string, LexicalOccurrence>();
  const lexicalEntries: Record<string, StoryReaderLexicalEntry> = {};
  const surfaceEntries: Record<string, StoryReaderSurfaceEntry> = {};
  const lexicalIdentities: { occurrence: LexicalOccurrence; sentence: StorySentence; lexeme: Lexeme; sense: Sense }[] = [];
  let anchorIndex = 0;
  let occurrenceIndex = 0;

  for (const spec of LEXICAL_SPECS) {
    const sentence = sentences[spec.sentence];
    const bounds = locateUnique(sentence.text, spec.surface);
    const anchor = createTextAnchor(
      asId("TextAnchorId", `anchor-4d18bf4b-8231-43ef-9c51-${String(++anchorIndex).padStart(12, "0")}`),
      STORY_ONE_VERSION_ID,
      sentence,
      bounds,
    );
    anchors.push(anchor);
    const { lexeme, sense } = expectLexicalIdentity(spec.lexemeId, spec.senseId);
    const exactForm = curriculum.data.lexemeForms.find((form) => form.lexemeId === lexeme.id && form.surface === spec.surface) ?? null;
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", `occ-8a17c949-9f41-482f-8671-${String(++occurrenceIndex).padStart(12, "0")}`),
      storyVersionId: STORY_ONE_VERSION_ID,
      sentenceId: sentence.id,
      surface: spec.surface,
      lexemeId: lexeme.id,
      senseId: sense.id,
      lexemeFormId: exactForm?.id ?? null,
      senseResolutionStatus: "RESOLVED",
      parts: [{
        id: asId("OccurrencePartId", `part-f7c99632-902d-467b-b4c3-${String(anchorIndex).padStart(12, "0")}`),
        anchor,
        role: "HEAD",
      }],
    });
    occurrences.push(occurrence);
    lexicalByKey.set(spec.key, occurrence);
    lexicalIdentities.push({ occurrence, sentence, lexeme, sense });
  }

  const constructionByKey = new Map<string, StoryOccurrence>();
  for (const spec of CONSTRUCTION_SPECS) {
    const sentence = sentences[spec.sentence];
    const occurrenceId = asId("StoryOccurrenceId", `occ-8a17c949-9f41-482f-8671-${String(++occurrenceIndex).padStart(12, "0")}`);
    const parts = spec.parts.map((part) => {
      const anchor = createTextAnchor(
        asId("TextAnchorId", `anchor-4d18bf4b-8231-43ef-9c51-${String(++anchorIndex).padStart(12, "0")}`),
        STORY_ONE_VERSION_ID,
        sentence,
        locateUnique(sentence.text, part.surface),
      );
      anchors.push(anchor);
      return {
        id: asId("OccurrencePartId", `part-f7c99632-902d-467b-b4c3-${String(anchorIndex).padStart(12, "0")}`),
        anchor,
        role: part.role,
        slotLabel: part.slotLabel,
      };
    });
    const occurrence = createConstructionOccurrence({
      id: occurrenceId,
      storyVersionId: STORY_ONE_VERSION_ID,
      sentenceId: sentence.id,
      surface: spec.parts.map((part) => part.surface).join(" "),
      constructionId: spec.constructionId,
      parts,
    });
    occurrences.push(occurrence);
    constructionByKey.set(spec.key, occurrence);
  }

  const panelIndex = createWordPanelStoryIndex(sentences, anchors, occurrences, STORY_ONE_SCENES);
  for (const { occurrence, sentence, lexeme, sense } of lexicalIdentities) {
    lexicalEntries[occurrence.id] = {
      occurrenceId: occurrence.id,
      surface: occurrence.surface,
      context: sentence.text,
      lemma: lexeme.lemma,
      senseItem: sense.item,
      lexicalCategory: lexeme.lexicalCategory,
      panel: buildLexicalWordPanel({ occurrence, lexeme, sense, levelCode: LEVEL_CODE, index: panelIndex }),
    };
  }

  const bindingSpecs = [
    ["SENSE-A1-000208", lexicalByKey.get("eh-1")],
    ["SENSE-A1-000275", lexicalByKey.get("gracias-1")],
    ["SENSE-A1-000292", lexicalByKey.get("hola-1")],
    ["SENSE-A1-000442", lexicalByKey.get("perdon-1")],
    ["SENSE-A1-000046", lexicalByKey.get("apellido-1")],
    ["SENSE-A1-000210", lexicalByKey.get("el-1")],
    ["SENSE-A1-000517", lexicalByKey.get("senor-1")],
    ["SENSE-A1-000575", lexicalByKey.get("un-1")],
    ["SENSE-A1-000607", lexicalByKey.get("yo-1")],
    ["GRAM-A1-001", constructionByKey.get("given-name")],
    ["GRAM-A1-003", constructionByKey.get("surname")],
    ["GRAM-A1-004", constructionByKey.get("treatment")],
    ["GRAM-A1-067", lexicalByKey.get("yo-1")],
    ["GRAM-A1-089", lexicalByKey.get("quien-1")],
    ["GRAM-A1-124", constructionByKey.get("vocative")],
    ["GRAM-A1-127", constructionByKey.get("ser-ident")],
    ["12B1-MWU-0179", constructionByKey.get("ser-de")],
    ["12B1-MWU-0189", constructionByKey.get("de-donde")],
    ["12B1-MWU-0208", constructionByKey.get("greeting")],
  ] as const;

  const targetBindings: StoryTargetBinding[] = bindingSpecs.map(([targetId, occurrence], index) => {
    if (occurrence === undefined) throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: no occurrence for ${targetId}`);
    const allocation = target(targetId);
    return createStoryTargetBinding({
      id: asId("StoryTargetBindingId", `bind-443f3344-b575-4052-8997-${String(index + 1).padStart(12, "0")}`),
      storyId: STORY_ONE_ID,
      storyVersionId: STORY_ONE_VERSION_ID,
      occurrenceId: occurrence.id,
      targetType: allocation.targetType,
      targetId,
      bindingKind: "FIRST_INTRO",
      salience: allocation.introSalience,
      productiveClaim: "NONE",
    });
  });

  const validation = validateStoryPublication({
    story,
    storyVersion: draftVersion,
    sentences,
    anchors,
    occurrences,
    targetBindings,
    curriculumRegistry: curriculum,
    lexicalEngine,
  });
  const issueTargetId = (issue: { readonly context?: Record<string, unknown> }): string | null =>
    typeof issue.context?.targetId === "string" ? issue.context.targetId : null;
  const unexpectedIssues = validation.status === "INVALID"
    ? validation.issues.filter((issue) => {
        const targetId = issueTargetId(issue);
        return issue.code !== "MISSING_REQUIRED_TARGET_BINDING" || targetId === null || !KNOWN_MISSING_TARGET_IDS.has(targetId);
      })
    : [];
  if (unexpectedIssues.length > 0) {
    throw new Error(`BLOCKER_INTEGRATION_CONTRADICTION: ${JSON.stringify(unexpectedIssues)}`);
  }
  const reportedMissing = validation.status === "INVALID"
    ? new Set(validation.issues.filter((issue) => issue.code === "MISSING_REQUIRED_TARGET_BINDING").map(issueTargetId).filter((id): id is string => id !== null))
    : new Set<string>();
  if (reportedMissing.size !== KNOWN_MISSING_TARGET_IDS.size || [...KNOWN_MISSING_TARGET_IDS].some((id) => !reportedMissing.has(id))) {
    throw new Error("BLOCKER_INTEGRATION_CONTRADICTION: known curriculum debt changed; review the StoryBlueprint before publishing");
  }

  const version = publishStoryVersion(draftVersion, clock);
  const repository = new InMemoryStoryRepository();
  await repository.saveStory(story);
  await repository.saveNewVersion({ version: draftVersion, sentences, anchors, occurrences, targetBindings });
  await repository.markPublished(version);

  const selectableTokenIds = new Set(sentences.flatMap((sentence) => sentence.tokens.map((token) => token.id)));
  const readerSentences = sentences.map((sentence, index) => {
    const segments = buildReaderSegments(sentence, anchors, occurrences, selectableTokenIds);
    const renderedSurfaceIds = new Set(segments.filter((segment) => segment.kind === "SURFACE").map((segment) => segment.tokenId));
    for (const token of sentence.tokens) {
      if (!renderedSurfaceIds.has(token.id)) continue;
      surfaceEntries[token.id] = { tokenId: token.id, surface: token.surface, context: sentence.text, panel: buildSurfaceWordPanel(token, sentence) };
    }
    return {
      id: sentence.id,
      text: sentence.text,
      presentation: index === 11 ? "ROSTER" as const : "PARAGRAPH" as const,
      segments,
    };
  });

  return {
    storyBlueprintId: blueprint.id,
    storyId: story.id,
    storyVersionId: version.id,
    title: version.title,
    sentences: readerSentences,
    scenes: STORY_ONE_SCENES,
    lexicalEntries,
    surfaceEntries,
    eventContext: {
      story,
      version,
      sentences,
      anchors,
      occurrences,
      targetBindings,
      curriculumReleaseId: curriculum.release.releaseId,
      lexiconReleaseId: lexicalEngine.release.releaseId,
    },
  };
}
