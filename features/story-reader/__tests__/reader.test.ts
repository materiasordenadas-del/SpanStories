import assert from "node:assert/strict";
import test from "node:test";
import { createSurfaceStoryReader } from "../reader.ts";

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
