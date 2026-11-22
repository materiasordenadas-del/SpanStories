import { PERSONAL_PRACTICE_STORAGE_KEY } from "./local-storage-personal-practice-item-repository.ts";

/** The old anonymous notes stay anonymous; account namespaces never inherit them. */
export function personalPracticeStorageKey(owner: string): string {
  if (!owner) throw new Error("Missing learner identity");
  return owner === "guest" ? PERSONAL_PRACTICE_STORAGE_KEY : `${PERSONAL_PRACTICE_STORAGE_KEY}:${encodeURIComponent(owner)}`;
}
