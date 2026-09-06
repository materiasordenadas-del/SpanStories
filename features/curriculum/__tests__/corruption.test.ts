/**
 * Deliberate corruption: every case must produce IMPORT FAIL.
 *
 * All mutations are applied to throwaway copies of the artefacts. The files
 * under `content/a1/vocabulary/` are read-only for this suite.
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
const ALLOCATION = "spanishstories_a1_ws_sequencing_allocation_v1.44.csv";
const RECYCLING = "spanishstories_a1_ws_recycling_edges_v1.44.csv";

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

const isLexemeRegistry = (line: string): boolean => line.includes(",LEXEME_REGISTRY,");
const isFormRegistry = (line: string): boolean => line.includes(",LEXEME_FORM_REGISTRY,");
const isSenseRegistry = (line: string): boolean => line.includes(",SENSE_REGISTRY,");

describe("deliberate corruption / import must fail", () => {
  test("A. duplicate published id", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.appendCopy(isLexemeRegistry);
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_DUPLICATE_ID"), formatAll(issues));
  });

  test("B. reference to an id that does not exist", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(
          (line) => line.startsWith("REC-A1-000001,"),
          "A1-M01-I01-S3",
          "A1-M09-I09-S9",
        );
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_REFERENCE_NOT_FOUND"), formatAll(issues));
    assert.ok(
      issues.some((value) => value.referencedId === "A1-M09-I09-S9"),
      "the unresolved id must be reported",
    );
  });

  test("C. orphan Sense", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.replaceInLine(isSenseRegistry, "LEX-A1-000001", "LEX-A1-999999");
      },
    });
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_REFERENCE_NOT_FOUND" &&
          value.reason.includes("Sense has no valid Lexeme"),
      ),
      formatAll(issues),
    );
  });

  test("D. orphan LexemeForm", () => {
    const issues = importMutated({
      [NORMALIZATION]: (editor) => {
        editor.replaceInLine(isFormRegistry, "LEX-A1-000001", "LEX-A1-999999");
      },
    });
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_REFERENCE_NOT_FOUND" &&
          value.reason.includes("LexemeForm has no valid Lexeme"),
      ),
      formatAll(issues),
    );
  });

  test("E. first introduction points at a story that does not exist", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.replaceInLine(
          (line) => line.startsWith("SEQ-A1-000001,"),
          "A1-M01-I01-S2",
          "A1-M09-I09-S9",
        );
      },
    });
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_REFERENCE_NOT_FOUND" &&
          value.reason.includes("StoryBlueprint that does not exist"),
      ),
      formatAll(issues),
    );
  });

  test("F. A2 boundary sense scheduled as an A1 target", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        // SENSE-A1-000075 is one of the six published A2 boundary senses.
        editor.replaceInLine(
          (line) => line.startsWith("SEQ-A1-000001,"),
          "SENSE-A1-000015",
          "SENSE-A1-000075",
        );
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_TARGET_INVALID"), formatAll(issues));
    assert.ok(
      issues.some((value) => value.reason.includes("A2 boundary sense is scheduled")),
      formatAll(issues),
    );
  });

  test("G. a target with two first introductions", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.appendCopy(
          (line) => line.startsWith("SEQ-A1-000001,"),
          (line) => line.replace("SEQ-A1-000001,", "SEQ-A1-900001,"),
        );
      },
    });
    assert.ok(
      issues.some(
        (value) =>
          value.code === "CURRICULUM_SEQUENCE_INVALID" &&
          value.reason.includes("more than one first introduction"),
      ),
      formatAll(issues),
    );
  });

  test("H. a critical count no longer matches the release", () => {
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

  test("I. an unknown column is treated as a schema change", () => {
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

  test("K. a required column removed from the published header", () => {
    const issues = importMutated({
      [ALLOCATION]: (editor) => {
        editor.editHeader((header) =>
          header.replace("first_introduction_story,", "renamed_intro_story,"),
        );
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_SCHEMA_MISMATCH"), formatAll(issues));
    assert.ok(
      issues.some(
        (value) =>
          value.field === "first_introduction_story" &&
          value.reason.includes("absent from the published header"),
      ),
      formatAll(issues),
    );
  });

  test("L. a curriculum version that contradicts the published filename", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(
          (line) => line.startsWith("REC-A1-000001,"),
          ",NONE,1.44,",
          ",NONE,1.43,",
        );
      },
    });
    assert.ok(codesOf(issues).has("CURRICULUM_RELEASE_MISMATCH"), formatAll(issues));
  });

  test("J. a mastery claim on a scheduling edge", () => {
    const issues = importMutated({
      [RECYCLING]: (editor) => {
        editor.replaceInLine(
          (line) => line.startsWith("REC-A1-000001,"),
          ",NONE,1.44,",
          ",MASTERED,1.44,",
        );
      },
    });
    assert.ok(
      issues.some((value) => value.reason.includes("claims mastery")),
      formatAll(issues),
    );
  });

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

  test("the canonical sources still import cleanly after the corruption suite", () => {
    const result = importCurriculum();
    assert.equal(result.status, "IMPORT_OK");
  });
});

function formatAll(issues: readonly Parameters<typeof formatIssue>[0][]): string {
  return issues.slice(0, 8).map(formatIssue).join("\n");
}
