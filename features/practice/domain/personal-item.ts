import type { LexemeId, SenseId } from "../../curriculum/index.ts";

/**
 * Vocabulary the learner (or their tutor) typed by hand in their notes —
 * never seen in a Story, so it carries no StoryOccurrence/anchor at all.
 *
 * `PersonalPracticeItem != PracticeItem`: a PracticeItem's identity is its
 * PracticeTarget, always reachable from published content; a
 * PersonalPracticeItem's identity is its own `id` (one per line of notes),
 * because the text itself may never resolve to anything published.
 * `surface != identity` here too: editing a line's text keeps the same `id`
 * (see `withUpdatedSurface`).
 *
 * Resolution against the Lexical Engine is opportunistic and read-only — it
 * only records what a published Sense/Lexeme the surface *might* mean, and
 * never mints one. Ambiguous or unresolved items stay practicable, they only
 * lose the extras (translation, part of speech) resolution would add.
 *
 * `scope` records which notebook a line was written in — a Story's own
 * in-reader notebook (`"01/02"`) or the student's own list (`null`) — purely
 * to decide what a given notebook *shows* (each Story's notebook starts
 * blank and only lists its own lines). It is never a StoryOccurrence/anchor:
 * the student's full "Palabras y frases para practicar" list in their
 * account always contains every item, from every scope, together.
 */
export type PersonalPracticeItemId = string;
export type PersonalPracticeItemType = "WORD" | "PHRASE";
export type PersonalPracticeAddedBy = "STUDENT" | "TUTOR";
export type PersonalPracticeSource = "STUDENT_NOTE";
export type PersonalPracticeResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED";

export type PersonalPracticeItem = {
  readonly id: PersonalPracticeItemId;
  /** Exactly what the learner typed, trimmed and with internal runs of whitespace collapsed — otherwise unchanged. */
  readonly surface: string;
  /** Lowercased, mark-stripped `surface`, for matching only — never shown. */
  readonly normalizedSurface: string;
  readonly type: PersonalPracticeItemType;
  readonly addedBy: PersonalPracticeAddedBy;
  readonly source: PersonalPracticeSource;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
  readonly resolutionStatus: PersonalPracticeResolutionStatus;
  /** Which notebook this line was written in: a Story key (`"01/02"`) or `null` for the student's own list. */
  readonly scope: string | null;
  /** ISO 8601 instant the line first appeared. */
  readonly createdAt: string;
  /** ISO 8601 instant of the last text or resolution change. */
  readonly updatedAt: string;
};

export function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function normalizeForMatch(text: string): string {
  return text.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

function classify(surface: string): PersonalPracticeItemType {
  return surface.includes(" ") ? "PHRASE" : "WORD";
}

export function createPersonalPracticeItem(input: {
  readonly id: PersonalPracticeItemId;
  readonly surface: string;
  readonly addedBy: PersonalPracticeAddedBy;
  readonly scope: string | null;
  readonly now: Date;
}): PersonalPracticeItem {
  const surface = normalizeSpaces(input.surface);
  const now = input.now.toISOString();
  return {
    id: input.id,
    surface,
    normalizedSurface: normalizeForMatch(surface),
    type: classify(surface),
    addedBy: input.addedBy,
    source: "STUDENT_NOTE",
    lexemeId: null,
    senseId: null,
    resolutionStatus: "UNRESOLVED",
    scope: input.scope,
    createdAt: now,
    updatedAt: now,
  };
}

/** The line's text changed: keep the same `id`, drop any earlier resolution (it described the old text). */
export function withUpdatedSurface(item: PersonalPracticeItem, rawSurface: string, now: Date): PersonalPracticeItem {
  const surface = normalizeSpaces(rawSurface);
  if (surface === item.surface) return item;
  return {
    ...item,
    surface,
    normalizedSurface: normalizeForMatch(surface),
    type: classify(surface),
    lexemeId: null,
    senseId: null,
    resolutionStatus: "UNRESOLVED",
    updatedAt: now.toISOString(),
  };
}

export function withResolution(
  item: PersonalPracticeItem,
  resolution: { readonly status: PersonalPracticeResolutionStatus; readonly lexemeId?: LexemeId | null; readonly senseId?: SenseId | null },
  now: Date,
): PersonalPracticeItem {
  return {
    ...item,
    resolutionStatus: resolution.status,
    lexemeId: resolution.lexemeId ?? null,
    senseId: resolution.senseId ?? null,
    updatedAt: now.toISOString(),
  };
}
