/**
 * Lexicon release.
 *
 * A `LexiconRelease` says which *lexical interpretation* is active. It is not a
 * `CurriculumRelease`, and the distinction is the point of the type:
 *
 *   CurriculumRelease  what is taught, in what order, on whose authority
 *   LexiconRelease     how lexical identity is drawn: which lexemes are one
 *                      identity, which are two, what lineage has happened
 *
 * They move independently. Splitting `cura` into two lexemes changes the
 * lexicon without changing a single curricular decision; resequencing an island
 * changes the curriculum without touching identity. Phase 2 therefore ships a
 * lexicon release that is *aligned to* the current curriculum release by
 * recording its id, not one that is derived from it.
 */

import type { LexiconReleaseId } from "./ids.ts";

/** Schema version of the lexical layer, owned by this feature. */
export const LEXICON_SCHEMA_VERSION = "lexicon/1.0.0";

export type LexiconRelease = {
  readonly releaseId: LexiconReleaseId;
  readonly schemaVersion: string;
  /**
   * The curriculum release this lexical interpretation was drawn over.
   *
   * A back-reference for auditing, not a dependency: a later lexicon release
   * may be issued against the same curriculum release, and vice versa.
   */
  readonly curriculumReleaseId: string;
  /** Counts observed in this interpretation, for a cheap integrity check. */
  readonly lexemeCount: number;
  readonly homographGroupCount: number;
  readonly relationCount: number;
  readonly lineageEventCount: number;
};
