import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  InMemoryPracticeItemRepository,
  LocalStoragePracticeItemRepository,
  PRACTICE_STORAGE_KEY,
  createPracticeItem,
  practiceItemKey,
  practiceTargetOf,
  type PracticeItemRepository,
  type PracticeTarget,
} from "../index.ts";
import type { LexicalOccurrence } from "../../story-engine/index.ts";
import { FakeStorage, SAVED_AT, STORY_VERSION_ID, constructionOccurrence, lexicalOccurrence, originOf, surfaceToken } from "./fixtures.ts";

// «soy» and «es»: two forms, one Lexeme (ser), one resolved Sense.
const soy = lexicalOccurrence({ id: "occ-soy", surface: "soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520", status: "RESOLVED" });
const es = lexicalOccurrence({ id: "occ-es", surface: "es", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520", status: "RESOLVED" });
// «billete»: one Lexeme with two published Senses.
const billete1 = lexicalOccurrence({ id: "occ-billete-1", surface: "billete", lexemeId: "LEX-A1-000074", senseId: "SENSE-A1-000074", status: "RESOLVED" });
const billete2 = lexicalOccurrence({ id: "occ-billete-2", surface: "billete", lexemeId: "LEX-A1-000074", senseId: "SENSE-A1-000075", status: "RESOLVED" });
// The same written form belonging to two different Lexemes, neither Sense resolved.
const formOfFirstLexeme = lexicalOccurrence({ id: "occ-como-1", surface: "como", lexemeId: "LEX-A1-000900", senseId: null, status: "UNRESOLVED" });
const formOfSecondLexeme = lexicalOccurrence({ id: "occ-como-2", surface: "como", lexemeId: "LEX-A1-000901", senseId: null, status: "UNRESOLVED" });

function targetOf(occurrence: LexicalOccurrence): PracticeTarget {
  const target = practiceTargetOf(occurrence);
  assert.ok(target, `${occurrence.id} should have a practice target`);
  return target;
}

async function saveAll(repository: PracticeItemRepository, occurrences: readonly LexicalOccurrence[]) {
  for (const occurrence of occurrences) {
    await repository.save(createPracticeItem({ target: targetOf(occurrence), savedAt: SAVED_AT, savedFrom: originOf(occurrence) }));
  }
  return repository.list();
}

describe("practice / canonical identity", () => {
  test("two occurrences with the same SenseId are one PracticeItem", async () => {
    const items = await saveAll(new InMemoryPracticeItemRepository(), [soy, es]);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].target, { type: "SENSE", senseId: "SENSE-A1-000520", lexemeId: "LEX-A1-000511" });
    assert.equal(items[0].savedFrom?.occurrenceId, "occ-soy", "the first save is kept");
  });

  test("two Senses of the same Lexeme are two PracticeItems", async () => {
    const items = await saveAll(new InMemoryPracticeItemRepository(), [billete1, billete2]);
    assert.deepEqual(items.map(practiceItemKey), ["SENSE:SENSE-A1-000074", "SENSE:SENSE-A1-000075"]);
  });

  test("the same form of two Lexemes is two PracticeItems", async () => {
    const items = await saveAll(new InMemoryPracticeItemRepository(), [formOfFirstLexeme, formOfSecondLexeme]);
    assert.deepEqual(items.map(practiceItemKey), ["LEXEME:LEX-A1-000900", "LEXEME:LEX-A1-000901"]);
  });

  test("an unresolved Sense with a known Lexeme targets the Lexeme, never an inferred Sense", () => {
    assert.deepEqual(targetOf(formOfFirstLexeme), { type: "LEXEME", lexemeId: "LEX-A1-000900" });
    const candidateSense = lexicalOccurrence({ id: "occ-candidate", surface: "ser", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520", status: "UNRESOLVED" });
    assert.deepEqual(targetOf(candidateSense), { type: "LEXEME", lexemeId: "LEX-A1-000511" });
    const notRequired = lexicalOccurrence({ id: "occ-not-required", surface: "de", lexemeId: "LEX-A1-000176", senseId: null, status: "NOT_REQUIRED" });
    assert.deepEqual(targetOf(notRequired), { type: "LEXEME", lexemeId: "LEX-A1-000176" });
  });

  test("a SurfaceToken or construction without a Lexeme is still saveable, by its exact selection", () => {
    const construction = practiceTargetOf(constructionOccurrence("occ-greeting", "Buenos días"));
    assert.deepEqual(construction, {
      type: "UNRESOLVED_SURFACE",
      storyVersionId: STORY_VERSION_ID,
      anchorId: "occ-greeting",
      surface: "Buenos días",
      normalizedSurface: "buenos dias",
    });
    const token = practiceTargetOf(surfaceToken("tok-samuel", "Samuel"), STORY_VERSION_ID);
    assert.deepEqual(token, {
      type: "UNRESOLVED_SURFACE",
      storyVersionId: STORY_VERSION_ID,
      anchorId: "tok-samuel",
      surface: "Samuel",
      normalizedSurface: "samuel",
    });
  });

  test("a bare SurfaceToken with no storyVersionId to anchor it to has no target", () => {
    assert.equal(practiceTargetOf(surfaceToken("tok-samuel", "Samuel")), null);
    assert.equal(practiceTargetOf(undefined), null);
  });

  test("two different unresolved selections that share the same text are two PracticeItems, never merged by text", async () => {
    const first = constructionOccurrence("occ-greeting-1", "Buenos días");
    const second = constructionOccurrence("occ-greeting-2", "Buenos días");
    const repository = new InMemoryPracticeItemRepository();
    for (const occurrence of [first, second]) {
      const target = practiceTargetOf(occurrence);
      assert.ok(target, `${occurrence.id} should have a practice target`);
      await repository.save(createPracticeItem({ target, savedAt: SAVED_AT, savedFrom: { storyVersionId: occurrence.storyVersionId, occurrenceId: occurrence.id } }));
    }
    const items = await repository.list();
    assert.deepEqual(items.map(practiceItemKey), [`SURFACE:${STORY_VERSION_ID}:occ-greeting-1`, `SURFACE:${STORY_VERSION_ID}:occ-greeting-2`]);
  });

  test("the key comes from the published id, never from the surface or the lemma", () => {
    const key = practiceItemKey(createPracticeItem({ target: targetOf(soy), savedAt: SAVED_AT }));
    assert.equal(key, "SENSE:SENSE-A1-000520");
    assert.equal(key.includes("soy") || key.includes("ser"), false);
  });
});

function repositoryContract(name: string, makeRepository: () => PracticeItemRepository) {
  describe(`practice / repository contract (${name})`, () => {
    test("saving the same target twice keeps a single item", async () => {
      const repository = makeRepository();
      const first = createPracticeItem({ target: targetOf(soy), savedAt: SAVED_AT, savedFrom: originOf(soy) });
      const again = createPracticeItem({ target: targetOf(es), savedAt: new Date("2026-09-14T10:00:00.000Z"), savedFrom: originOf(es) });
      assert.deepEqual(await repository.save(first), first);
      assert.deepEqual(await repository.save(again), first, "saving again resolves to the stored item");
      assert.deepEqual(await repository.list(), [first]);
    });

    test("has reports only saved targets", async () => {
      const repository = makeRepository();
      await repository.save(createPracticeItem({ target: targetOf(billete1), savedAt: SAVED_AT }));
      assert.equal(await repository.has(targetOf(billete1)), true);
      assert.equal(await repository.has(targetOf(billete2)), false);
    });

    test("remove makes the item disappear", async () => {
      const repository = makeRepository();
      await saveAll(repository, [soy, billete1]);
      await repository.remove(targetOf(es));
      assert.equal(await repository.has(targetOf(soy)), false);
      assert.deepEqual((await repository.list()).map(practiceItemKey), ["SENSE:SENSE-A1-000074"]);
      await repository.remove(targetOf(formOfFirstLexeme));
      assert.equal((await repository.list()).length, 1, "removing an unsaved target changes nothing");
    });

    test("list keeps the order in which items were saved", async () => {
      const items = await saveAll(makeRepository(), [billete2, formOfSecondLexeme, soy]);
      assert.deepEqual(items.map(practiceItemKey), ["SENSE:SENSE-A1-000075", "LEXEME:LEX-A1-000901", "SENSE:SENSE-A1-000520"]);
    });
  });
}

repositoryContract("in-memory", () => new InMemoryPracticeItemRepository());
repositoryContract("localStorage", () => new LocalStoragePracticeItemRepository(new FakeStorage()));

describe("practice / localStorage adapter", () => {
  test("saved items persist after a refresh", async () => {
    const storage = new FakeStorage();
    const saved = await saveAll(new LocalStoragePracticeItemRepository(storage), [soy, billete1]);
    const afterRefresh = new LocalStoragePracticeItemRepository(storage);
    assert.deepEqual(await afterRefresh.list(), saved);
    assert.equal(await afterRefresh.has(targetOf(es)), true);
  });

  test("uses its own storage key, apart from the reading memory", async () => {
    const storage = new FakeStorage();
    await saveAll(new LocalStoragePracticeItemRepository(storage), [soy]);
    assert.equal(PRACTICE_STORAGE_KEY, "spanstories.practice:v1");
    assert.deepEqual(storage.keys(), ["spanstories.practice:v1"]);
  });

  test("ignores corrupt data and legacy surface or lemma keys", async () => {
    const storage = new FakeStorage();
    storage.setItem(PRACTICE_STORAGE_KEY, "{not json");
    assert.deepEqual(await new LocalStoragePracticeItemRepository(storage).list(), []);

    const valid = createPracticeItem({ target: targetOf(soy), savedAt: SAVED_AT, savedFrom: originOf(soy) });
    storage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      items: [
        { key: "lema:ser", surface: "ser" },
        { key: "forma:hola", surface: "hola" },
        { target: { type: "SENSE", senseId: "ser", lexemeId: "LEX-A1-000511" }, savedAt: SAVED_AT.toISOString(), savedFrom: null },
        valid,
        { ...valid, savedAt: "2026-09-14T10:00:00.000Z" },
      ],
    }));
    assert.deepEqual(await new LocalStoragePracticeItemRepository(storage).list(), [valid]);
  });

  test("an UNRESOLVED_SURFACE item persists after a refresh", async () => {
    const storage = new FakeStorage();
    const occurrence = constructionOccurrence("occ-greeting", "Buenos días");
    const target = practiceTargetOf(occurrence);
    assert.ok(target);
    const saved = await new LocalStoragePracticeItemRepository(storage).save(
      createPracticeItem({ target, savedAt: SAVED_AT, savedFrom: { storyVersionId: occurrence.storyVersionId, occurrenceId: occurrence.id } }),
    );
    assert.deepEqual(await new LocalStoragePracticeItemRepository(storage).list(), [saved]);
  });
});
