/**
 * The lexical-media pilot is deliberately closed to Story 1 and Story 2.
 * These tests exist to catch the one mistake that would defeat that: a
 * refactor that quietly changes what `getStoryReaderViewModel` calls
 * `storyId`, or a call site that runs the adapter before checking the gate.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getStoryReaderViewModel } from "../../../features/story-reader/reader.ts";
import {
  PILOT_STORY_IDS,
  resolveDictionaryImage,
  resolveSurfaceOnlyImage,
  withPilotDictionaryImages,
} from "../word-panel-image.ts";

// Real, APPROVED in content/a1/images/bindings.json as of this pilot.
const SENSE_WITH_IMAGE = "SENSE-A1-000140"; // clase
const SENSE_WITHOUT_IMAGE = "SENSE-A1-000046"; // apellido — real Sense, no clear photographic candidate

describe("word-panel-image / pilot gating", () => {
  test("Story 1 (story-reader-1-1) resolves an image for a bound Sense", () => {
    assert.notEqual(resolveDictionaryImage("story-reader-1-1", SENSE_WITH_IMAGE), undefined);
  });

  test("Story 2 (story-reader-1-2) resolves an image for the same bound Sense", () => {
    assert.notEqual(resolveDictionaryImage("story-reader-1-2", SENSE_WITH_IMAGE), undefined);
  });

  test("Story 3 (story-reader-1-3) gets no image for the same bound Sense — the pilot gate, not the binding, decides", () => {
    assert.equal(resolveDictionaryImage("story-reader-1-3", SENSE_WITH_IMAGE), undefined);
  });

  test("an unpiloted, unrelated storyId never resolves an image even for a well-bound Sense", () => {
    assert.equal(resolveDictionaryImage("story-reader-9-9", SENSE_WITH_IMAGE), undefined);
  });

  test("PILOT_STORY_IDS matches exactly what the real reader produces for routes 01/01 and 01/02", async () => {
    const story1 = await getStoryReaderViewModel("01", "01");
    const story2 = await getStoryReaderViewModel("01", "02");
    assert.equal(PILOT_STORY_IDS.has(story1.storyId), true);
    assert.equal(PILOT_STORY_IDS.has(story2.storyId), true);
    assert.equal(PILOT_STORY_IDS.size, 2);
  });

  test("no story outside the pilot shows a dictionaryImage: 01/03 and 01/04 stay disabled", async () => {
    const story3 = await getStoryReaderViewModel("01", "03");
    const story4 = await getStoryReaderViewModel("01", "04");
    for (const model of [story3, story4]) {
      assert.equal(PILOT_STORY_IDS.has(model.storyId), false);
      const enriched = withPilotDictionaryImages(model);
      for (const entry of Object.values(enriched.surfaceEntries)) {
        assert.equal(entry.panel.dictionaryImage, undefined);
      }
      for (const entry of Object.values(enriched.lexicalEntries)) {
        assert.equal(entry.panel.dictionaryImage, undefined);
      }
    }
  });
});

describe("word-panel-image / missing and broken images never break the panel", () => {
  test("a Sense with no binding resolves to undefined, not an error", () => {
    assert.equal(resolveDictionaryImage("story-reader-1-1", SENSE_WITHOUT_IMAGE), undefined);
  });

  test("an unknown senseId resolves to undefined rather than throwing", () => {
    assert.doesNotThrow(() => resolveDictionaryImage("story-reader-1-1", "SENSE-A1-999999"));
    assert.equal(resolveDictionaryImage("story-reader-1-1", "SENSE-A1-999999"), undefined);
  });

  test("a null or absent senseId resolves to undefined rather than throwing", () => {
    assert.equal(resolveDictionaryImage("story-reader-1-1", null), undefined);
    assert.equal(resolveDictionaryImage("story-reader-1-1", undefined), undefined);
  });

  test("withPilotDictionaryImages leaves an entry's panel otherwise intact when no image resolves", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "01"));
    const entry = Object.values(model.lexicalEntries).find((candidate) => candidate.senseId === SENSE_WITHOUT_IMAGE);
    assert.notEqual(entry, undefined);
    assert.equal(entry?.panel.dictionaryImage, undefined);
    assert.equal((entry?.panel.surface.length ?? 0) > 0, true);
  });
});

describe("word-panel-image / the panel receives a plain ViewModel, never lexical-media internals", () => {
  test("the resolved image carries only the whitelisted display fields", () => {
    const image = resolveDictionaryImage("story-reader-1-1", SENSE_WITH_IMAGE);
    assert.notEqual(image, undefined);
    const allowedKeys = new Set(["src", "thumbnailSrc", "alt", "creator", "license", "licenseUrl", "sourcePageUrl", "provider"]);
    for (const key of Object.keys(image ?? {})) assert.ok(allowedKeys.has(key), `unexpected key leaked to the panel: ${key}`);
    // Internal lexical-media shape must never leak through: no rank, status, providerAssetId or remoteImageUrl.
    assert.equal((image as Record<string, unknown>).rank, undefined);
    assert.equal((image as Record<string, unknown>).status, undefined);
    assert.equal((image as Record<string, unknown>).providerAssetId, undefined);
    assert.equal((image as Record<string, unknown>).remoteImageUrl, undefined);
  });
});

describe("word-panel-image / surface-only images (no published A1 Sense exists for the word)", () => {
  test("Canadá, Colombia and their demonym adjectives resolve a flag inside the pilot", () => {
    assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-1", "Canadá"), undefined);
    assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-2", "Colombia"), undefined);
    assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-1", "canadiense"), undefined);
    assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-2", "colombiano"), undefined);
  });

  test("verbs with no published A1 Sense (decir, mirar, sonreír, responder) still resolve an image", () => {
    for (const surface of ["dice", "mira", "sonríe", "responde"]) {
      assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-1", surface), undefined, surface);
    }
  });

  test("lista, vez and final resolve an image with no published Sense behind them", () => {
    for (const surface of ["lista", "vez", "final"]) {
      assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-1", surface), undefined, surface);
    }
  });

  test("lookup is case-insensitive on the surface form", () => {
    assert.notEqual(resolveSurfaceOnlyImage("story-reader-1-1", "CANADÁ"), undefined);
  });

  test("surface-only images are gated by the same pilot storyIds as Sense-based images", () => {
    assert.equal(resolveSurfaceOnlyImage("story-reader-1-3", "Canadá"), undefined);
    assert.equal(resolveSurfaceOnlyImage("story-reader-1-3", "dice"), undefined);
  });

  test("an unknown surface resolves to undefined, not an error", () => {
    assert.equal(resolveSurfaceOnlyImage("story-reader-1-1", "Toronto"), undefined);
  });

  test("repetir has a published Sense but no clear photographic candidate, so it stays without an image rather than an ambiguous one", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "01"));
    const entry = Object.values(model.surfaceEntries).find((candidate) => candidate.surface.toLocaleLowerCase("es") === "repite");
    if (entry !== undefined) assert.equal(entry.panel.dictionaryImage, undefined);
  });

  test("Story 1's own occurrence of Canadá resolves a flag end to end", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "01"));
    const entry = [...Object.values(model.lexicalEntries), ...Object.values(model.surfaceEntries)]
      .find((candidate) => candidate.surface.toLocaleLowerCase("es") === "canadá");
    assert.notEqual(entry, undefined, "expected an entry for \"Canadá\" in Story 1");
    assert.notEqual(entry?.panel.dictionaryImage, undefined);
  });

  test("Story 1's own occurrences of final, encantado and mañana resolve an image end to end", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "01"));
    const bySurface = new Map([...Object.values(model.lexicalEntries), ...Object.values(model.surfaceEntries)]
      .map((entry) => [entry.surface.toLocaleLowerCase("es"), entry]));
    for (const surface of ["final", "encantado", "mañana"]) {
      const entry = bySurface.get(surface);
      assert.notEqual(entry, undefined, `expected an entry for "${surface}" in Story 1`);
      assert.notEqual(entry?.panel.dictionaryImage, undefined, `expected a dictionary image for "${surface}"`);
    }
  });
});

describe("word-panel-image / Story 2 editorial surface→Sense coverage", () => {
  test("nouns and verbs curated for Story 2 resolve a dictionary image", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "02"));
    const bySurface = new Map(Object.values(model.surfaceEntries).map((entry) => [entry.surface.toLocaleLowerCase("es"), entry]));
    for (const surface of ["clase", "profesor", "chico", "mapa", "escucha", "habla", "años", "edad", "tengo", "rápido"]) {
      const entry = bySurface.get(surface);
      assert.notEqual(entry, undefined, `expected a surface entry for "${surface}"`);
      assert.notEqual(entry?.panel.dictionaryImage, undefined, `expected a dictionary image for "${surface}"`);
    }
  });

  test("decir/mirar/sonreír resolve through the surface-only table, not through a fabricated senseId", async () => {
    const model = withPilotDictionaryImages(await getStoryReaderViewModel("01", "02"));
    const bySurface = new Map(Object.values(model.surfaceEntries).map((entry) => [entry.surface.toLocaleLowerCase("es"), entry]));
    for (const surface of ["dice", "mira", "sonríe"]) {
      const entry = bySurface.get(surface);
      assert.notEqual(entry, undefined, `expected a surface entry for "${surface}"`);
      assert.equal(entry?.senseId, undefined);
      assert.notEqual(entry?.panel.dictionaryImage, undefined);
    }
  });
});
