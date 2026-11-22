import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { practiceItemKey, type PracticeItem } from "../domain/item.ts";
import type { PracticeTarget } from "../domain/target.ts";
import type { PracticeItemRepository } from "./practice-item-repository.ts";
import { LocalStoragePracticeItemRepository, parseItem } from "./local-storage-practice-item-repository.ts";
import type { StorageLike } from "./local-storage-practice-item-repository.ts";

const MAX_ITEMS = 3000;
const WRITE_DEBOUNCE_MS = 800;

const byKey = (a: PracticeItem, b: PracticeItem) => practiceItemKey(a).localeCompare(practiceItemKey(b));
const serialize = (items: readonly PracticeItem[]) => JSON.stringify([...items].sort(byKey));

function parseRemoteItems(value: unknown): PracticeItem[] {
  return Array.isArray(value) ? value.flatMap((entry) => { const item = parseItem(entry); return item === null ? [] : [item]; }) : [];
}

/** A target present on both sides keeps whichever copy was saved first — `save()`'s own idempotence, applied across devices. */
function mergeByTarget(remote: readonly PracticeItem[], local: readonly PracticeItem[]): PracticeItem[] {
  const merged = new Map(remote.map((item) => [practiceItemKey(item), item]));
  for (const item of local) {
    const key = practiceItemKey(item);
    const existing = merged.get(key);
    if (existing === undefined || item.savedAt < existing.savedAt) merged.set(key, item);
  }
  return [...merged.values()];
}

/**
 * Firestore-backed `PracticeItemRepository` for a signed-in student, mirroring
 * `FirestorePersonalPracticeItemRepository`'s shape: Firestore is the source
 * of truth, a `LocalStoragePracticeItemRepository` underneath is the read
 * cache, hydration merges local-only saves into the account once per session,
 * and every mutation pushes the whole current list (debounced) rather than a
 * partial update — `PracticeTargetKey` isn't a safe Firestore field-path
 * segment to `updateDoc` into.
 */
export class FirestorePracticeItemRepository implements PracticeItemRepository {
  private readonly cache: LocalStoragePracticeItemRepository;
  private readonly docRef;
  private hydrated: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(db: Firestore, uid: string, storage: StorageLike, storageKey: string) {
    this.cache = new LocalStoragePracticeItemRepository(storage, storageKey);
    this.docRef = doc(db, "practiceItems", uid);
  }

  private hydrate(): Promise<void> {
    this.hydrated ??= (async () => {
      const [snapshot, local] = await Promise.all([getDoc(this.docRef), this.cache.list()]);
      const remote = snapshot.exists() ? parseRemoteItems(snapshot.data().items) : [];
      const merged = mergeByTarget(remote, local);
      for (const item of merged) await this.cache.save(item);
      if (serialize(merged) !== serialize(remote)) await this.push(merged);
    })();
    return this.hydrated;
  }

  private async push(items: readonly PracticeItem[]): Promise<void> {
    await setDoc(this.docRef, { studentId: this.docRef.id, items: items.slice(0, MAX_ITEMS), updatedAt: serverTimestamp() });
  }

  private schedulePush(): void {
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      void this.cache.list().then((items) => this.push(items)).catch(() => {});
    }, WRITE_DEBOUNCE_MS);
  }

  async list(): Promise<readonly PracticeItem[]> {
    await this.hydrate();
    return this.cache.list();
  }

  async save(item: PracticeItem): Promise<PracticeItem> {
    await this.hydrate();
    const stored = await this.cache.save(item);
    this.schedulePush();
    return stored;
  }

  async remove(target: PracticeTarget): Promise<void> {
    await this.hydrate();
    await this.cache.remove(target);
    this.schedulePush();
  }

  async has(target: PracticeTarget): Promise<boolean> {
    await this.hydrate();
    return this.cache.has(target);
  }
}
