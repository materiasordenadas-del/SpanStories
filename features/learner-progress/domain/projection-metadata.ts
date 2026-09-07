/**
 * Metadata every reconstructible projection carries.
 *
 * `calculatedAt` is the only field that legitimately differs between two
 * rebuilds of the same event log — mirrors `CurriculumRelease.generatedAt`
 * (phase 1) and is excluded the same way from any equality check that claims
 * "these two projections have the same content" (see
 * `../__tests__/rebuildability.test.ts`).
 */

import type { LexiconReleaseId } from "../../lexical-engine/index.ts";

export type ProjectionMetadata = {
  readonly projectionAlgorithmVersion: string;
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: LexiconReleaseId;
  /** Events with `occurredAt` after this instant are excluded from the projection. */
  readonly eventCutoff: string;
  readonly calculatedAt: string;
};

/** `metadata` with `calculatedAt` zeroed out, for logical-content comparison. */
export function withoutCalculatedAt<T extends { readonly metadata: ProjectionMetadata }>(
  value: T,
): T {
  return { ...value, metadata: { ...value.metadata, calculatedAt: "" } };
}
