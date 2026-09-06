/**
 * RFC 4180 CSV reader for the published curriculum artefacts.
 *
 * Written rather than added as a dependency: the published files are a single,
 * well-specified dialect (UTF-8 with BOM, comma-delimited, double-quoted, CRLF)
 * and the repository has no CSV dependency to reuse. Parsing them needs ~60
 * lines, so a new package would have been convenience, not necessity.
 *
 * The reader distinguishes the three failure kinds the pipeline must not blur:
 * a *parse* error (the bytes are not the declared dialect), a *schema* error
 * (the columns are not what the importer was written against) and a *domain*
 * error (raised later, by the importer and validators).
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { issue, type CurriculumIssue } from "../domain/errors.ts";

/** One data record with the provenance needed to report on it. */
export type CsvRecord = {
  /** 1-based record number, header excluded. */
  readonly row: number;
  /** 1-based physical line on which the record starts. */
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
};

export type ParsedCsv = {
  readonly file: string;
  readonly header: readonly string[];
  readonly records: readonly CsvRecord[];
  readonly issues: readonly CurriculumIssue[];
  readonly sha256: string;
  readonly byteLength: number;
};

const BOM = "﻿";

type RawRow = { readonly fields: string[]; readonly line: number };

/**
 * Split CSV text into rows of fields.
 *
 * Newlines inside quoted fields are preserved as content and normalised to
 * `\n`, so that a CRLF and an LF checkout of the same artefact yield the same
 * canonical output. Field values are otherwise returned byte-for-byte: no
 * trimming, no case folding, no empty-to-null coercion.
 */
function splitRows(text: string): { rows: RawRow[]; unterminatedQuoteLine: number | null } {
  const rows: RawRow[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowStartLine = 1;
  let sawContent = false;

  const endField = (): void => {
    fields.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push({ fields, line: rowStartLine });
    fields = [];
    sawContent = false;
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!sawContent) {
      rowStartLine = line;
      sawContent = true;
    }
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else if (char === "\r") {
        // Normalise CRLF inside a quoted field to LF.
        if (text[i + 1] === "\n") i += 1;
        field += "\n";
        line += 1;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      line += 1;
      endRow();
    } else if (char === "\n") {
      line += 1;
      endRow();
    } else {
      field += char;
    }
  }

  if (quoted) {
    return { rows, unterminatedQuoteLine: rowStartLine };
  }
  // A trailing newline leaves no pending field; anything else is a final row.
  if (field !== "" || fields.length > 0) endRow();
  return { rows, unterminatedQuoteLine: null };
}

export type ReadCsvOptions = {
  /**
   * Columns the importer relies on. Every one must be present or the file is a
   * schema mismatch. Columns beyond these are reported (never silently
   * ignored) because a new column can signal a schema change upstream.
   */
  readonly requiredColumns: readonly string[];
  /**
   * Columns known to exist but deliberately unused. Listing them keeps
   * "unknown column" meaningful instead of noisy.
   */
  readonly knownUnusedColumns?: readonly string[];
};

/** Read and parse one published artefact, hashing the exact bytes consumed. */
export function readCsvFile(
  path: string,
  file: string,
  options: ReadCsvOptions,
): ParsedCsv {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      file,
      header: [],
      records: [],
      sha256: "",
      byteLength: 0,
      issues: [
        issue(
          "CURRICULUM_SOURCE_MISSING",
          `canonical source could not be read: ${reason}`,
          { sourceFile: file },
        ),
      ],
    };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let text = bytes.toString("utf8");
  if (text.startsWith(BOM)) text = text.slice(BOM.length);

  const issues: CurriculumIssue[] = [];
  const { rows, unterminatedQuoteLine } = splitRows(text);

  if (unterminatedQuoteLine !== null) {
    issues.push(
      issue("CURRICULUM_PARSE_ERROR", "unterminated quoted field", {
        sourceFile: file,
        line: unterminatedQuoteLine,
      }),
    );
    return { file, header: [], records: [], issues, sha256, byteLength: bytes.byteLength };
  }

  const headerRow = rows.shift();
  if (headerRow === undefined) {
    issues.push(
      issue("CURRICULUM_PARSE_ERROR", "file contains no header row", {
        sourceFile: file,
      }),
    );
    return { file, header: [], records: [], issues, sha256, byteLength: bytes.byteLength };
  }

  const header = headerRow.fields;
  const headerSet = new Set(header);

  for (const column of options.requiredColumns) {
    if (!headerSet.has(column)) {
      issues.push(
        issue(
          "CURRICULUM_SCHEMA_MISMATCH",
          "required column is absent from the published header",
          { sourceFile: file, field: column, line: headerRow.line },
        ),
      );
    }
  }

  const accountedFor = new Set([
    ...options.requiredColumns,
    ...(options.knownUnusedColumns ?? []),
  ]);
  for (const column of header) {
    if (!accountedFor.has(column)) {
      issues.push(
        issue(
          "CURRICULUM_SCHEMA_MISMATCH",
          "unknown column: the published schema changed and the importer has not been updated for it",
          { sourceFile: file, field: column, line: headerRow.line },
        ),
      );
    }
  }

  const records: CsvRecord[] = [];
  let row = 0;
  for (const raw of rows) {
    // A row of nothing but empty fields is trailing whitespace, not a record.
    if (raw.fields.every((value) => value === "")) continue;
    row += 1;
    if (raw.fields.length !== header.length) {
      issues.push(
        issue(
          "CURRICULUM_PARSE_ERROR",
          `record has ${raw.fields.length} fields but the header declares ${header.length}`,
          { sourceFile: file, row, line: raw.line },
        ),
      );
      continue;
    }
    const values: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) values[header[i]] = raw.fields[i];
    records.push({ row, line: raw.line, values });
  }

  return { file, header, records, issues, sha256, byteLength: bytes.byteLength };
}
