/**
 * Acceptance criteria for the A1 release.
 *
 * These numbers are checked against the data. They are never used to shape it:
 * nothing here filters, truncates, deduplicates or pads a collection so that a
 * total comes out right. When EXPECTED != ACTUAL the importer reports the
 * discrepancy and fails; it does not make the discrepancy disappear.
 *
 * Two independent expectation sets are evaluated:
 *
 *  1. `ARCHITECTURE_EXPECTED_COUNTS` — stated by the engine architecture.
 *  2. the published audit ledger shipped with the curriculum, parsed at import
 *     time from `spanishstories_a1_ws_sequencing_final_audit_v1.44.csv`.
 *
 * Agreement between the architecture, the published audit and the actual data
 * is what makes the release trustworthy; disagreement is a finding.
 */

import type { CsvRecord } from "./csv.ts";

export type CountKey =
  | "lexemes"
  | "lexemeForms"
  | "senseRegistry"
  | "a1Senses"
  | "a2BoundarySenses"
  | "mwuUnits"
  | "grammarUnits"
  | "modules"
  | "islands"
  | "storyBlueprints"
  | "firstIntroductions"
  | "recycleEdges"
  | "orphanSenses"
  | "orphanForms"
  | "a2BoundaryScheduledAsA1"
  | "backwardRecycleEdges"
  | "duplicatePublishedIds"
  | "regionalReceptiveTargets"
  | "regionalTargetsWithUniversalProductiveDemand"
  | "recycleEdgesClaimingMastery";

export const ARCHITECTURE_EXPECTED_COUNTS: Readonly<Record<CountKey, number>> = {
  lexemes: 599,
  lexemeForms: 666,
  senseRegistry: 608,
  a1Senses: 602,
  a2BoundarySenses: 6,
  mwuUnits: 214,
  grammarUnits: 169,
  modules: 8,
  islands: 32,
  storyBlueprints: 103,
  firstIntroductions: 985,
  recycleEdges: 2955,
  orphanSenses: 0,
  orphanForms: 0,
  a2BoundaryScheduledAsA1: 0,
  backwardRecycleEdges: 0,
  duplicatePublishedIds: 0,
  regionalReceptiveTargets: 16,
  regionalTargetsWithUniversalProductiveDemand: 0,
  recycleEdgesClaimingMastery: 0,
};

/**
 * Audit controls in the published sequencing ledger whose `expected` column is
 * a plain integer, mapped onto the count keys above.
 */
const AUDIT_CONTROL_TO_COUNT: Readonly<Record<string, CountKey>> = {
  "SEQ16D-001": "firstIntroductions",
  "SEQ16D-002": "a1Senses",
  "SEQ16D-003": "grammarUnits",
  "SEQ16D-004": "mwuUnits",
  "SEQ16D-005": "a2BoundaryScheduledAsA1",
  "SEQ16D-006": "modules",
  "SEQ16D-007": "islands",
  "SEQ16D-008": "storyBlueprints",
  "SEQ16D-015": "recycleEdges",
  "SEQ16D-017": "backwardRecycleEdges",
  "SEQ16D-019": "regionalReceptiveTargets",
  "SEQ16D-020": "regionalTargetsWithUniversalProductiveDemand",
  "SEQ16D-021": "recycleEdgesClaimingMastery",
};

export type PublishedExpectation = {
  readonly countKey: CountKey;
  readonly auditId: string;
  readonly control: string;
  readonly expected: number;
};

/**
 * Read the numeric expectations the curriculum publishes about itself.
 *
 * Controls whose `expected` is not a plain integer (ratios such as `0/32`,
 * thresholds such as `<=20`, or the literal `informational`) are deliberately
 * skipped here: they are checked by the dedicated invariants instead of being
 * coerced into a number.
 */
export function readPublishedExpectations(
  records: readonly CsvRecord[],
): readonly PublishedExpectation[] {
  const out: PublishedExpectation[] = [];
  for (const record of records) {
    const auditId = record.values["audit_id"] ?? "";
    const countKey = AUDIT_CONTROL_TO_COUNT[auditId];
    if (countKey === undefined) continue;
    const expected = record.values["expected"] ?? "";
    if (!/^\d+$/.test(expected)) continue;
    out.push({
      countKey,
      auditId,
      control: record.values["control"] ?? "",
      expected: Number.parseInt(expected, 10),
    });
  }
  return out;
}
