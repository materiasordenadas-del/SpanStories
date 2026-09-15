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

  test("resolves the existing Hola learner reference by Sense id", () => {
    const hola = dictionary.getSense("SENSE-A1-000292");
    assert.ok(hola);
    assert.equal(hola.item, "hola");
    assert.equal(hola.enrichment?.translation, "hello / hi");
    assert.equal(hola.enrichment?.partOfSpeechLabel, "Interjección");
    assert.ok((hola.enrichment?.examples.length ?? 0) >= 3);
  });

  test("reports enrichment coverage explicitly instead of inventing missing content", () => {
    assert.equal(dictionary.stats.enrichedSenseCount, 1);
    assert.equal(dictionary.stats.missingEnrichmentCount, 601);
  });
});
