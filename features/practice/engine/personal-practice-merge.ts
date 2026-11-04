import type { PersonalPracticeItem } from "../domain/personal-item.ts";

/** Apply local changes while preserving remote additions and unrelated edits. */
export function applyPersonalPracticeChanges(remote: readonly PersonalPracticeItem[], base: readonly PersonalPracticeItem[], next: readonly PersonalPracticeItem[]): PersonalPracticeItem[] {
  const before = new Map(base.map((item) => [item.id, item]));
  const after = new Map(next.map((item) => [item.id, item]));
  const removed = new Set(base.filter((item) => !after.has(item.id)).map((item) => item.id));
  const changed = new Map(next.filter((item) => JSON.stringify(before.get(item.id)) !== JSON.stringify(item)).map((item) => [item.id, item]));
  const result = remote.filter((item) => !removed.has(item.id)).map((item) => {
    const replacement = changed.get(item.id);
    changed.delete(item.id);
    return replacement ?? item;
  });
  return [...result, ...changed.values()];
}
