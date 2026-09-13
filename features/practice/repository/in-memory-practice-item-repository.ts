import { practiceItemKey, type PracticeItem } from "../domain/item.ts";
import { practiceTargetKey, type PracticeTarget, type PracticeTargetKey } from "../domain/target.ts";
import type { PracticeItemRepository } from "./practice-item-repository.ts";

/** Pure in-memory `PracticeItemRepository` — tests, and browsers without usable storage. */
export class InMemoryPracticeItemRepository implements PracticeItemRepository {
  // A Map keeps insertion order, which is the saved order `list` promises.
  private readonly items = new Map<PracticeTargetKey, PracticeItem>();

  async list(): Promise<readonly PracticeItem[]> {
    return [...this.items.values()];
  }

  async save(item: PracticeItem): Promise<PracticeItem> {
    const key = practiceItemKey(item);
    const existing = this.items.get(key);
    if (existing !== undefined) return existing;
    this.items.set(key, item);
    return item;
  }

  async remove(target: PracticeTarget): Promise<void> {
    this.items.delete(practiceTargetKey(target));
  }

  async has(target: PracticeTarget): Promise<boolean> {
    return this.items.has(practiceTargetKey(target));
  }
}
