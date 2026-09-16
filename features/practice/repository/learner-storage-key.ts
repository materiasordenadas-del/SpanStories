import { PRACTICE_STORAGE_KEY } from "./local-storage-practice-item-repository.ts";

/** The old anonymous vocabulary stays anonymous; account namespaces never inherit it. */
export function learnerPracticeStorageKey(owner: string): string {
  if (!owner) throw new Error("Missing learner identity");
  return owner === "guest" ? PRACTICE_STORAGE_KEY : `${PRACTICE_STORAGE_KEY}:${encodeURIComponent(owner)}`;
}
