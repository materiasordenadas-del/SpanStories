import assert from "node:assert/strict";
import test from "node:test";
import { createSurfaceStoryReader, getStoryReaderViewModel } from "../reader.ts";

test("a new story source automatically gets a panel for every word", () => {
  const model = createSurfaceStoryReader({
    island: "02",
    story: "03",
    title: "Historia nueva",
    paragraphs: ["¡Hola, María! Estoy aquí."],
  });

  assert.equal(model.sentences[0].segments.map((segment) => segment.text).join(""), "¡Hola, María! Estoy aquí.");
  assert.deepEqual(Object.values(model.surfaceEntries).map((entry) => entry.surface), ["Hola", "María", "Estoy", "aquí"]);
  assert.equal(Object.values(model.surfaceEntries).every((entry) => entry.panel.kind === "SURFACE"), true);
  assert.equal(model.eventContext, undefined);
});

test("the visual reader marks every textual FOCUS from its published curriculum", async () => {
  const model = await getStoryReaderViewModel("01", "01");
  const focused = model.sentences.flatMap((sentence) => sentence.segments)
    .filter((segment) => segment.kind !== "TEXT" && segment.curriculumFocus === true)
    .map((segment) => segment.text.toLocaleLowerCase("es"));
  assert.equal(focused.filter((surface) => surface === "hola").length, 1);
  assert.equal(focused.filter((surface) => surface === "buenos").length, 2);
  assert.equal(focused.filter((surface) => surface === "días").length, 2);
  assert.equal(focused.filter((surface) => surface === "encantado").length, 2);
  assert.equal(focused.includes("gracias"), false);
});
