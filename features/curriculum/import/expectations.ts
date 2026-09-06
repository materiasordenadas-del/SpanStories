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
 *     time from `spanishstories_a1_ws_sequencing_final_audit_v1.51.csv`.
 *
 * Agreement between the architecture, the published audit and the actual data
 * is what makes the release trustworthy; disagreement is a finding.
 */

import type { CsvRecord } from "./csv.ts";

export type CountKey =
  // inventory — unchanged by the 103 -> 32 restructure
  | "lexemes"
  | "lexemeForms"
  | "senseRegistry"
  | "a1Senses"
  | "a2BoundarySenses"
  | "mwuUnits"
  | "grammarUnits"
  // topology
  | "modules"
  | "islands"
  | "storyBlueprints"
  // scheduling
  | "firstIntroductions"
  | "focusFirstIntroductions"
  | "supportedFirstIntroductions"
  | "maxFocusPerStory"
  | "islandCheckpoints"
  | "moduleCheckpoints"
  | "dedicatedFinalTransferStories"
  | "capstoneFirstIntroductions"
  | "deleTaskStructures"
  // return graph
  | "recycleEdges"
  | "firstReturnEdges"
  | "secondReturnEdges"
  | "thirdReturnEdges"
  // integrity — every one of these must be zero
  | "orphanSenses"
  | "orphanForms"
  | "a2BoundaryScheduledAsA1"
  | "backwardRecycleEdges"
  | "routeOrderViolations"
  | "duplicatePublishedIds"
  | "regionalTargetsWithUniversalProductiveDemand"
  | "recycleEdgesClaimingMastery"
  | "versionStampedColumns"
  // measured, not required to be zero
  | "regionalReceptiveTargets";

export const ARCHITECTURE_EXPECTED_COUNTS: Readonly<Record<CountKey, number>> = {
  lexemes: 599,
  lexemeForms: 666,
  senseRegistry: 608,
  a1Senses: 602,
  a2BoundarySenses: 6,
  mwuUnits: 214,
  grammarUnits: 169,
  modules: 8,
  islands: 11,
  storyBlueprints: 32,
  firstIntroductions: 985,
  focusFirstIntroductions: 448,
  supportedFirstIntroductions: 537,
  maxFocusPerStory: 20,
  islandCheckpoints: 11,
  moduleCheckpoints: 8,
  dedicatedFinalTransferStories: 1,
  capstoneFirstIntroductions: 0,
  deleTaskStructures: 13,
  recycleEdges: 2867,
  firstReturnEdges: 985,
  secondReturnEdges: 950,
  thirdReturnEdges: 932,
  orphanSenses: 0,
  orphanForms: 0,
  a2BoundaryScheduledAsA1: 0,
  backwardRecycleEdges: 0,
  routeOrderViolations: 0,
  duplicatePublishedIds: 0,
  regionalTargetsWithUniversalProductiveDemand: 0,
  recycleEdgesClaimingMastery: 0,
  versionStampedColumns: 0,
  regionalReceptiveTargets: 16,
};

/** The FOCUS guardrail the curriculum publishes for every story. */
export const MAX_FOCUS_FIRST_INTRODUCTIONS_PER_STORY = 20;

/**
 * Audit controls in the published sequencing ledger whose `expected` column is
 * a plain integer, mapped onto the count keys above.
 *
 * `H-021` and `H-023` state the same totals as `H-007`/`H-006` from the
 * identity angle ("new Story IDs", "new Island IDs"); mapping them to the same
 * keys keeps both statements checked against the data.
 */
const AUDIT_CONTROL_TO_COUNT: Readonly<Record<string, CountKey>> = {
  "H-001": "firstIntroductions",
  "H-002": "a1Senses",
  "H-003": "grammarUnits",
  "H-004": "mwuUnits",
  "H-005": "modules",
  "H-006": "islands",
  "H-007": "storyBlueprints",
  "H-008": "firstIntroductions",
  "H-010": "capstoneFirstIntroductions",
  "H-011": "dedicatedFinalTransferStories",
  "H-012": "islandCheckpoints",
  "H-013": "moduleCheckpoints",
  "H-014": "recycleEdges",
  "H-015": "firstReturnEdges",
  "H-016": "secondReturnEdges",
  "H-017": "thirdReturnEdges",
  "H-018": "backwardRecycleEdges",
  "H-019": "routeOrderViolations",
  "H-020": "recycleEdgesClaimingMastery",
  "H-021": "storyBlueprints",
  "H-023": "islands",
  "H-024": "versionStampedColumns",
  "H-025": "deleTaskStructures",
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
 * Controls whose `expected` is not a plain integer (thresholds such as `<=20`,
 * or the DELE crosswalk's `>=1 compatible blueprint`) are deliberately skipped
 * here: they are checked by the dedicated invariants instead of being coerced
 * into a number.
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
