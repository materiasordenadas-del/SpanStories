import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { syncPersonalPracticeNotes } from "../engine/personal-practice-notes.ts";
import type { PersonalPracticeItem } from "../domain/personal-item.ts";

const NOW = new Date("2026-09-18T10:00:00.000Z");
let counter = 0;
function nextId(): string {
  counter += 1;
  return `ppi-${counter}`;
}

function sync(previousItems: readonly PersonalPracticeItem[], rawText: string, scope: string | null = null) {
  return syncPersonalPracticeNotes({ previousItems, rawText, addedBy: "STUDENT", scope, now: NOW, generateId: nextId });
}

describe("personal practice / notes sync", () => {
  test("one non-empty line creates one item", () => {
    const result = sync([], "qué pena");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].surface, "qué pena");
    assert.equal(result.created.length, 1);
  });

  test("several lines create several items, in line order", () => {
    const result = sync([], "qué pena\nllegar tarde\ntener hambre");
    assert.deepEqual(result.items.map((item) => item.surface), ["qué pena", "llegar tarde", "tener hambre"]);
    assert.equal(result.created.length, 3);
  });

  test("empty lines are ignored", () => {
    const result = sync([], "qué pena\n\n   \nllegar tarde\n");
    assert.deepEqual(result.items.map((item) => item.surface), ["qué pena", "llegar tarde"]);
  });

  test("editing a line's text updates the same item instead of orphaning it", () => {
    const created = sync([], "cansado").items;
    const edited = sync(created, "muy cansado");
    assert.equal(edited.items.length, 1);
    assert.equal(edited.items[0].id, created[0].id, "same id survives the edit");
    assert.equal(edited.items[0].surface, "muy cansado");
    assert.equal(edited.updated.length, 1);
    assert.equal(edited.created.length, 0, "no orphan/new item is created for the edit");
  });

  test("editing an item resets any earlier resolution — it described the old text", () => {
    const created = sync([], "cansado").items;
    const resolved: PersonalPracticeItem = { ...created[0], resolutionStatus: "RESOLVED", lexemeId: "LEX-A1-000001" as never, senseId: "SENSE-A1-000001" as never };
    const edited = sync([resolved], "muy cansado");
    assert.equal(edited.items[0].resolutionStatus, "UNRESOLVED");
    assert.equal(edited.items[0].lexemeId, null);
  });

  test("removing a line removes its item", () => {
    const created = sync([], "cansado\ntener hambre").items;
    const afterDelete = sync(created, "cansado");
    assert.deepEqual(afterDelete.items.map((item) => item.surface), ["cansado"]);
    assert.deepEqual(afterDelete.removedIds, [created[1].id]);
  });

  test("a full phrase stays one item, never split into several", () => {
    const result = sync([], "¿me puedes ayudar?");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].surface, "¿me puedes ayudar?");
    assert.equal(result.items[0].type, "PHRASE");
  });

  test("a single word is classified WORD", () => {
    const result = sync([], "cansado");
    assert.equal(result.items[0].type, "WORD");
  });

  test("repeated autosave of unchanged text creates no duplicates", () => {
    const first = sync([], "qué pena\nllegar tarde").items;
    const second = sync(first, "qué pena\nllegar tarde");
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);
    assert.deepEqual(second.items.map((item) => item.id), first.map((item) => item.id));
    assert.deepEqual(second.items, first);
  });

  test("surrounding and internal whitespace is normalized without otherwise changing the text", () => {
    const result = sync([], "  qué   pena  ");
    assert.equal(result.items[0].surface, "qué pena");
  });

  test("inserting a new line in the middle keeps earlier and later items' ids", () => {
    const first = sync([], "cansado\ntener hambre").items;
    const second = sync(first, "cansado\nllegar tarde\ntener hambre");
    assert.equal(second.items[0].id, first[0].id);
    assert.equal(second.items[2].id, first[1].id);
    assert.equal(second.created.length, 1);
    assert.equal(second.items[1].surface, "llegar tarde");
  });
});

describe("personal practice / notebook scoped to a Story", () => {
  test("a line written in a Story's notebook is tagged with that Story's scope", () => {
    const result = sync([], "qué pena", "01/02");
    assert.equal(result.items[0].scope, "01/02");
  });

  test("a Story's notebook starts blank and never shows another Story's lines", () => {
    const inStoryA = sync([], "qué pena", "01/02").items;
    // Opening a different Story's notebook: its previous items are only the ones already scoped to it (none).
    const inStoryB = sync(inStoryA.filter((item) => item.scope === "01/03"), "llegar tarde", "01/03");
    assert.deepEqual(inStoryA.map((item) => item.surface), ["qué pena"]);
    assert.deepEqual(inStoryB.created.map((item) => item.surface), ["llegar tarde"]);
  });

  test("everything written across every Story's notebook still ends up in the student's own list", () => {
    const afterStoryA = sync([], "qué pena", "01/02").items;
    const afterStoryB = sync(afterStoryA, "llegar tarde", "01/03").items;
    // The student's own list is scope null: every item, from every Story, participates.
    const wholeList = sync(afterStoryB, "qué pena\nllegar tarde\ntener hambre", null);
    assert.deepEqual(wholeList.items.map((item) => item.surface).sort(), ["llegar tarde", "qué pena", "tener hambre"]);
    assert.equal(wholeList.created.length, 1, "only the brand-new line is created; the two Story lines are recognized, not duplicated");
  });

  test("editing a Story's own notebook never touches items written in another Story or in the student's own list", () => {
    const afterStoryA = sync([], "cansado", "01/02").items;
    const afterGlobal = sync(afterStoryA, "cansado\ntener hambre", null).items;
    // Back in Story A's own notebook: only its one line shows, editing it must not disturb the "tener hambre" line written from the list.
    const editedInStoryA = sync(afterGlobal, "muy cansado", "01/02");
    assert.deepEqual(editedInStoryA.items.map((item) => item.surface).sort(), ["muy cansado", "tener hambre"]);
    assert.equal(editedInStoryA.updated.length, 1);
  });
});
