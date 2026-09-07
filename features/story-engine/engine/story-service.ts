/**
 * Pure construction services for Story Engine domain objects.
 *
 * Everything here validates structural invariants immediately and throws
 * `StoryEngineError` on the first corrupt input, rather than returning a
 * partially-valid object for a caller to forget to check. Cross-referential
 * integrity against the curriculum/lexical registries (does this Lexeme
 * exist? does this Sense belong to it?) is a *different* concern, handled by
 * `../validation/publication-validator.ts` — a function here can validate an
 * occurrence's internal shape without ever loading a registry.
 */

import {
  storyEngineIssue,
  StoryEngineError,
  type StoryEngineIssue,
} from "../domain/errors.ts";
import {
  boundsOverlap,
  resolveAnchorText,
  validateAnchorBounds,
  type AnchorBounds,
} from "../domain/anchors.ts";
import {
  CONSTRUCTION_PART_ROLES,
  LEXICAL_PART_ROLES,
  type ConstructionOccurrence,
  type LexicalOccurrence,
  type OccurrencePart,
  type OccurrencePartRole,
  type SenseResolutionStatus,
  type Story,
  type StorySentence,
  type StoryStatus,
  type StoryVersion,
  type TextAnchor,
} from "../domain/model.ts";
import type {
  OccurrencePartId,
  SentenceId,
  StoryId,
  StoryOccurrenceId,
  StoryVersionId,
  TextAnchorId,
} from "../domain/ids.ts";
import type { LexemeFormId, LexemeId, SenseId, StoryBlueprintId } from "../../curriculum/index.ts";
import type { Clock } from "../domain/ports.ts";

function fail(issues: readonly StoryEngineIssue[]): never {
  throw new StoryEngineError(issues);
}

// ------------------------------------------------------------------- Story

export function createStory(
  id: StoryId,
  storyBlueprintId: StoryBlueprintId | null,
  clock: Clock,
): Story {
  return {
    id,
    storyBlueprintId,
    status: "DRAFT",
    createdAt: clock.now().toISOString(),
  };
}

// ------------------------------------------------------------- TextAnchor

export function createTextAnchor(
  id: TextAnchorId,
  storyVersionId: StoryVersionId,
  sentence: StorySentence,
  bounds: AnchorBounds,
): TextAnchor {
  const validation = validateAnchorBounds(sentence.text, bounds);
  if (validation.status === "OUT_OF_BOUNDS") {
    fail([
      storyEngineIssue("ANCHOR_OUT_OF_BOUNDS", `[${bounds.start}, ${bounds.end}) is out of bounds for sentence ${sentence.id}`, {
        recordId: sentence.id,
        expected: `within [0, ${[...sentence.text].length}]`,
        actual: `[${bounds.start}, ${bounds.end})`,
      }),
    ]);
  }
  if (validation.status === "EMPTY_OR_INVERTED") {
    fail([
      storyEngineIssue("ANCHOR_EMPTY_OR_INVERTED", `[${bounds.start}, ${bounds.end}) is empty or inverted`, {
        recordId: sentence.id,
      }),
    ]);
  }
  return { id, storyVersionId, sentenceId: sentence.id, start: bounds.start, end: bounds.end };
}

// -------------------------------------------------------------- StoryVersion

/** `1` for a story's first version; one past the highest existing number otherwise. */
export function nextVersionNumber(previousVersions: readonly StoryVersion[]): number {
  if (previousVersions.length === 0) return 1;
  return Math.max(...previousVersions.map((v) => v.versionNumber)) + 1;
}

/**
 * Assemble a `StoryVersion`, deriving `text` from its ordered sentences.
 *
 * `text` is never independently authored: it is always the join of
 * `sentences` (sorted by `order`) with `"\n"`, so it can never silently
 * diverge from the exact text every `TextAnchor` on this version resolves
 * against.
 */
export function assembleStoryVersion(input: {
  readonly id: StoryVersionId;
  readonly storyId: StoryId;
  readonly versionNumber: number;
  readonly title: string;
  readonly sentences: readonly StorySentence[];
  readonly status: StoryStatus;
  readonly clock: Clock;
  readonly publishedAt?: string | null;
}): StoryVersion {
  const ordered = [...input.sentences].sort((a, b) => a.order - b.order);
  const text = ordered.map((s) => s.text).join("\n");
  return {
    id: input.id,
    storyId: input.storyId,
    versionNumber: input.versionNumber,
    title: input.title,
    text,
    status: input.status,
    createdAt: input.clock.now().toISOString(),
    publishedAt: input.publishedAt ?? null,
  };
}

/**
 * Publish a `DRAFT` version. Never mutates published content: a version
 * that is already `PUBLISHED` cannot be published again through this
 * function, and there is deliberately no "unpublish" or "edit" here — see
 * the repository contract in `../repository/story-repository.ts`.
 */
export function publishStoryVersion(version: StoryVersion, clock: Clock): StoryVersion {
  if (version.status === "PUBLISHED") {
    throw new Error(
      `STORY_VERSION_ALREADY_PUBLISHED: ${version.id} was published at ${version.publishedAt}; publish a new version instead of republishing`,
    );
  }
  return { ...version, status: "PUBLISHED", publishedAt: clock.now().toISOString() };
}

// ----------------------------------------------------------- OccurrencePart

type PartInput = {
  readonly id: OccurrencePartId;
  readonly anchor: TextAnchor;
  readonly role: OccurrencePartRole;
  readonly slotLabel?: string | null;
};

