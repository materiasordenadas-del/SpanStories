import type { PersonalPracticeItem } from "../domain/personal-item.ts";
import type { PersonalPracticeItemRepository } from "./personal-practice-item-repository.ts";

/** Pure in-memory `PersonalPracticeItemRepository` — tests, and browsers without usable storage. */
export class InMemoryPersonalPracticeItemRepository implements PersonalPracticeItemRepository {
  private items: readonly PersonalPracticeItem[] = [];

  async list(): Promise<readonly PersonalPracticeItem[]> {
    return this.items;
  }

  async replaceAll(items: readonly PersonalPracticeItem[]): Promise<void> {
    this.items = items;
  }
}
