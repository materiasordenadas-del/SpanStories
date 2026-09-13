import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import {
  asId,
  type ConstructionOccurrence,
  type LexicalOccurrence,
  type SenseResolutionStatus,
  type SurfaceToken,
} from "../../story-engine/index.ts";
import type { PracticeItemOrigin } from "../domain/item.ts";
import type { PracticeOccurrence } from "../domain/occurrence.ts";
import { practiceTargetOf } from "../domain/target.ts";
import type { StorageLike } from "../repository/local-storage-practice-item-repository.ts";

export const STORY_VERSION_ID = asId("StoryVersionId", "storyver-practice-test");
const SENTENCE_ID = asId("SentenceId", "sent-practice-test-1");
export const SAVED_AT = new Date("2026-09-13T10:00:00.000Z");

export function lexicalOccurrence(input: {
  readonly id: string;
  readonly surface: string;
  readonly lexemeId: string;
  readonly senseId: string | null;
  readonly status: SenseResolutionStatus;
}): LexicalOccurrence {
  return {
    kind: "LEXICAL",
    id: asId("StoryOccurrenceId", input.id),
    storyVersionId: STORY_VERSION_ID,
    sentenceId: SENTENCE_ID,
    surface: input.surface,
    parts: [],
    lexemeId: input.lexemeId as LexemeId,
    senseId: input.senseId as SenseId | null,
    lexemeFormId: null,
    senseResolutionStatus: input.status,
  };
}

export function constructionOccurrence(id: string, surface: string): ConstructionOccurrence {
  return {
    kind: "CONSTRUCTION",
    id: asId("StoryOccurrenceId", id),
    storyVersionId: STORY_VERSION_ID,
    sentenceId: SENTENCE_ID,
    surface,
    parts: [],
    constructionId: "GREETING_FORMULA",
  };
}

export function surfaceToken(id: string, surface: string): SurfaceToken {
  return { id: asId("SurfaceTokenId", id), sentenceId: SENTENCE_ID, surface, startOffset: 0, endOffset: [...surface].length, order: 1 };
}

export function originOf(occurrence: LexicalOccurrence): PracticeItemOrigin {
  return { storyVersionId: occurrence.storyVersionId, occurrenceId: occurrence.id };
}

/** Reader content for an occurrence; only the fields a test passes are present. */
export function practiceOccurrence(
  occurrence: LexicalOccurrence,
  content: Pick<PracticeOccurrence, "lemma"> & Partial<Pick<PracticeOccurrence, "translation" | "partOfSpeechLabel" | "cefrLevel" | "image">>,
): PracticeOccurrence {
  const target = practiceTargetOf(occurrence);
  if (target === null) throw new Error(`fixture ${occurrence.id} has no practice target`);
  return {
    target,
    storyVersionId: occurrence.storyVersionId,
    occurrenceId: occurrence.id,
    ...content,
    context: {
      text: `${occurrence.surface} (${occurrence.id}).`,
      parts: [{ text: occurrence.surface, highlighted: true }, { text: ` (${occurrence.id}).`, highlighted: false }],
    },
  };
}

/** A minimal in-memory stand-in for the Web Storage API, for Node tests. */
export class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  keys(): readonly string[] {
    return [...this.map.keys()];
  }
}
