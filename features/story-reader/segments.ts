import type { StoryOccurrence, StorySentence, TextAnchor } from "../story-engine/index.ts";
import type { StoryReaderTextSegment } from "./model.ts";

type AnchoredPart = {
  readonly start: number;
  readonly end: number;
  readonly curriculumFocus?: true;
} & (
  | { readonly kind: "LEXICAL"; readonly occurrenceId: string }
  | { readonly kind: "SURFACE"; readonly tokenId: string }
);

export function buildReaderSegments(
  sentence: StorySentence,
  anchors: readonly TextAnchor[],
  occurrences: readonly StoryOccurrence[],
  selectableTokenIds: ReadonlySet<string> = new Set(sentence.tokens.map((token) => token.id)),
  focusSenseIds: ReadonlySet<string> = new Set(),
  focusOccurrenceIds: ReadonlySet<string> = new Set(),
): readonly StoryReaderTextSegment[] {
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor] as const));
  const parts: AnchoredPart[] = [];
  const focusRanges: { readonly start: number; readonly end: number }[] = [];

  for (const occurrence of occurrences) {
    if (!focusOccurrenceIds.has(occurrence.id) || occurrence.sentenceId !== sentence.id) continue;
    for (const part of occurrence.parts) {
      const anchor = anchorById.get(part.anchorId);
      if (anchor !== undefined && anchor.sentenceId === sentence.id) focusRanges.push(anchor);
    }
  }

  for (const occurrence of occurrences) {
    if (occurrence.kind !== "LEXICAL" || occurrence.sentenceId !== sentence.id) continue;
    for (const part of occurrence.parts) {
      const anchor = anchorById.get(part.anchorId);
      if (anchor === undefined || anchor.sentenceId !== sentence.id) continue;
      parts.push({
        kind: "LEXICAL",
        start: anchor.start,
        end: anchor.end,
        occurrenceId: occurrence.id,
        ...((occurrence.senseId !== null && focusSenseIds.has(occurrence.senseId)) || focusOccurrenceIds.has(occurrence.id) ? { curriculumFocus: true as const } : {}),
      });
    }
  }

  for (const token of sentence.tokens) {
    if (!selectableTokenIds.has(token.id)) continue;
    const overlapsLexical = parts.some((part) =>
      part.kind === "LEXICAL" && token.startOffset < part.end && part.start < token.endOffset,
    );
    if (!overlapsLexical) {
      parts.push({
        kind: "SURFACE",
        start: token.startOffset,
        end: token.endOffset,
        tokenId: token.id,
        ...(focusRanges.some((range) => token.startOffset < range.end && range.start < token.endOffset) ? { curriculumFocus: true as const } : {}),
      });
    }
  }

  parts.sort((a, b) => a.start - b.start || a.end - b.end);
  const codePoints = [...sentence.text];
  const segments: StoryReaderTextSegment[] = [];
  let cursor = 0;

  for (const part of parts) {
    if (part.start < cursor) {
      throw new Error(`STORY_READER_OVERLAPPING_LEXICAL_PARTS: ${sentence.id}`);
    }
    if (part.start > cursor) {
      segments.push({ kind: "TEXT", text: codePoints.slice(cursor, part.start).join("") });
    }
    const text = codePoints.slice(part.start, part.end).join("");
    segments.push(part.kind === "LEXICAL"
      ? { kind: "LEXICAL", text, occurrenceId: part.occurrenceId, ...(part.curriculumFocus === true ? { curriculumFocus: true as const } : {}) }
      : { kind: "SURFACE", text, tokenId: part.tokenId, ...(part.curriculumFocus === true ? { curriculumFocus: true as const } : {}) });
    cursor = part.end;
  }

  if (cursor < codePoints.length) {
    segments.push({ kind: "TEXT", text: codePoints.slice(cursor).join("") });
  }
  return segments.length === 0 ? [{ kind: "TEXT", text: sentence.text }] : segments;
}
