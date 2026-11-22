import type { PersonalPracticeItem } from "../domain/personal-item.ts";

/**
 * Personal practice items of one learner, in line order.
 *
 * Unlike `PracticeItemRepository` (target-keyed, save-is-idempotent), the
 * caller already knows the full, correctly-ordered collection after each
 * edit (`syncPersonalPracticeNotes` computes it) — so the repository only
 * needs to persist that collection atomically, not diff it itself.
 */
export interface PersonalPracticeItemRepository {
  list(): Promise<readonly PersonalPracticeItem[]>;
  replaceAll(items: readonly PersonalPracticeItem[]): Promise<void>;
}
