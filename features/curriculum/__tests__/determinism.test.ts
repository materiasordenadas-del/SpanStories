/**
 * Determinism: same source bytes + same importer version -> same registry.
 *
 * The wall-clock timestamp is the one field allowed to differ; the test pins
 * two different clocks precisely so a stable `contentHash` cannot be an
 * accident of both runs happening in the same millisecond.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { importCurriculumOrThrow } from "../import/importer.ts";
import { COLLECTION_FILES, RELEASE_FILE } from "../registry/files.ts";
import { readRegistry, writeRegistry } from "../registry/serialize.ts";

describe("determinism", () => {
  const first = importCurriculumOrThrow({
    now: () => new Date("2020-01-01T00:00:00.000Z"),
  });
  const second = importCurriculumOrThrow({
    now: () => new Date("2031-12-31T23:59:59.999Z"),
  });

  test("only the timestamp differs between two imports", () => {
    assert.notEqual(first.release.generatedAt, second.release.generatedAt);
    assert.equal(first.release.contentHash, second.release.contentHash);
    assert.deepEqual(first.release.sourceHashes, second.release.sourceHashes);
  });

  test("canonical data is byte-identical", () => {
    assert.equal(
      JSON.stringify(first.data),
      JSON.stringify(second.data),
      "canonical data must not depend on iteration or filesystem order",
    );
  });

  test("ids, relations and counts are stable", () => {
    assert.deepEqual(
      first.data.lexemes.map((v) => v.id),
      second.data.lexemes.map((v) => v.id),
    );
    assert.deepEqual(
      first.data.recycleEdges.map((v) => `${v.id}:${v.introductionStoryId}>${v.returnStoryId}`),
      second.data.recycleEdges.map((v) => `${v.id}:${v.introductionStoryId}>${v.returnStoryId}`),
    );
    assert.deepEqual(first.release.actualCounts, second.release.actualCounts);
  });

  test("collections are in canonical order", () => {
    const sorted = <T>(values: readonly T[], key: (value: T) => string): boolean =>
      values.every((value, i) => i === 0 || key(values[i - 1]) <= key(value));
    assert.ok(sorted(first.data.lexemes, (v) => v.id));
    assert.ok(sorted(first.data.lexemeForms, (v) => v.id));
    assert.ok(sorted(first.data.senses, (v) => v.id));
    assert.ok(sorted(first.data.sourceAssertions, (v) => v.id));
    assert.ok(sorted(first.data.targets, (v) => v.allocationId));
    assert.ok(sorted(first.data.recycleEdges, (v) => v.id));
    assert.ok(sorted(first.data.storyBlueprints, (v) => String(v.sequenceIndex).padStart(6, "0")));
  });

  test("writing the registry twice produces identical files", () => {
    const dirA = mkdtempSync(join(tmpdir(), "spanstories-registry-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "spanstories-registry-b-"));
    try {
      writeRegistry(first.release, first.data, dirA);
      writeRegistry(second.release, second.data, dirB);
      for (const [, file] of COLLECTION_FILES) {
        assert.equal(
          readFileSync(join(dirA, file), "utf8"),
          readFileSync(join(dirB, file), "utf8"),
          `${file} must be byte-identical across imports`,
        );
      }
      // The manifest differs only by generatedAt.
      const a = JSON.parse(readFileSync(join(dirA, RELEASE_FILE), "utf8")) as Record<string, unknown>;
      const b = JSON.parse(readFileSync(join(dirB, RELEASE_FILE), "utf8")) as Record<string, unknown>;
      assert.notEqual(a["generatedAt"], b["generatedAt"]);
      delete a["generatedAt"];
      delete b["generatedAt"];
      assert.deepEqual(a, b);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  test("a written registry reads back unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "spanstories-registry-rt-"));
    try {
      writeRegistry(first.release, first.data, dir);
      const loaded = readRegistry(dir);
      assert.equal(loaded.release.contentHash, first.release.contentHash);
      assert.equal(JSON.stringify(loaded.data), JSON.stringify(first.data));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
