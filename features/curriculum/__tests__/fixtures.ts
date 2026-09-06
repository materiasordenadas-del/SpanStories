/**
 * Test fixtures for deliberate-corruption cases.
 *
 * The canonical artefacts under `content/a1/vocabulary/` are never modified.
 * Every corruption test copies the whole source set into a fresh temporary
 * directory, mutates the copy, imports from there and deletes it afterwards.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CANONICAL_SOURCE_DIR } from "../import/sources.ts";

export { CANONICAL_SOURCE_DIR };

/** Edits applied to one copied source file, as raw text lines. */
export class SourceEditor {
  private lines: string[];
  private readonly eol: string;
  private readonly bom: string;

  constructor(text: string) {
    this.bom = text.startsWith("﻿") ? "﻿" : "";
    const body = text.slice(this.bom.length);
    this.eol = body.includes("\r\n") ? "\r\n" : "\n";
    this.lines = body.split(this.eol);
  }

  private findIndex(match: (line: string) => boolean): number {
    const index = this.lines.findIndex((line, i) => i > 0 && match(line));
    if (index === -1) throw new Error("fixture: no line matched the predicate");
    return index;
  }

  /** Rewrite the header row, for schema-change fixtures. */
  editHeader(transform: (header: string) => string): this {
    this.lines[0] = transform(this.lines[0]);
    return this;
  }

  /** Replace the first occurrence of `from` inside the first matching line. */
  replaceInLine(match: (line: string) => boolean, from: string, to: string): this {
    const index = this.findIndex(match);
    if (!this.lines[index].includes(from)) {
      throw new Error(`fixture: matched line does not contain ${JSON.stringify(from)}`);
    }
    this.lines[index] = this.lines[index].replace(from, to);
    return this;
  }

  /** Remove the first matching data line. */
  dropLine(match: (line: string) => boolean): this {
    this.lines.splice(this.findIndex(match), 1);
    return this;
  }

  /** Append a copy of the first matching line, optionally transformed. */
  appendCopy(
    match: (line: string) => boolean,
    transform: (line: string) => string = (line) => line,
  ): this {
    const index = this.findIndex(match);
    const copy = transform(this.lines[index]);
    // Keep the trailing blank line, if any, at the end.
    const last = this.lines[this.lines.length - 1];
    if (last === "") this.lines.splice(this.lines.length - 1, 0, copy);
    else this.lines.push(copy);
    return this;
  }

  toText(): string {
    return this.bom + this.lines.join(this.eol);
  }
}

export type SourceMutation = (editor: SourceEditor) => void;

/**
 * Copy the canonical sources to a temporary directory, apply mutations and run
 * `run` against the copy. The directory is always removed afterwards.
 */
export function withMutatedSources<T>(
  mutations: Readonly<Record<string, SourceMutation>>,
  run: (sourceDir: string) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), "spanstories-curriculum-"));
  try {
    cpSync(CANONICAL_SOURCE_DIR, dir, { recursive: true });
    for (const [file, mutate] of Object.entries(mutations)) {
      const path = join(dir, file);
      const editor = new SourceEditor(readFileSync(path, "utf8"));
      mutate(editor);
      writeFileSync(path, editor.toText(), "utf8");
    }
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every issue code raised by an import, for order-independent assertions. */
export function codesOf(issues: readonly { readonly code: string }[]): Set<string> {
  return new Set(issues.map((value) => value.code));
}
