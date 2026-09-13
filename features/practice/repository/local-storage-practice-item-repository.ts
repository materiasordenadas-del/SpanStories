// Imported from the ids module, not the curriculum index: the index also exports the Node-only importer,
// and this adapter runs in the browser.
import { asId as asCurriculumId, matchesIdPattern } from "../../curriculum/domain/ids.ts";
import { asId as asStoryId } from "../../story-engine/index.ts";
import { practiceItemKey, type PracticeItem, type PracticeItemOrigin } from "../domain/item.ts";
import { practiceTargetKey, type PracticeTarget } from "../domain/target.ts";
import type { PracticeItemRepository } from "./practice-item-repository.ts";

/**
 * A `localStorage`-backed `PracticeItemRepository`.
 *
 * It owns its key (`spanstories.practice:v1`) and never reads or writes the
 * reading memory. Like the learner event adapter it depends on `StorageLike`,
 * not on `window`: the caller passes `window.localStorage` or a fake.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PRACTICE_STORAGE_KEY = "spanstories.practice:v1";

type StoredPractice = {
  readonly schemaVersion: 1;
  readonly items: readonly PracticeItem[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function parseTarget(value: unknown): PracticeTarget | null {
  if (!isRecord(value)) return null;
  const { type, lexemeId, senseId } = value;
  if (typeof lexemeId !== "string" || !matchesIdPattern("LexemeId", lexemeId)) return null;
  if (type === "LEXEME") return { type, lexemeId: asCurriculumId("LexemeId", lexemeId) };
  if (type === "SENSE" && typeof senseId === "string" && matchesIdPattern("SenseId", senseId)) {
    return { type, senseId: asCurriculumId("SenseId", senseId), lexemeId: asCurriculumId("LexemeId", lexemeId) };
  }
  return null;
}

function parseOrigin(value: unknown): PracticeItemOrigin | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.storyVersionId !== "string" || typeof value.occurrenceId !== "string") return undefined;
  return { storyVersionId: asStoryId("StoryVersionId", value.storyVersionId), occurrenceId: asStoryId("StoryOccurrenceId", value.occurrenceId) };
}

// localStorage is editable by anyone: only known shapes with published id patterns are accepted.
function parseItem(value: unknown): PracticeItem | null {
  if (!isRecord(value) || typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
  const target = parseTarget(value.target);
  const savedFrom = parseOrigin(value.savedFrom);
  return target === null || savedFrom === undefined ? null : { target, savedAt: value.savedAt, savedFrom };
}

export class LocalStoragePracticeItemRepository implements PracticeItemRepository {
  private readonly storage: StorageLike;
  private readonly key: string;

  constructor(storage: StorageLike, key: string = PRACTICE_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  private read(): PracticeItem[] {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return [];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!isRecord(data) || data.schemaVersion !== 1 || !Array.isArray(data.items)) return [];
    const seen = new Set<string>();
    return data.items.flatMap((value: unknown) => {
      const item = parseItem(value);
      if (item === null || seen.has(practiceItemKey(item))) return [];
      seen.add(practiceItemKey(item));
      return [item];
    });
  }

  private write(items: readonly PracticeItem[]): void {
    const stored: StoredPractice = { schemaVersion: 1, items };
    this.storage.setItem(this.key, JSON.stringify(stored));
  }

  async list(): Promise<readonly PracticeItem[]> {
    return this.read();
  }

  async save(item: PracticeItem): Promise<PracticeItem> {
    const items = this.read();
    const key = practiceItemKey(item);
    const existing = items.find((candidate) => practiceItemKey(candidate) === key);
    if (existing !== undefined) return existing;
    this.write([...items, item]);
    return item;
  }

  async remove(target: PracticeTarget): Promise<void> {
    const items = this.read();
    const key = practiceTargetKey(target);
    const remaining = items.filter((item) => practiceItemKey(item) !== key);
    if (remaining.length !== items.length) this.write(remaining);
  }

  async has(target: PracticeTarget): Promise<boolean> {
    const key = practiceTargetKey(target);
    return this.read().some((item) => practiceItemKey(item) === key);
  }
}