function buildParts(occurrenceId: StoryOccurrenceId, inputs: readonly PartInput[]): OccurrencePart[] {
  if (inputs.length === 0) {
    fail([storyEngineIssue("OCCURRENCE_EMPTY", `occurrence ${occurrenceId} has zero parts`, { recordId: occurrenceId })]);
  }

  const issues: StoryEngineIssue[] = [];
  for (const input of inputs) {
    const isSlot = input.role === "SLOT";
    if (isSlot && (input.slotLabel === undefined || input.slotLabel === null || input.slotLabel.length === 0)) {
      issues.push(storyEngineIssue("SLOT_LABEL_INVALID", `SLOT part ${input.id} carries no slotLabel`, { recordId: input.id }));
    }
    if (!isSlot && input.slotLabel !== undefined && input.slotLabel !== null) {
      issues.push(storyEngineIssue("SLOT_LABEL_INVALID", `non-SLOT part ${input.id} carries a slotLabel`, { recordId: input.id, field: "role", actual: input.role }));
    }
  }

  // Stable surface order, derived from resolved anchor position — never
  // trusted from caller-supplied input, so "order" can never be wrong by
  // construction.
  const ordered = [...inputs].sort((a, b) => a.anchor.start - b.anchor.start);

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      if (boundsOverlap(ordered[i].anchor, ordered[j].anchor)) {
        issues.push(
          storyEngineIssue("PART_OVERLAP", `parts ${ordered[i].id} and ${ordered[j].id} overlap`, {
            recordId: occurrenceId,
            referencedId: ordered[j].id,
          }),
        );
      }
    }
  }

  if (issues.length > 0) fail(issues);

  return ordered.map((input, index) => ({
    id: input.id,
    occurrenceId,
    anchorId: input.anchor.id,
    role: input.role,
    order: index,
    slotLabel: input.role === "SLOT" ? (input.slotLabel as string) : null,
  }));
}

// ---------------------------------------------------------- StoryOccurrence

export function createLexicalOccurrence(input: {
  readonly id: StoryOccurrenceId;
  readonly storyVersionId: StoryVersionId;
  readonly sentenceId: SentenceId;
  readonly surface: string;
  readonly lexemeId: LexemeId;
  readonly senseId: SenseId | null;
  readonly lexemeFormId: LexemeFormId | null;
  readonly senseResolutionStatus: SenseResolutionStatus;
  readonly parts: readonly PartInput[];
}): LexicalOccurrence {
  for (const part of input.parts) {
    if (!(LEXICAL_PART_ROLES as readonly string[]).includes(part.role)) {
      fail([
        storyEngineIssue("PART_ROLE_INVALID_FOR_KIND", `role ${part.role} is not valid on a LEXICAL occurrence`, {
          recordId: part.id,
          field: "role",
          actual: part.role,
        }),
      ]);
    }
  }
  const parts = buildParts(input.id, input.parts);
  if (!parts.some((p) => p.role === "HEAD")) {
    fail([
      storyEngineIssue("OCCURRENCE_MISSING_REQUIRED_ROLE", `LEXICAL occurrence ${input.id} has no HEAD part`, {
        recordId: input.id,
      }),
    ]);
  }
  return {
    kind: "LEXICAL",
    id: input.id,
    storyVersionId: input.storyVersionId,
    sentenceId: input.sentenceId,
    surface: input.surface,
    lexemeId: input.lexemeId,
    senseId: input.senseId,
    lexemeFormId: input.lexemeFormId,
    senseResolutionStatus: input.senseResolutionStatus,
    parts,
  };
}

export function createConstructionOccurrence(input: {
  readonly id: StoryOccurrenceId;
  readonly storyVersionId: StoryVersionId;
  readonly sentenceId: SentenceId;
  readonly surface: string;
  readonly constructionId: string;
  readonly parts: readonly PartInput[];
}): ConstructionOccurrence {
  for (const part of input.parts) {
    if (!(CONSTRUCTION_PART_ROLES as readonly string[]).includes(part.role)) {
      fail([
        storyEngineIssue("PART_ROLE_INVALID_FOR_KIND", `role ${part.role} is not valid on a CONSTRUCTION occurrence`, {
          recordId: part.id,
          field: "role",
          actual: part.role,
        }),
      ]);
    }
  }
  const parts = buildParts(input.id, input.parts);
  if (!parts.some((p) => p.role === "ANCHOR")) {
    fail([
      storyEngineIssue("OCCURRENCE_MISSING_REQUIRED_ROLE", `CONSTRUCTION occurrence ${input.id} has no ANCHOR part`, {
        recordId: input.id,
      }),
    ]);
  }
  return {
    kind: "CONSTRUCTION",
    id: input.id,
    storyVersionId: input.storyVersionId,
    sentenceId: input.sentenceId,
    surface: input.surface,
    constructionId: input.constructionId,
    parts,
  };
}

/** Recover the exact surface text of a part from its resolved anchor and the sentence it belongs to. */
export function resolvePartText(part: OccurrencePart, anchor: TextAnchor, sentence: StorySentence): string {
  if (anchor.id !== part.anchorId) {
    throw new Error(`ANCHOR_MISMATCH: part ${part.id} names anchor ${part.anchorId}, not ${anchor.id}`);
  }
  return resolveAnchorText(sentence.text, anchor);
}
