import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  InMemoryPersonalPracticeItemRepository,
  LocalStoragePersonalPracticeItemRepository,
  PERSONAL_PRACTICE_STORAGE_KEY,
  buildPersonalFlashcardDeck,
  createPersonalPracticeItem,
  syncPersonalPracticeNotes,
  withResolution,
  type PersonalPracticeItem,
  type PersonalPracticeItemRepository,
} from "../index.ts";
import { FakeStorage, practiceOccurrence, lexicalOccurrence } from "./fixtures.ts";

const NOW = new Date("2026-09-18T10:00:00.000Z");

function repositoryContract(name: string, makeRepository: () => PersonalPracticeItemRepository) {
  describe(`personal practice / repository contract (${name})`, () => {
    test("list is empty until something is saved", async () => {
      assert.deepEqual(await makeRepository().list(), []);
    });

    test("replaceAll persists the given collection, in order", async () => {
      const repository = makeRepository();
      const items = syncPersonalPracticeNotes({ previousItems: [], rawText: "cansado\ntener hambre", addedBy: "STUDENT", scope: null, now: NOW, generateId: (() => { let n = 0; return () => `id-${++n}`; })() }).items;
      await repository.replaceAll(items);
      assert.deepEqual(await repository.list(), items);
    });

    test("replaceAll fully replaces the previous collection", async () => {
      const repository = makeRepository();
      await repository.replaceAll([createPersonalPracticeItem({ id: "a", surface: "cansado", addedBy: "STUDENT", scope: null, now: NOW })]);
      await repository.replaceAll([createPersonalPracticeItem({ id: "b", surface: "tener hambre", addedBy: "STUDENT", scope: null, now: NOW })]);
      const items = await repository.list();
      assert.equal(items.length, 1);
      assert.equal(items[0].id, "b");
    });
  });
}

repositoryContract("in-memory", () => new InMemoryPersonalPracticeItemRepository());
repositoryContract("localStorage", () => new LocalStoragePersonalPracticeItemRepository(new FakeStorage()));

describe("personal practice / localStorage adapter", () => {
  test("uses its own storage key, apart from saved words and the reading memory", async () => {
    const storage = new FakeStorage();
    await new LocalStoragePersonalPracticeItemRepository(storage).replaceAll([createPersonalPracticeItem({ id: "a", surface: "cansado", addedBy: "STUDENT", scope: null, now: NOW })]);
    assert.equal(PERSONAL_PRACTICE_STORAGE_KEY, "spanstories.personal-practice:v1");
    assert.deepEqual(storage.keys(), ["spanstories.personal-practice:v1"]);
  });

  test("ignores corrupt data and unknown shapes", async () => {
    const storage = new FakeStorage();
    storage.setItem(PERSONAL_PRACTICE_STORAGE_KEY, "{not json");
    assert.deepEqual(await new LocalStoragePersonalPracticeItemRepository(storage).list(), []);

    const valid = createPersonalPracticeItem({ id: "valid-1", surface: "cansado", addedBy: "STUDENT", scope: null, now: NOW });
    storage.setItem(PERSONAL_PRACTICE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      items: [{ id: "bad", surface: "" }, { id: "bad-2" }, valid],
    }));
    assert.deepEqual(await new LocalStoragePersonalPracticeItemRepository(storage).list(), [valid]);
  });
});

describe("personal practice / never touches curriculum or Story data", () => {
  test("a PersonalPracticeItem carries no StoryOccurrence/anchor fields at all", () => {
    const item = createPersonalPracticeItem({ id: "a", surface: "cansado", addedBy: "STUDENT", scope: null, now: NOW });
    for (const forbidden of ["occurrenceId", "storyVersionId", "anchorId", "savedFrom"]) {
      assert.ok(!(forbidden in item), `PersonalPracticeItem must not carry ${forbidden}`);
    }
  });
});

describe("personal practice / flashcards", () => {
  test("every personal item produces a practicable card, resolved or not", () => {
    const items: readonly PersonalPracticeItem[] = [
      createPersonalPracticeItem({ id: "a", surface: "qué pena", addedBy: "STUDENT", scope: null, now: NOW }),
      withResolution(createPersonalPracticeItem({ id: "b", surface: "billete", addedBy: "STUDENT", scope: null, now: NOW }), { status: "RESOLVED", lexemeId: "LEX-A1-000074" as never, senseId: "SENSE-A1-000074" as never }, NOW),
    ];
    const occurrence = lexicalOccurrence({ id: "occ-billete-1", surface: "billete", lexemeId: "LEX-A1-000074", senseId: "SENSE-A1-000074", status: "RESOLVED" });
    const occurrences = [practiceOccurrence(occurrence, { lemma: "billete", translation: "ticket" })];
    const deck = buildPersonalFlashcardDeck(items, occurrences);

    assert.equal(deck.length, 2);
    assert.equal(deck[0].prompt, "qué pena", "unresolved item still gets a self-practice card");
    assert.equal(deck[1].prompt, "ticket", "resolved item borrows the published translation");
    assert.equal(deck[1].answer, "billete");
    assert.ok(deck.every((card) => card.key.startsWith("PERSONAL:")), "personal cards never share the SENSE/LEXEME/SURFACE key namespace");
  });
});
