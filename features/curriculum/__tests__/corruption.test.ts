/**
 * Deliberate corruption: every case must produce IMPORT FAIL.
 *
 * All mutations are applied to throwaway copies of the artefacts. The files
 * under `content/a1/vocabulary/` are read-only for this suite.
 *
 * Each case proves the importer *rejects* a defect. None of them proves it
 * repairs one: a corrupted release has no valid partial form.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CurriculumImportError, formatIssue } from "../domain/errors.ts";
import { importCurriculum, importCurriculumOrThrow } from "../import/importer.ts";
import {
  codesOf,
  withMutatedSources,
  type SourceMutation,
} from "./fixtures.ts";

const NORMALIZATION = "spanishstories_a1_ws_normalization_master_v1.37.csv";
const ARCHITECTURE = "spanishstories_a1_ws_sequencing_architecture_v1.51.csv";
const ALLOCATION = "spanishstories_a1_ws_sequencing_allocation_v1.51.csv";
const BLUEPRINTS = "spanishstories_a1_ws_story_blueprints_v1.51.csv";
const RECYCLING = "spanishstories_a1_ws_recycling_edges_v1.51.csv";
const AUDIT = "spanishstories_a1_ws_sequencing_final_audit_v1.51.csv";

/** Import a mutated copy and assert it fails, returning the issues. */
function importMutated(mutations: Readonly<Record<string, SourceMutation>>) {
  return withMutatedSources(mutations, (sourceDir) => {
    const result = importCurriculum({ sourceDir });
    assert.equal(
      result.status,
      "IMPORT_FAIL",
      "corrupted sources must not import successfully",
    );
    assert.ok(result.issues.length > 0);
    return result.issues;
  });
}

type Issue = ReturnType<typeof importMutated>[number];

/** Assert that some issue explains the defect in the words we expect. */
function reports(issues: readonly Issue[], fragment: string): void {
  assert.ok(
    issues.some((value) => value.reason.includes(fragment)),
    `no issue mentioned ${JSON.stringify(fragment)}:\n${formatAll(issues)}`,
  );
}

const isLexemeRegistry = (line: string): boolean => line.includes(",LEXEME_REGISTRY,");
const isFormRegistry = (line: string): boolean => line.includes(",LEXEME_FORM_REGISTRY,");
const isSenseRegistry = (line: string): boolean => line.includes(",SENSE_REGISTRY,");
const startsWith = (prefix: string) => (line: string): boolean => line.startsWith(prefix);

const firstIsland = startsWith("ISLAND,A1-M01-I05,");
const firstStory = startsWith("A1-M01-I05-S1,");
const firstAllocation = startsWith("SEQ-A1-000001,");
const firstEdge = startsWith("REC-A1-000001,");
const secondEdge = startsWith("REC-A1-000002,");

