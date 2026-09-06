/**
 * Reproducible manifest describing one canonical curriculum import.
 *
 * The manifest separates two things that are easy to confuse:
 *
 *   reproducibility of the content   -> sourceHashes + contentHash
 *   timestamp of the execution       -> generatedAt
 *
 * `generatedAt` is the only value that legitimately changes between two imports
 * of identical bytes, and it is excluded from `contentHash` so that a
 * determinism check cannot fail merely because time passed.
 */

import type { CurriculumIssue } from "./errors.ts";

/**
 * Schema version of the generated registry, owned by this importer.
 *
 * Bumped to 2.0.0 for the `A1-CURRICULUM-v1.51` cutover: the canonical shape of
 * `StoryBlueprint` and `RecycleEdge` changed (FOCUS/SUPPORTED salience,
 * FIRST/SECOND/THIRD return stages, checkpoint flags), so a 1.0.0 registry
 * cannot be read as a 2.0.0 one.
 *
 * This namespace is the importer's own contract and is deliberately distinct
 * from the editorial schema version the curriculum manifest declares
 * (`2.0.0-rc1`): the two version different things and must not be conflated.
 */
export const REGISTRY_SCHEMA_VERSION = "curriculum-registry/2.0.0";

export type SourceFileManifest = {
  /** Basename as published; the importer never renames sources. */
  readonly file: string;
  /** SHA-256 of the raw bytes on disk, hex-encoded. */
  readonly sha256: string;
  readonly byteLength: number;
  /** Data records parsed, header excluded. */
  readonly recordCount: number;
  /** `curriculum_version` the file itself declares, when it carries one. */
  readonly declaredCurriculumVersion: string | null;
};

/**
 * A count the release is expected to have, alongside what the data actually
 * produced. Expectations come from the published audit ledgers wherever the
 * ledgers state them, so the importer checks the data against the curriculum
 * rather than against numbers hardcoded here.
 */
export type CountCheck = {
  readonly key: string;
  readonly expected: number;
  readonly actual: number;
  readonly matches: boolean;
  /** Where the expectation comes from. */
  readonly expectationSource: string;
};

export type ValidationResult = {
  readonly status: "PASS" | "FAIL";
  readonly issueCount: number;
  readonly issues: readonly CurriculumIssue[];
  /** Named invariants that were actually evaluated, and their outcome. */
  readonly invariants: readonly {
    readonly name: string;
    readonly status: "PASS" | "FAIL";
    readonly observed: number | string;
  }[];
};

export type CurriculumRelease = {
  readonly releaseId: string;
  readonly schemaVersion: string;
  readonly level: string;
  /** Per-workstream curriculum versions declared by the sources themselves. */
  readonly curriculumVersions: Readonly<Record<string, string>>;
  readonly sourceFiles: readonly SourceFileManifest[];
  /** file -> sha256, duplicated for direct lookup. */
  readonly sourceHashes: Readonly<Record<string, string>>;
  /**
   * Wall-clock time of this execution. Volatile by definition and excluded
   * from `contentHash`.
   */
  readonly generatedAt: string;
  /**
   * SHA-256 over the canonical registry payload and the source hashes, with
   * every volatile field excluded. Two imports of the same bytes by the same
   * importer version must produce the same value.
   */
  readonly contentHash: string;
  readonly expectedCounts: Readonly<Record<string, number>>;
  readonly actualCounts: Readonly<Record<string, number>>;
  readonly countChecks: readonly CountCheck[];
  readonly validationResult: ValidationResult;
};
