import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getStoryOneReaderViewModel } from "../story-one.ts";
import { highlightParts, partOfSpeechLabel, type WordPanelTextPart } from "../word-panel.ts";

const highlighted = (parts: readonly WordPanelTextPart[]) => parts.filter((part) => part.highlighted).map((part) => part.text);

describe("Historia 1 / word panel view model", () => {
  test("highlights by code point range, never by searching the surface", () => {
    const parts = highlightParts("¡Hola! Hola.", [{ start: 7, end: 11 }]);
    assert.equal(parts.map((part) => part.text).join(""), "¡Hola! Hola.");
    assert.deepEqual(parts, [
      { text: "¡Hola! ", highlighted: false },
      { text: "Hola", highlighted: true },
      { text: ".", highlighted: false },
    ]);
  });

  test("category labels come only from published annotations", () => {
    assert.equal(partOfSpeechLabel({ type: "ATOMIC", lexicalCategory: "PREPOSITION", enginePos: "ADP" }, { lexicalCategory: "PREPOSITION", enginePos: "ADP" }), "Preposición");
    assert.equal(partOfSpeechLabel({ type: "ATOMIC", lexicalCategory: null, enginePos: "NOUN" }, null), "Sustantivo");
    assert.equal(partOfSpeechLabel({ type: "MULTIWORD", lexicalCategory: null, enginePos: null }, null), "Expresión");
    assert.equal(partOfSpeechLabel({ type: "ATOMIC", lexicalCategory: "FUNCTION_WORD", enginePos: null }, null), undefined);
    assert.equal(partOfSpeechLabel({ type: "ATOMIC", lexicalCategory: null, enginePos: null }, null), undefined);
  });

  test("each Hola occurrence shows its own sentence and points to the other one", async () => {
    const model = await getStoryOneReaderViewModel();
    const holas = Object.values(model.lexicalEntries).filter((entry) => entry.surface === "Hola");
    assert.equal(holas.length, 2);
    const [first, second] = holas.map((entry) => entry.panel);

    assert.equal(first.kind, "LEXICAL");
    assert.equal(first.currentContext.text, model.sentences[0].text);
    assert.deepEqual(highlighted(first.currentContext.parts), ["Hola"]);
    assert.equal(first.currentContext.parts[0].highlighted, true);
    assert.equal(second.currentContext.text, model.sentences[4].text);

    assert.equal(first.cefrLevel, "A1");
    assert.equal(first.partOfSpeechLabel, undefined, "hola has no published category, so none is invented");
    assert.deepEqual(first.storyContexts?.map((context) => [context.text, context.sceneLabel]), [[model.sentences[4].text, "Escena 3"]]);
    assert.deepEqual(second.storyContexts?.map((context) => context.sceneLabel), ["Escena 1"]);

    for (const field of ["translation", "shortUsage", "examples", "pronunciation", "previousContexts", "canSave", "canPractice"] as const) {
      assert.equal(field in first, false, `${field} has no published source yet`);
    }
    // The panel image comes from the published illustration of the occurrence's scene.
    assert.deepEqual(first.image, { src: "/stories/historia-01/scenes/scene-01.png", alt: "Ilustración de la escena 1" });
    assert.deepEqual(second.image, { src: "/stories/historia-01/scenes/scene-03.png", alt: "Ilustración de la escena 3" });
  });

  test("annotated function words get a learner label", async () => {
    const model = await getStoryOneReaderViewModel();
    const panelFor = (surface: string) => Object.values(model.lexicalEntries).find((entry) => entry.surface === surface)?.panel;
    assert.equal(panelFor("de")?.partOfSpeechLabel, "Preposición");
    assert.equal(panelFor("Yo")?.partOfSpeechLabel, "Pronombre");
    assert.equal(panelFor("El")?.partOfSpeechLabel, "Artículo");
  });

  test("surface tokens without lexical identity only carry their real context", async () => {
    const model = await getStoryOneReaderViewModel();
    for (const entry of Object.values(model.surfaceEntries)) {
      assert.equal(entry.panel.kind, "SURFACE");
      assert.equal(entry.panel.id, entry.tokenId);
      assert.equal(entry.panel.currentContext.text, entry.context);
      assert.deepEqual(highlighted(entry.panel.currentContext.parts), [entry.surface]);
      assert.deepEqual(Object.keys(entry.panel).sort(), ["currentContext", "id", "kind", "surface"]);
    }
  });

  test("no panel leaks engine ids or placeholder text", async () => {
    const model = await getStoryOneReaderViewModel();
    const panels = [...Object.values(model.lexicalEntries), ...Object.values(model.surfaceEntries)].map((entry) => entry.panel);
    const serialized = JSON.stringify(panels, (key, value: unknown) => (key === "id" ? undefined : value));
    assert.doesNotMatch(serialized, /undefined|N\/A|No data|Sense missing|LEX-A1|SENSE-A1|PREPOSITION|PERSONAL_PRONOUN/);
  });
});
