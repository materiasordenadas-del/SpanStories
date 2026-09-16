import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { findImageCandidates } from "../search/find-image-candidates.ts";
import { buildSearchQueries } from "../search/query-builder.ts";
import type { DiscoveredImageCandidate } from "../providers/types.ts";

function fakeCandidate(
  provider: "openverse" | "wikimedia",
  providerAssetId: string,
): DiscoveredImageCandidate {
  return {
    provider,
    providerAssetId,
    remoteImageUrl: `https://example.org/${provider}/${providerAssetId}`,
    thumbnailUrl: `https://example.org/${provider}/${providerAssetId}-thumb`,
    sourcePageUrl: `https://example.org/${provider}/${providerAssetId}-page`,
    creator: "Jane Doe",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    title: providerAssetId,
  };
}

describe("lexical-media / query-builder", () => {
  test("a plain string input becomes its own single query", () => {
    assert.deepEqual(buildSearchQueries("gato"), ["gato"]);
  });

  test("prefers translation and gloss over the bare lemma", () => {
    const queries = buildSearchQueries({
      lemma: "banco",
      partOfSpeech: "NOUN",
      gloss: "asiento para sentarse",
      translation: "bench",
    });
    assert.deepEqual(queries, ["bench", "asiento para sentarse", "banco"]);
  });

  test("a curator override query comes first", () => {
    const queries = buildSearchQueries({ lemma: "banco", query: "park bench" });
    assert.deepEqual(queries, ["park bench", "banco"]);
  });

  test("does not depend on lemma alone: a lemma-only context still searches", () => {
    assert.deepEqual(buildSearchQueries({ lemma: "mesa" }), ["mesa"]);
  });

  test("drops duplicate fields", () => {
    assert.deepEqual(
      buildSearchQueries({ lemma: "bench", translation: "bench" }),
      ["bench"],
    );
  });
});

describe("lexical-media / findImageCandidates", () => {
  test("a failing Openverse provider does not prevent Wikimedia results", async () => {
    const { candidates, providerErrors } = await findImageCandidates("mesa", {
      providers: {
        openverse: () => Promise.reject(new Error("OPENVERSE_DOWN")),
        wikimedia: () => Promise.resolve([fakeCandidate("wikimedia", "File:Mesa.jpg")]),
      },
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.provider, "wikimedia");
    assert.ok(providerErrors.some((error) => error.provider === "openverse"));
  });

  test("a failing Wikimedia provider does not prevent Openverse results", async () => {
    const { candidates, providerErrors } = await findImageCandidates("mesa", {
      providers: {
        openverse: () => Promise.resolve([fakeCandidate("openverse", "uuid-1")]),
        wikimedia: () => Promise.reject(new Error("WIKIMEDIA_DOWN")),
      },
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.provider, "openverse");
    assert.ok(providerErrors.some((error) => error.provider === "wikimedia"));
  });

  test("deduplicates the same provider asset returned by more than one query", async () => {
    const { candidates } = await findImageCandidates(
      { lemma: "banco", translation: "bench" },
      {
        providers: {
          openverse: () => Promise.resolve([fakeCandidate("openverse", "uuid-1")]),
          wikimedia: () => Promise.resolve([]),
        },
      },
    );
    assert.equal(candidates.length, 1);
  });

  test("runs a contextual search across multiple built queries", async () => {
    const queriesSeen: string[] = [];
    const { queriesUsed } = await findImageCandidates(
      { lemma: "banco", gloss: "asiento para sentarse", translation: "bench" },
      {
        providers: {
          openverse: (query) => {
            queriesSeen.push(query);
            return Promise.resolve([]);
          },
          wikimedia: () => Promise.resolve([]),
        },
      },
    );
    assert.deepEqual(queriesUsed, ["bench", "asiento para sentarse", "banco"]);
    assert.deepEqual(queriesSeen, ["bench", "asiento para sentarse", "banco"]);
  });
});
