import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  asId,
  createLexicalOccurrence,
  createTextAnchor,
  resolveAnchorText,
  type LexicalOccurrence,
  type StorySentence,
} from "../../story-engine/index.ts";
import { recordStoryOccurrenceOpened } from "../record-occurrence-opened.ts";
import { buildReaderSegments } from "../segments.ts";
import {
  STORY_ONE_BLUEPRINT_ID,
  STORY_ONE_ID,
  STORY_ONE_VERSION_ID,
  getStoryOneReaderViewModel,
  isStoryOneRoute,
  readStoryOneCoreText,
} from "../story-one.ts";

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("Historia 1 / vertical slice", () => {
  test("the visual route maps explicitly to a technical Story distinct from its Blueprint", () => {
    assert.equal(isStoryOneRoute("01", "01"), true);
    assert.equal(isStoryOneRoute("1", "1"), true);
    assert.equal(isStoryOneRoute("02", "01"), false);
    assert.equal(STORY_ONE_BLUEPRINT_ID, "A1-M01-I05-S1");
    assert.notEqual(STORY_ONE_ID, STORY_ONE_BLUEPRINT_ID);
    assert.notEqual(STORY_ONE_VERSION_ID, STORY_ONE_BLUEPRINT_ID);
    assert.doesNotMatch(STORY_ONE_ID, /01\/01|primer|clases|bogot/i);
  });

  test("the published StoryVersion is exactly the authoritative CORE_STORY", async () => {
    const model = await getStoryOneReaderViewModel();
    assert.equal(model.eventContext.version.status, "PUBLISHED");
    assert.equal(model.eventContext.version.text, readStoryOneCoreText());
    assert.equal(model.eventContext.version.text, model.eventContext.sentences.map((sentence) => sentence.text).join("\n"));
    assert.doesNotMatch(model.eventContext.version.text, /La compra olvidada|Marta|Carlos|mercado|leche/);
  });

  test("every occurrence part resolves through its canonical TextAnchor", async () => {
    const model = await getStoryOneReaderViewModel();
    const sentenceById = new Map(model.eventContext.sentences.map((sentence) => [sentence.id, sentence] as const));
    const anchorById = new Map(model.eventContext.anchors.map((anchor) => [anchor.id, anchor] as const));
    for (const occurrence of model.eventContext.occurrences) {
      for (const part of occurrence.parts) {
        const anchor = anchorById.get(part.anchorId);
        assert.ok(anchor);
        const sentence = sentenceById.get(anchor.sentenceId);
        assert.ok(sentence);
        assert.equal(resolveAnchorText(sentence.text, anchor), [...sentence.text].slice(anchor.start, anchor.end).join(""));
      }
    }
  });

  test("every word is selectable while only canonical LexicalOccurrences carry lexical identity", async () => {
    const model = await getStoryOneReaderViewModel();
    const lexicalIds = new Set(model.eventContext.occurrences.filter((occurrence) => occurrence.kind === "LEXICAL").map((occurrence) => occurrence.id));
    const constructionIds = new Set(model.eventContext.occurrences.filter((occurrence) => occurrence.kind === "CONSTRUCTION").map((occurrence) => occurrence.id));
    const renderedIds = new Set(model.sentences.flatMap((sentence) => sentence.segments.filter((segment) => segment.kind === "LEXICAL").map((segment) => segment.occurrenceId)));
    assert.deepEqual(renderedIds, lexicalIds);
    assert.equal([...renderedIds].some((id) => constructionIds.has(id as never)), false);
    for (const [index, sentence] of model.sentences.entries()) {
      assert.equal(sentence.segments.map((segment) => segment.text).join(""), sentence.text);
      const selectableSegments = sentence.segments.filter((segment) => segment.kind !== "TEXT");
      assert.equal(selectableSegments.length, model.eventContext.sentences[index].tokens.length);
    }
    const surfaceIds = model.sentences.flatMap((sentence) =>
      sentence.segments.filter((segment) => segment.kind === "SURFACE").map((segment) => segment.tokenId),
    );
    assert.ok(surfaceIds.length > 0);
    assert.deepEqual(new Set(Object.keys(model.surfaceEntries)), new Set(surfaceIds));
    const surfaceWords = new Set(Object.values(model.surfaceEntries).map((entry) => entry.surface));
    assert.equal(surfaceWords.has("Samuel"), true);
    assert.equal(surfaceWords.has("Taylor"), true);
    assert.equal(surfaceWords.has("Argentina"), true);
    for (const tokenId of surfaceIds) {
      assert.equal(tokenId in model.lexicalEntries, false);
    }
  });

  test("repeated forms keep distinct occurrence identity and resolve the published Lexeme/Sense", async () => {
    const model = await getStoryOneReaderViewModel();
    const holas = model.eventContext.occurrences.filter((occurrence): occurrence is LexicalOccurrence => occurrence.kind === "LEXICAL" && occurrence.surface === "Hola");
    assert.equal(holas.length, 2);
    assert.notEqual(holas[0].id, holas[1].id);
    assert.equal(holas[0].lexemeId, "LEX-A1-000287");
    assert.equal(holas[0].senseId, "SENSE-A1-000292");
  });

  test("the renderer preserves a discontinuous multi-part lexical occurrence", () => {
    const storyVersionId = asId("StoryVersionId", "storyver-renderer-fixture");
    const sentence: StorySentence = {
      id: asId("SentenceId", "sent-renderer-fixture"),
      storyVersionId,
      order: 1,
      text: "se dio finalmente cuenta",
      tokens: [],
    };
    const first = createTextAnchor(asId("TextAnchorId", "anchor-renderer-first"), storyVersionId, sentence, { start: 0, end: 2 });
    const second = createTextAnchor(asId("TextAnchorId", "anchor-renderer-second"), storyVersionId, sentence, { start: 18, end: 24 });
    const occurrence = createLexicalOccurrence({
      id: asId("StoryOccurrenceId", "occ-renderer-fixture"),
      storyVersionId,
      sentenceId: sentence.id,
      surface: "se cuenta",
      lexemeId: "LEX-A1-000001" as never,
      senseId: null,
      lexemeFormId: null,
      senseResolutionStatus: "UNRESOLVED",
      parts: [
        { id: asId("OccurrencePartId", "part-renderer-first"), anchor: first, role: "CLITIC" },
        { id: asId("OccurrencePartId", "part-renderer-second"), anchor: second, role: "HEAD" },
      ],
    });
    const segments = buildReaderSegments(sentence, [first, second], [occurrence]);
    assert.equal(segments.map((segment) => segment.text).join(""), sentence.text);
    assert.equal(segments.filter((segment) => segment.kind === "LEXICAL").length, 2);
    assert.deepEqual(new Set(segments.filter((segment) => segment.kind === "LEXICAL").map((segment) => segment.occurrenceId)), new Set([occurrence.id]));
  });

  test("opening an occurrence appends canonical immutable events without implying mastery", async () => {
    const model = await getStoryOneReaderViewModel();
    const storage = new MemoryStorage();
    const occurrenceId = Object.keys(model.lexicalEntries)[0];
    const first = await recordStoryOccurrenceOpened(model.eventContext, occurrenceId, storage);
    const second = await recordStoryOccurrenceOpened(model.eventContext, occurrenceId, storage);
    assert.equal(first.eventType, "OCCURRENCE_OPENED");
    assert.equal(first.occurrenceId, occurrenceId);
    assert.notEqual(first.eventId, second.eventId);
    assert.equal("declaredState" in first, false);
    const raw = storage.getItem("spanstories.learner-events.v1");
    assert.ok(raw);
    const stored = JSON.parse(raw) as { events: unknown[] };
    assert.equal(stored.events.length, 2);
  });
});
