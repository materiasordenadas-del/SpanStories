/**
 * Reading and writing the image-reference registry.
 *
 * Same discipline as the curriculum registry: deterministic JSON (fixed
 * indentation, trailing newline), and validation on every read so a hand-edit
 * of the source can never reach a page silently corrupted.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { MediaRegistryError, mediaIssue, type MediaIssue } from "../domain/errors.ts";
import { validateBinding, type SenseImageBinding } from "../domain/sense-image-binding.ts";
import { CANONICAL_SOURCE_FILE, IMAGES_FILE, REGISTRY_DIR } from "./files.ts";

function encode(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Validate a set of bindings as a whole: every binding internally sound, plus
 * the one cross-binding rule a single `validateBinding` call cannot see —
 * no Sense declared twice.
 */
export function validateBindings(bindings: readonly SenseImageBinding[]): readonly MediaIssue[] {
  const issues: MediaIssue[] = [];
  const seenSenses = new Set<string>();
  for (const binding of bindings) {
    issues.push(...validateBinding(binding));
    if (seenSenses.has(binding.senseId)) {
      issues.push(
        mediaIssue("MEDIA_DUPLICATE_SENSE", "senseId is declared by more than one binding", {
          senseId: binding.senseId,
        }),
      );
    }
    seenSenses.add(binding.senseId);
  }
  return issues;
}

/** Read the hand-maintained editorial source. Empty file reads as `[]`. */
export function readSourceBindings(
  sourceFile: string = CANONICAL_SOURCE_FILE,
): readonly SenseImageBinding[] {
  const text = readFileSync(sourceFile, "utf8");
  return JSON.parse(text) as SenseImageBinding[];
}

/**
 * Compile the editorial source into the generated registry. Throws
 * `MediaRegistryError` rather than writing a registry that fails its own
 * invariants.
 */
export function buildImageRegistry(
  sourceFile: string = CANONICAL_SOURCE_FILE,
  outputDir: string = REGISTRY_DIR,
): readonly SenseImageBinding[] {
  const bindings = readSourceBindings(sourceFile);
  const issues = validateBindings(bindings);
  if (issues.length > 0) throw new MediaRegistryError(issues);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, IMAGES_FILE), encode(bindings), "utf8");
  return bindings;
}

/**
 * Read the generated registry back. Re-validates: the generated file is
 * trusted content, but a stale copy left over from a failed build must not
 * be served as if it were current.
 */
export function readImageRegistry(inputDir: string = REGISTRY_DIR): readonly SenseImageBinding[] {
  const text = readFileSync(join(inputDir, IMAGES_FILE), "utf8");
  const bindings = JSON.parse(text) as SenseImageBinding[];
  const issues = validateBindings(bindings);
  if (issues.length > 0) throw new MediaRegistryError(issues);
  return bindings;
}

/** Ensure the editorial source file exists before it is ever read or edited. */
export function ensureSourceFile(sourceFile: string = CANONICAL_SOURCE_FILE): void {
  mkdirSync(dirname(sourceFile), { recursive: true });
  try {
    writeFileSync(sourceFile, encode([]), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }
}
