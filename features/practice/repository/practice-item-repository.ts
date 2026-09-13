import type { PracticeItem } from "../domain/item.ts";
import type { PracticeTarget } from "../domain/target.ts";

/**
 * Saved words of one learner.
 *
 * Identity is the PracticeTarget: `save` is idempotent per target, so saving
 * the same Sense or Lexeme twice keeps the first item. Every method returns a
 * `Promise` for the same reason the learner event repository does — a server
 * adapter cannot answer synchronously.
 */
export interface PracticeItemRepository {
  /** Items in the order they were first saved. */
  list(): Promise<readonly PracticeItem[]>;
  /** Stores the item unless its target is already saved; resolves to the stored item. */
  save(item: PracticeItem): Promise<PracticeItem>;
  remove(target: PracticeTarget): Promise<void>;
  has(target: PracticeTarget): Promise<boolean>;
}
