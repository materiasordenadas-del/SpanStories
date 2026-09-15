import assert from "node:assert/strict";
import test from "node:test";
import { buildGlossUnits, glossHosts, reconcileGlosses, type QuickGlossSource, type ShownGloss } from "../gloss.ts";
import type { StoryReaderTextSegment } from "../model.ts";
import { QUICK_GLOSS_SOURCES } from "../quick-gloss-sources.ts";
import { getStoryReaderViewModel } from "../reader.ts";

const text = (value: string): StoryReaderTextSegment => ({ kind: "TEXT", text: value });
const word = (value: string, tokenId: string): StoryReaderTextSegment => ({ kind: "SURFACE", text: value, tokenId });

const source: QuickGlossSource = {
  occurrences: [{ sentence: 0, surface: "bien", text: "okay" }],
  expressions: [{ forms: ["buenos", "días"], text: "good morning", words: ["good", "days"] }],
  words: { bien: "fine", dice: "says", buenos: "good" },
  names: ["Samuel"],
};

// —Buenos días —dice Samuel. Bien, eh.
const segments = [text("—"), word("Buenos", "t1"), text(" "), word("días", "t2"), text(" —"), word("dice", "t3"), text(" "), word("Samuel", "t4"), text(". "), word("Bien", "t5"), text(", "), word("eh", "t6"), text(".")];
const units = buildGlossUnits({
  sentenceId: "s0",
  sentenceIndex: 0,
  segments,
  source,
  publishedTranslation: (segment) => segment.text === "dice" ? "tells" : undefined,
});
const sentences = [{ id: "s0", glossUnits: units }];
const words = units.flatMap((unit) => unit.words);
const byId = (id: string) => words.find((entry) => entry.id === id);

test("a multiword expression is one unit with its whole translation and one for each word", () => {
  assert.equal(units[0].gloss?.text, "good morning");
  assert.deepEqual(units[0].words.map((entry) => [entry.id, entry.gloss.text]), [["t1", "good"], ["t2", "days"]]);
  assert.equal(units.length, 5);
});

test("published translation wins, then the occurrence, then the word, then the name; nothing is invented", () => {
  assert.deepEqual(byId("t3")?.gloss, { text: "tells", kind: "TRANSLATION" });
  assert.deepEqual(byId("t5")?.gloss, { text: "okay", kind: "TRANSLATION" });
  assert.deepEqual(byId("t4")?.gloss, { text: "(name)", kind: "NAME" });
  assert.deepEqual(byId("t6")?.gloss, { text: "sin traducción", kind: "MISSING" });
});

test("only whitespace lets two neighbouring words join; punctuation cuts", () => {
  assert.deepEqual(words.map((entry) => entry.joinsNext), [true, false, true, false, false, false]);
});

test("tapping every word of an expression shows its whole translation; tapping one shows that word", () => {
  assert.deepEqual(glossHosts(sentences, new Set(["t1", "t2"])).map((host) => host.gloss.text), ["good morning"]);
  assert.deepEqual(glossHosts(sentences, new Set(["t1"])).map((host) => host.gloss.text), ["good"]);
});

test("tapped words join a bar only when they are consecutive with nothing but space between them", () => {
  const runs = (active: string[]) => new Set(glossHosts(sentences, new Set(active)).map((host) => host.run)).size;
  assert.equal(runs(["t3", "t4"]), 1, "dice Samuel");
  assert.equal(runs(["t4", "t5"]), 2, "the period cuts");
  assert.equal(runs(["t1", "t3"]), 2, "an untapped word leaves a gap");
});

test("a merged expression replaces its word tags at once, and removed tags leave with an animation", () => {
  const reconcile = (previous: ReadonlyMap<string, ShownGloss>, active: string[]) => reconcileGlosses(previous, glossHosts(sentences, new Set(active)));
  const single = reconcile(new Map(), ["t1", "t3"]);
  const merged = reconcile(single, ["t1", "t2", "t3"]);
  assert.equal(merged.has("t1"), false, "the word tag is replaced, not faded");
  assert.equal(merged.get(units[0].id)?.instant, true);
  assert.equal(merged.get("t3")?.instant, false);

  const leaving = reconcile(merged, ["t1", "t2"]);
  assert.equal(leaving.get("t3")?.leaving, true);
  assert.equal(reconcile(leaving, ["t1", "t2", "t3"]).get("t3")?.leaving, false, "tapping again brings it back");
});

test("story 01/01 reads its published translation first and keeps editorial glosses out of the word panel", async () => {
  const model = await getStoryReaderViewModel("01", "01");
  const first = model.sentences[0].glossUnits ?? [];
  assert.equal(first[0].words[0].gloss.text, "hello / hi");
  assert.equal(first[1].gloss?.text, "good morning");
  const lexicalTranslations = Object.values(model.lexicalEntries)
    .flatMap((entry) => entry.panel.translation === undefined ? [] : [entry.panel.translation]);
  assert.ok(lexicalTranslations.includes("hello / hi"));
  assert.equal(lexicalTranslations.includes("good morning"), false, "the editorial expression gloss stays in the reader tag");
  assert.equal(Object.values(model.surfaceEntries).every((entry) => entry.panel.translation === undefined), true);
  const missing = model.sentences.flatMap((sentence) => (sentence.glossUnits ?? []).flatMap((unit) => unit.words)).filter((entry) => entry.gloss.kind === "MISSING");
  assert.deepEqual(missing, [], "every word of 01/01 has a quick translation");
});

test("the 01/01 editorial source points at words that exist in the story", async () => {
  const model = await getStoryReaderViewModel("01", "01");
  const keyed = model.sentences.map((sentence) => sentence.segments.filter((segment) => segment.kind !== "TEXT").map((segment) => segment.text.toLocaleLowerCase("es")));
  const editorial = QUICK_GLOSS_SOURCES["01/01"];
  for (const entry of editorial.occurrences) {
    assert.equal(keyed[entry.sentence]?.filter((surface) => surface === entry.surface).length, 1, `${entry.sentence}:${entry.surface}`);
  }
  for (const expression of editorial.expressions) {
    assert.equal(expression.words.length, expression.forms.length, expression.text);
    const found = model.sentences.some((sentence) => sentence.glossUnits?.some((unit) => unit.gloss?.text === expression.text));
    assert.equal(found, true, expression.text);
  }
});

test("every published story has quick-gloss coverage for every word", async () => {
  for (const story of ["01", "02", "03", "04"]) {
    const model = await getStoryReaderViewModel("01", story);
    const missing = model.sentences.flatMap((sentence) => (sentence.glossUnits ?? []).flatMap((unit) => unit.words))
      .filter((entry) => entry.gloss.kind === "MISSING")
      .map((entry) => entry.id);
    assert.deepEqual(missing, [], `01/${story}`);
  }
});
