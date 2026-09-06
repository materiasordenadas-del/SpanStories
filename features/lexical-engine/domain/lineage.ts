/**
 * Lexeme lineage: how a published identity may change without being erased.
 *
 * A lineage event never rewrites history. The source ids keep resolving after
 * the event; what changes is their lifecycle and what the engine can say about
 * where they went. This is the mechanism that lets the system answer "this
 * published id still means the same identity" honestly over time.
 *
 * The four kinds are distinguished by cardinality, and the cardinality is part
 * of the meaning rather than a validation detail:
 *
 *   SPLIT        1 source  -> 2+ targets   one identity was too coarse
 *   MERGE        2+ sources -> 1 target    several identities were one
 *   REPLACED_BY  1 source  -> 1 target     same identity, new id
 *   RETIRE       1 source  -> 0 targets    withdrawn, no successor
 *
 * A SPLIT with one target would be a REPLACED_BY wearing the wrong label, and
 * the engine rejects it rather than accepting a claim it cannot support.
 */

import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type { LineageEventId, LexiconReleaseId } from "./ids.ts";

export const LINEAGE_EVENT_KINDS = [
  "SPLIT",
  "MERGE",
  "REPLACED_BY",
  "RETIRE",
] as const;
export type LineageEventKind = (typeof LINEAGE_EVENT_KINDS)[number];

/**
 * What the event claims about meaning, as opposed to about ids.
 *
 *   EQUIVALENT_IDENTITY  the targets denote what the sources denoted
 *   COARSENING           the targets draw a broader distinction than the
 *                        sources did; something the sources separated is no
 *                        longer separated
 *
 * Semantics and kind are independent. A MERGE may be either: two ids for one
 * identity merging is `EQUIVALENT_IDENTITY`; two genuinely different identities
 * being collapsed into one coarser one is `COARSENING`, and that difference is
 * what later phases will need in order to decide whether evidence carries over.
 */
export const LINEAGE_SEMANTICS = ["EQUIVALENT_IDENTITY", "COARSENING"] as const;
export type LineageSemantics = (typeof LINEAGE_SEMANTICS)[number];

/**
 * What may be carried across the event by a later phase.
 *
 * Declared here, honoured nowhere in phase 2: there is no learner state yet to
 * transfer. The policy is recorded at the moment the editorial decision is made
 * so that phase 4 reads a decision rather than re-deriving one.
 *
 *   FULL_EQUIVALENT  everything transfers; only sound under EQUIVALENT_IDENTITY
 *   CONTEXTUAL       transfers only where context supports it
 *   EVIDENCE_ONLY    raw evidence transfers, conclusions do not
 *   NONE             nothing transfers
 */
export const TRANSFER_POLICIES = [
  "FULL_EQUIVALENT",
  "CONTEXTUAL",
  "EVIDENCE_ONLY",
  "NONE",
] as const;
export type TransferPolicy = (typeof TRANSFER_POLICIES)[number];

export type LexemeLineageEvent = {
  readonly id: LineageEventId;
  readonly kind: LineageEventKind;
  readonly sourceLexemeIds: readonly LexemeId[];
  readonly targetLexemeIds: readonly LexemeId[];
  readonly semantics: LineageSemantics;
  readonly transferPolicy: TransferPolicy;
  /** Lexicon release from which this event is in force. */
  readonly effectiveRelease: LexiconReleaseId;
  /** Why the change was made. Required: an unexplained event is not auditable. */
  readonly reason: string;
};

/** Cardinality each kind requires, as [minSources, maxSources, minTargets, maxTargets]. */
type Cardinality = {
  readonly minSources: number;
  readonly maxSources: number | null;
  readonly minTargets: number;
  readonly maxTargets: number | null;
};

export const LINEAGE_CARDINALITY: Readonly<
  Record<LineageEventKind, Cardinality>
> = {
  SPLIT: { minSources: 1, maxSources: 1, minTargets: 2, maxTargets: null },
  MERGE: { minSources: 2, maxSources: null, minTargets: 1, maxTargets: 1 },
  REPLACED_BY: { minSources: 1, maxSources: 1, minTargets: 1, maxTargets: 1 },
  RETIRE: { minSources: 1, maxSources: 1, minTargets: 0, maxTargets: 0 },
};

/**
 * Transfer policies each semantics may legitimately carry.
 *
 * `FULL_EQUIVALENT` under `COARSENING` is the combination this forbids: if the
 * event admits the distinction was lost, it cannot also claim everything
 * transfers unchanged. Coarsening on its own implies no transfer at all; it
 * only records that the identities were folded together.
 */
export const ALLOWED_TRANSFER_POLICIES: Readonly<
  Record<LineageSemantics, ReadonlySet<TransferPolicy>>
> = {
  EQUIVALENT_IDENTITY: new Set<TransferPolicy>([
    "FULL_EQUIVALENT",
    "CONTEXTUAL",
    "EVIDENCE_ONLY",
    "NONE",
  ]),
  COARSENING: new Set<TransferPolicy>(["CONTEXTUAL", "EVIDENCE_ONLY", "NONE"]),
};

/** Lifecycle a source lexeme takes on once an event of this kind applies. */
export function lifecycleAfterEvent(
  kind: LineageEventKind,
): "SUPERSEDED" | "RETIRED" {
  return kind === "RETIRE" ? "RETIRED" : "SUPERSEDED";
}