describe("deliberate corruption / import must fail", () => {
  // ------------------------------------------------------------- identity

  test("01. duplicate published id", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.appendCopy(isLexemeRegistry);
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_DUPLICATE_ID"), formatAll(issues));
  });

  test("02. orphan Sense", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.replaceInLine(isSenseRegistry, "LEX-A1-000001", "LEX-A1-999999");
      },
    });
    reports(issues, "Sense has no valid Lexeme");
  });

  test("03. orphan LexemeForm", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.replaceInLine(isFormRegistry, "LEX-A1-000001", "LEX-A1-999999");
      },
    });
    reports(issues, "LexemeForm has no valid Lexeme");
  });

  // ------------------------------------------------------------- topology

  test("04. story points at an island that does not exist", () => {
    const issues = importMutated({
      [BLUEPRINTS]: (editor) => {
        editor.replaceInLine(firstStory, ",A1-M01-I05,", ",A1-M09-I09,");
      },
    });
    reports(issues, "StoryBlueprint references an unknown Island");
  });

  test("05. island story_count disagrees with the blueprints", () => {
    const issues = importMutated({
      [ARCHITECTURE]: (editor) => {
        editor.replaceInLine(firstIsland, ",CURRICULUM_SEQUENCE,4,", ",CURRICULUM_SEQUENCE,5,");
      },
    });
    reports(issues, "island holds a different number of story blueprints than it declares");
  });

  test("06. island checkpoint points outside its own island", () => {
    const issues = importMutated({
      [ARCHITECTURE]: (editor) => {
        editor.replaceInLine(
          firstIsland,
          ",A1-M01-I05-S4,A1-M01-I05-S4,",
          ",A1-M02-I05-S1,A1-M01-I05-S4,",
        );
      },
    });
    reports(issues, "island checkpoint story belongs to a different island");
  });

  test("07. module checkpoint points outside its own module", () => {
    const issues = importMutated({
      [ARCHITECTURE]: (editor) => {
        editor.replaceInLine(
          firstIsland,
          ",A1-M01-I05-S4,A1-M01-I05-S4,",
          ",A1-M01-I05-S4,A1-M02-I05-S1,",
        );
      },
    });
    reports(issues, "module checkpoint story belongs to a different module");
  });

  // ----------------------------------------------------------- allocation

  test("08. first introduction points at a story that does not exist", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(firstAllocation, ",A1-M01-I05-S1,", ",A1-M09-I09-S9,");
      },
    });
    reports(issues, "StoryBlueprint that does not exist");
  });

  test("09. a target with two first introductions", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.appendCopy(firstAllocation, (line) =>
          line.replace("SEQ-A1-000001,", "SEQ-A1-900001,"),
        );
      },
    });
    reports(issues, "more than one first introduction");
  });

  test("10. an unknown intro salience", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(firstAllocation, ",SUPPORTED,", ",PARTIAL,");
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_IMPORT_INVALID"), formatAll(issues));
    reports(issues, "published vocabulary is FOCUS | SUPPORTED");
  });

  test("11. a story pushed past the FOCUS guardrail", () => {
    // A1-M04-I05-S1 already carries the maximum of 20 FOCUS introductions;
    // promoting one more SUPPORTED target breaches the published guardrail.
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(startsWith("SEQ-A1-000434,"), ",SUPPORTED,", ",FOCUS,");
      },
    });
    reports(issues, "exceeds the published FOCUS guardrail");
  });

  test("12. declared FOCUS and SUPPORTED no longer add up", () => {
    const issues = importMutated({
      [BLUEPRINTS]: (editor) => {
        editor.replaceInLine(firstStory, ",33,8,25,", ",33,8,24,");
      },
    });
    reports(issues, "do not add up to the declared first-introduction total");
  });

  test("13. the capstone receives a first introduction", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(firstAllocation, ",A1-M01-I05-S1,", ",A1-M08-I06-S3,");
      },
    });
    reports(issues, "capstone story carries a first introduction");
  });

  test("14. an A2 boundary sense scheduled as an A1 target", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        // SENSE-A1-000075 is one of the six published A2 boundary senses.
        editor.replaceInLine(firstAllocation, ",SENSE-A1-000015,", ",SENSE-A1-000075,");
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_TARGET_INVALID"), formatAll(issues));
    reports(issues, "A2 boundary sense is scheduled");
  });

  test("15. a regional receptive target given universal productive demand", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(
          startsWith("SEQ-A1-000110,"),
          ",TARGET_PROFILE_ONLY,",
          ",REQUIRED,",
        );
      },
    });
    reports(issues, "regional receptive target is scheduled with universal productive demand");
  });

  // -------------------------------------------------------- return graph

  test("16. an edge whose target is never introduced", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",SENSE-A1-000015,", ",SENSE-A1-999999,");
      },
    });
    reports(issues, "recycle edge references a target that is never introduced");
  });

  test("17. an edge naming the wrong introduction story", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",A1-M01-I05-S1,", ",A1-M01-I05-S3,");
      },
    });
    reports(issues, "names an introduction story that is not where its target is introduced");
  });

  test("18. a return that lands before the story it returns from", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",A1-M01-I05-S2,", ",A1-M01-I05-S1,");
      },
    });
    reports(issues, "backward or self-referential");
  });

  test("19. the same destination twice on one route", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(secondEdge, ",A1-M01-I05-S3,", ",A1-M01-I05-S2,");
      },
    });
    reports(issues, "the same story is scheduled twice on one route");
  });

  test("20. a SECOND_RETURN with no FIRST_RETURN", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",FIRST_RETURN,", ",SECOND_RETURN,");
      },
    });
    reports(issues, "SECOND_RETURN exists without FIRST_RETURN");
  });

  test("21. a relation scope that misdescribes the topology it spans", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",SAME_ISLAND,", ",CROSS_MODULE,");
      },
    });
    reports(issues, "relation scope disagrees with the topology it spans");
  });

  test("22. a mastery claim on a scheduling edge", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(firstEdge, ",NONE,", ",MASTERED,");
      },
    });
    reports(issues, "claims mastery");
  });

  test("23. a return that changes the mode policy of its target", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(
          firstEdge,
          ",CONTEXTUAL_OR_FUNCTION_BOUND,",
          ",FUNCTION_OR_TASK_BOUND,",
        );
      },
    });
    reports(issues, "changes the productive expectation of its target");
  });

  // ----------------------------------------------------- schema and counts

  test("24. a critical count no longer matches the release", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.dropLine(isLexemeRegistry);
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_COUNT_MISMATCH"), formatAll(issues));
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_COUNT_MISMATCH" &&
          value.expected === 599 &&
          value.actual === 598,
      ),
      "the lexeme count discrepancy must be reported with both numbers",
    );
  });

  test("25. the published audit contradicts the data", () => {
    const issues = importMutated({
      [AUDIT]: (editor) => {
        editor.replaceInLine(startsWith("H-007,"), ",32,32,", ",31,32,");
      },
    });
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_COUNT_MISMATCH" && value.recordId === "H-007",
      ),
      formatAll(issues),
    );
    reports(issues, "contradicts the published audit control H-007");
  });

  test("26. an unknown column is treated as a schema change", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.editHeader((header) =>
          header.replace("allocation_id,", "allocation_id,surprise_column,"),
        );
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_SCHEMA_MISMATCH"), formatAll(issues));
    assert.ok(
      issues.some((value) => value.field === "surprise_column"),
      "the unaccounted-for column must be named",
    );
  });

  test("27. a required column removed from the published header", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.editHeader((header) => header.replace(",story_id,", ",renamed_story_id,"));
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_SCHEMA_MISMATCH"), formatAll(issues));
    reports(issues, "absent from the published header");
  });

  test("28. a curriculum version that contradicts the published filename", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.replaceInLine(isLexemeRegistry, ",1.37,", ",1.36,");
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_RELEASE_MISMATCH"), formatAll(issues));
  });

  test("29. a retired v1.44 record type in the architecture ledger", () => {
    const issues = importMutated({
      [ARCHITECTURE]: (editor) => {
        editor.replaceInLine(firstIsland, "ISLAND,", "MODULE,");
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_IMPORT_INVALID"), formatAll(issues));
    reports(issues, "published vocabulary is ISLAND");
  });

  // ------------------------------------------------------------- contract

  test("the strict entrypoint throws CurriculumImportError", () => {
    withMutatedSources(
      {
        [NORMALIZATION]: (editor) => {
          editor.dropLine(isLexemeRegistry);
        },
      },
      (sourceDir) => {
        assert.throws(
          () => importCurriculumOrThrow({ sourceDir }),
          (error: unknown) => {
            assert.ok(error instanceof CurriculumImportError);
            assert.ok(error.issues.length > 0);
            assert.match(error.message, /IMPORT FAIL/);
            return true;
          },
        );
      },
    );
  });

  test("a corrupted release yields no partial data to publish", () => {
    withMutatedSources(
      {
        [ALLOCATION]: (editor) => {
          editor.replaceInLine(firstAllocation, ",A1-M01-I05-S1,", ",A1-M09-I09-S9,");
        },
      },
      (sourceDir) => {
        const result = importCurriculum({ sourceDir });
        assert.equal(result.status, "IMPORT_FAIL");
        // A failed import exposes no `data`: there is nothing to write out.
        assert.ok(!("data" in result));
        assert.equal(result.release?.validationResult.status, "FAIL");
      },
    );
  });

  test("the canonical sources still import cleanly after the corruption suite", () => {
    const result = importCurriculum();
    assert.equal(result.status, "IMPORT_OK");
  });
});

function formatAll(issues: readonly Parameters<typeof formatIssue>[0][]): string {
  return issues.slice(0, 8).map(formatIssue).join("\n");
}
