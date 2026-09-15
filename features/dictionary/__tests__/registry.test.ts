import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadCurriculumRegistry } from "../../curriculum/index.ts";
import { createA1Dictionary } from "../index.ts";

describe("A1 dictionary registry", () => {
  const curriculum = loadCurriculumRegistry();
  const dictionary = createA1Dictionary(curriculum);

  test("addresses every canonical A1 Sense and every published MWU", () => {
    assert.equal(dictionary.stats.a1SenseCount, 602);
    assert.equal(dictionary.stats.mwuCount, 214);
    assert.equal(dictionary.stats.mwuWithoutLexicalIdentityCount, 170);
    assert.equal(dictionary.senses.length, 602);
    assert.equal(dictionary.mwus.length, 214);
  });

  test("never creates dictionary Sense identities from surface text", () => {
    const publishedA1Ids = new Set(curriculum.data.senses.filter((sense) => sense.isA1).map((sense) => sense.id));
    assert.equal(dictionary.senses.every((entry) => publishedA1Ids.has(entry.senseId)), true);
  });

  test("keeps A2 boundary senses out of the A1 dictionary", () => {
    for (const sense of curriculum.data.senses.filter((candidate) => !candidate.isA1)) {
      assert.equal(dictionary.getSense(sense.id), null);
    }
  });

  test("publishes all 602 A1 Senses with the required learner-facing core", () => {
    const incomplete = dictionary.senses.filter((entry) => {
      const enrichment = entry.enrichment;
      return enrichment === undefined
        || enrichment.translation === undefined
        || enrichment.partOfSpeechLabel === undefined
        || enrichment.shortUsage === undefined;
    });

    assert.deepEqual(
      incomplete.map((entry) => ({ senseId: entry.senseId, item: entry.item })),
      [],
    );
    assert.equal(dictionary.stats.enrichedSenseCount, 602);
    assert.equal(dictionary.stats.missingEnrichmentCount, 0);
  });

  test("resolves the existing Hola learner reference by Sense id", () => {
    const hola = dictionary.getSense("SENSE-A1-000292");
    assert.ok(hola);
    assert.equal(hola.item, "hola");
    assert.equal(hola.enrichment?.translation, "hello / hi");
    assert.equal(hola.enrichment?.partOfSpeechLabel, "Interjección");
    assert.ok((hola.enrichment?.examples?.length ?? 0) >= 3);
  });

  test("keeps polysemous A1 Senses distinct at learner-facing level", () => {
    const cafeDrink = dictionary.getSense("SENSE-A1-000086");
    const cafePlace = dictionary.getSense("SENSE-A1-000087");
    const woman = dictionary.getSense("SENSE-A1-000385");
    const wife = dictionary.getSense("SENSE-A1-000386");
    const father = dictionary.getSense("SENSE-A1-000422");
    const parents = dictionary.getSense("SENSE-A1-000423");

    assert.equal(cafeDrink?.enrichment?.translation, "coffee");
    assert.equal(cafePlace?.enrichment?.translation, "café / coffee shop");
    assert.notEqual(cafeDrink?.enrichment?.shortUsage, cafePlace?.enrichment?.shortUsage);

    assert.equal(woman?.enrichment?.translation, "woman");
    assert.equal(wife?.enrichment?.translation, "wife / female partner");
    assert.notEqual(woman?.enrichment?.shortUsage, wife?.enrichment?.shortUsage);

    assert.equal(father?.enrichment?.translation, "father / dad");
    assert.equal(parents?.enrichment?.translation, "parents");
    assert.notEqual(father?.enrichment?.shortUsage, parents?.enrichment?.shortUsage);
  });

  test("editorial refinement preserves imported provenance", () => {
    const cafeDrink = dictionary.getSense("SENSE-A1-000086");
    const kinds = new Set(cafeDrink?.enrichment?.sources.map((source) => source.kind) ?? []);
    assert.equal(kinds.has("SPANSTORIES_EDITORIAL"), true);
    assert.equal(kinds.has("KAIKKI_WIKTEXTRACT"), true);
  });

  test("editorial refinements retain generated fields they do not define", () => {
    const cafeDrink = dictionary.getSense("SENSE-A1-000086")?.enrichment;
    assert.ok(cafeDrink);
    assert.equal(cafeDrink.partOfSpeechLabel, "Sustantivo");
    assert.ok(cafeDrink.frequency);
    assert.ok((cafeDrink.relatedWords?.length ?? 0) > 0);
    assert.equal(
      new Set(cafeDrink.sources.map((source) => `${source.kind}\u0000${source.reference}\u0000${source.label}`)).size,
      cafeDrink.sources.length,
    );
  });
});
