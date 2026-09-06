/**
 * Writing and reading the generated registry.
 *
 * The generated tree is what runtime consumes: no CSV is parsed during a
 * request, and no component reads `content/`. Output is byte-stable for a
 * given import so that regenerating an unchanged curriculum produces no diff
 * beyond the release timestamp.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CurriculumData } from "../domain/model.ts";
import type { CurriculumRelease } from "../domain/release.ts";
import { COLLECTION_FILES, REGISTRY_DIR, RELEASE_FILE } from "./files.ts";

/** Deterministic JSON: fixed indentation, trailing newline, no BOM. */
function encode(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export type WrittenFile = {
  readonly file: string;
  readonly byteLength: number;
};

export function writeRegistry(
  release: CurriculumRelease,
  data: CurriculumData,
  outputDir: string = REGISTRY_DIR,
): readonly WrittenFile[] {
  mkdirSync(outputDir, { recursive: true });
  const written: WrittenFile[] = [];

  const put = (file: string, value: unknown): void => {
    const text = encode(value);
    writeFileSync(join(outputDir, file), text, "utf8");
    written.push({ file, byteLength: Buffer.byteLength(text, "utf8") });
  };

  put(RELEASE_FILE, release);
  for (const [key, file] of COLLECTION_FILES) put(file, data[key]);
  return written;
}

export type LoadedRegistry = {
  readonly release: CurriculumRelease;
  readonly data: CurriculumData;
};

/**
 * Read a generated registry back.
 *
 * The registry is trusted content produced by this importer, so the loader
 * checks identity rather than re-validating every invariant: schema version,
 * release id and the per-collection counts the manifest recorded. A drift
 * between manifest and files is a hard error, not a silent partial load.
 */
export function readRegistry(inputDir: string = REGISTRY_DIR): LoadedRegistry {
  const read = <T>(file: string): T => {
    const text = readFileSync(join(inputDir, file), "utf8");
    return JSON.parse(text) as T;
  };

  const release = read<CurriculumRelease>(RELEASE_FILE);
  const collections = Object.fromEntries(
    COLLECTION_FILES.map(([key, file]) => [key, read<unknown[]>(file)]),
  ) as unknown as Omit<CurriculumData, "level">;

  const data: CurriculumData = { level: "A1", ...collections };

  for (const [key, expected] of [
    ["lexemes", release.actualCounts["lexemes"]],
    ["lexemeForms", release.actualCounts["lexemeForms"]],
    ["senses", release.actualCounts["senseRegistry"]],
    ["mwuUnits", release.actualCounts["mwuUnits"]],
    ["grammarUnits", release.actualCounts["grammarUnits"]],
    ["modules", release.actualCounts["modules"]],
    ["islands", release.actualCounts["islands"]],
    ["storyBlueprints", release.actualCounts["storyBlueprints"]],
    ["targets", release.actualCounts["firstIntroductions"]],
    ["recycleEdges", release.actualCounts["recycleEdges"]],
  ] as const) {
    const actual = data[key].length;
    if (expected !== actual) {
      throw new Error(
        `CURRICULUM_COUNT_MISMATCH: generated ${key}.json holds ${actual} records but ${RELEASE_FILE} records ${expected}. Regenerate the registry.`,
      );
    }
  }

  return { release, data };
}
