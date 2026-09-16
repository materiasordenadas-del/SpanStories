import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { validateBindings } from "../registry/serialize.ts";
import { createImageRegistry } from "../registry/query.ts";
import { buildImageRegistry, readImageRegistry } from "../registry/serialize.ts";
import { writeFileSync } from "node:fs";
import type { SenseImageBinding } from "../domain/sense-image-binding.ts";

function candidate(rank: number, status: "APPROVED" | "FALLBACK" | "REJECTED" | "PENDING_REVIEW") {
  return {
    rank,
    provider: "wikimedia" as const,
    providerAssetId: `File:Example-${rank}.jpg`,
    remoteImageUrl: `https://example.org/full-${rank}.jpg`,
    thumbnailUrl: `https://example.org/thumb-${rank}.jpg`,
    sourcePageUrl: `https://example.org/page-${rank}`,
    creator: "Jane Doe",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    altText: "un gato",
    status,
    validatedAt: "2026-01-01",
  };
}

describe("lexical-media / ImageRegistry", () => {
  test("resolves the lowest-rank servable candidate", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [candidate(2, "FALLBACK"), candidate(1, "APPROVED")],
    };
    const registry = createImageRegistry([binding]);
    const resolved = registry.resolveImageForSense("SENSE-A1-000123");
    assert.equal(resolved?.rank, 1);
  });

  test("APPROVED wins over FALLBACK even when FALLBACK has the lower rank", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [candidate(1, "FALLBACK"), candidate(2, "APPROVED")],
    };
    const registry = createImageRegistry([binding]);
    const resolved = registry.resolveImageForSense("SENSE-A1-000123");
    assert.equal(resolved?.status, "APPROVED");
    assert.equal(resolved?.rank, 2);
  });

  test("FALLBACK resolves when no APPROVED candidate exists", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [candidate(1, "FALLBACK")],
    };
    const registry = createImageRegistry([binding]);
    const resolved = registry.resolveImageForSense("SENSE-A1-000123");
    assert.equal(resolved?.status, "FALLBACK");
  });

  test("skips a rejected rank-1 candidate and falls back to rank 2", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [candidate(1, "REJECTED"), candidate(2, "FALLBACK")],
    };
    const registry = createImageRegistry([binding]);
    const resolved = registry.resolveImageForSense("SENSE-A1-000123");
    assert.equal(resolved?.rank, 2);
  });

  test("a Sense with no binding resolves to null, not an error", () => {
    const registry = createImageRegistry([]);
    assert.equal(registry.resolveImageForSense("SENSE-A1-999999"), null);
  });

  test("a Sense whose only candidate is pending review resolves to null", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [candidate(1, "PENDING_REVIEW")],
    };
    const registry = createImageRegistry([binding]);
    assert.equal(registry.resolveImageForSense("SENSE-A1-000123"), null);
  });

  test("catches the same Sense declared by two bindings", () => {
    const bindings: SenseImageBinding[] = [
      { senseId: "SENSE-A1-000123", candidates: [candidate(1, "APPROVED")] },
      { senseId: "SENSE-A1-000123", candidates: [candidate(1, "APPROVED")] },
    ];
    const issues = validateBindings(bindings);
    assert.ok(issues.some((issue) => issue.code === "MEDIA_DUPLICATE_SENSE"));
  });
});

describe("lexical-media / registry build + read round trip", () => {
  test("build writes a generated file that reads back byte-identical in content", () => {
    const dir = mkdtempSync(join(tmpdir(), "lexical-media-"));
    const sourceFile = join(dir, "bindings.json");
    const outputDir = join(dir, "generated");
    const bindings: SenseImageBinding[] = [
      { senseId: "SENSE-A1-000123", candidates: [candidate(1, "APPROVED")] },
    ];
    writeFileSync(sourceFile, JSON.stringify(bindings), "utf8");

    try {
      buildImageRegistry(sourceFile, outputDir);
      const readBack = readImageRegistry(outputDir);
      assert.deepEqual(readBack, bindings);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("build refuses to write a registry with an invalid binding", () => {
    const dir = mkdtempSync(join(tmpdir(), "lexical-media-"));
    const sourceFile = join(dir, "bindings.json");
    const outputDir = join(dir, "generated");
    writeFileSync(
      sourceFile,
      JSON.stringify([{ senseId: "not-a-real-id", candidates: [] }]),
      "utf8",
    );

    try {
      assert.throws(() => buildImageRegistry(sourceFile, outputDir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
