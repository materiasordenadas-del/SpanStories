import { asId as asCurriculumId, matchesIdPattern as matchesCurriculumIdPattern } from "../../curriculum/domain/ids.ts";
import type { PersonalPracticeItem } from "../domain/personal-item.ts";
import type { PersonalPracticeItemRepository } from "./personal-practice-item-repository.ts";
import type { StorageLike } from "./local-storage-practice-item-repository.ts";

export const PERSONAL_PRACTICE_STORAGE_KEY = "spanstories.personal-practice:v1";

type StoredPersonalPractice = {
  readonly schemaVersion: 1;
  readonly items: readonly PersonalPracticeItem[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const RESOLUTION_STATUSES = new Set(["RESOLVED", "AMBIGUOUS", "UNRESOLVED"]);
const ADDED_BY_VALUES = new Set(["STUDENT", "TUTOR"]);
const ITEM_TYPES = new Set(["WORD", "PHRASE"]);

// Editable by anyone with access to the storage (localStorage) or the document (Firestore):
// both accept only known shapes with published id patterns.
export function parseItem(value: unknown): PersonalPracticeItem | null {
  if (!isRecord(value)) return null;
  const { id, surface, normalizedSurface, type, addedBy, source, lexemeId, senseId, resolutionStatus, scope, createdAt, updatedAt } = value;
  if (typeof id !== "string" || id === "") return null;
  if (typeof surface !== "string" || surface === "") return null;
  if (typeof normalizedSurface !== "string") return null;
  if (typeof type !== "string" || !ITEM_TYPES.has(type)) return null;
  if (typeof addedBy !== "string" || !ADDED_BY_VALUES.has(addedBy)) return null;
  if (source !== "STUDENT_NOTE") return null;
  if (typeof resolutionStatus !== "string" || !RESOLUTION_STATUSES.has(resolutionStatus)) return null;
  if (scope !== null && typeof scope !== "string") return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) return null;
  const resolvedLexemeId = lexemeId === null ? null : typeof lexemeId === "string" && matchesCurriculumIdPattern("LexemeId", lexemeId) ? asCurriculumId("LexemeId", lexemeId) : undefined;
  if (resolvedLexemeId === undefined) return null;
  const resolvedSenseId = senseId === null ? null : typeof senseId === "string" && matchesCurriculumIdPattern("SenseId", senseId) ? asCurriculumId("SenseId", senseId) : undefined;
  if (resolvedSenseId === undefined) return null;
  return {
    id,
    surface,
    normalizedSurface,
    type,
    addedBy,
    source,
    lexemeId: resolvedLexemeId,
    senseId: resolvedSenseId,
    resolutionStatus,
    scope,
    createdAt,
    updatedAt,
  } as PersonalPracticeItem;
}

export class LocalStoragePersonalPracticeItemRepository implements PersonalPracticeItemRepository {
  private readonly storage: StorageLike;
  private readonly key: string;

  constructor(storage: StorageLike, key: string = PERSONAL_PRACTICE_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  async list(): Promise<readonly PersonalPracticeItem[]> {
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
      if (item === null || seen.has(item.id)) return [];
      seen.add(item.id);
      return [item];
    });
  }

  async replaceAll(items: readonly PersonalPracticeItem[]): Promise<void> {
    const stored: StoredPersonalPractice = { schemaVersion: 1, items };
    this.storage.setItem(this.key, JSON.stringify(stored));
  }
}
