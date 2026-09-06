/**
 * The middle representation of the pipeline: reading a raw CSV row into
 * validated values.
 *
 * Every accessor either returns a value that satisfies its declared contract or
 * records a `CurriculumIssue` carrying file, row, line, record id and field.
 * Nothing here repairs data: no trimming of ids, no empty-to-default coercion,
 * no dropping of a row that fails a check. A failed read yields a placeholder
 * so that the rest of the row can still be inspected in the same pass, and the
 * recorded issue makes the import fail.
 */

import {
  asId,
  matchesIdPattern,
  type CurriculumIdKind,
} from "../domain/ids.ts";
import { issue, type CurriculumIssue } from "../domain/errors.ts";
import type { CsvRecord } from "./csv.ts";

export class RowReader {
  private readonly file: string;
  private readonly record: CsvRecord;
  private readonly issues: CurriculumIssue[];
  private recordId: string | undefined;

  constructor(file: string, record: CsvRecord, issues: CurriculumIssue[]) {
    this.file = file;
    this.record = record;
    this.issues = issues;
  }

  /** Label subsequent issues from this row with its published id. */
  identify(recordId: string): void {
    this.recordId = recordId;
  }

  get row(): number {
    return this.record.row;
  }

  private fail(field: string, reason: string, code: Parameters<typeof issue>[0]): void {
    this.issues.push(
      issue(code, reason, {
        sourceFile: this.file,
        row: this.record.row,
        line: this.record.line,
        recordId: this.recordId,
        field,
      }),
    );
  }

  /** Exact published value, empty string included. */
  raw(field: string): string {
    return this.record.values[field] ?? "";
  }

  /** A field that must carry a value. */
  required(field: string): string {
    const value = this.raw(field);
    if (value === "") {
      this.fail(field, "required field is empty", "CURRICULUM_IMPORT_INVALID");
    }
    return value;
  }

  /** A field whose emptiness is meaningful; empty becomes an explicit null. */
  optional(field: string): string | null {
    const value = this.raw(field);
    return value === "" ? null : value;
  }

  /** A required field constrained to a published vocabulary. */
  enum<T extends string>(field: string, allowed: readonly T[]): T {
    const value = this.required(field);
    if (value !== "" && !allowed.includes(value as T)) {
      this.fail(
        field,
        `unknown value ${JSON.stringify(value)}; published vocabulary is ${allowed.join(" | ")}`,
        "CURRICULUM_IMPORT_INVALID",
      );
    }
    return value as T;
  }

  /** A required non-negative integer. */
  integer(field: string): number {
    const value = this.required(field);
    if (value === "") return Number.NaN;
    if (!/^\d+$/.test(value)) {
      this.fail(
        field,
        `expected a non-negative integer, found ${JSON.stringify(value)}`,
        "CURRICULUM_IMPORT_INVALID",
      );
      return Number.NaN;
    }
    return Number.parseInt(value, 10);
  }

  /** A required YES/NO flag as published. */
  yesNo(field: string): boolean {
    const value = this.enum(field, ["YES", "NO"] as const);
    return value === "YES";
  }

  /**
   * A required published id, checked against the pattern its own sources
   * demonstrate. The value is never normalised.
   */
  id<K extends CurriculumIdKind>(kind: K, field: string): ReturnType<typeof asId<K>> {
    const value = this.required(field);
    if (value !== "" && !matchesIdPattern(kind, value)) {
      this.fail(
        field,
        `id ${JSON.stringify(value)} does not match the published ${kind} pattern`,
        "CURRICULUM_ID_PATTERN_INVALID",
      );
    }
    return asId(kind, value);
  }

  /** An optional published id: empty stays null, present must match. */
  optionalId<K extends CurriculumIdKind>(
    kind: K,
    field: string,
  ): ReturnType<typeof asId<K>> | null {
    const value = this.raw(field);
    if (value === "") return null;
    if (!matchesIdPattern(kind, value)) {
      this.fail(
        field,
        `id ${JSON.stringify(value)} does not match the published ${kind} pattern`,
        "CURRICULUM_ID_PATTERN_INVALID",
      );
    }
    return asId(kind, value);
  }
}
