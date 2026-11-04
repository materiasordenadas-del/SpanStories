import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { applyPersonalPracticeChanges } from "../engine/personal-practice-merge.ts";
import type { PersonalPracticeItem } from "../domain/personal-item.ts";
import type { PersonalPracticeItemRepository } from "./personal-practice-item-repository.ts";
import { LocalStoragePersonalPracticeItemRepository, parseItem } from "./local-storage-personal-practice-item-repository.ts";
import type { StorageLike } from "./local-storage-practice-item-repository.ts";

const MAX_ITEMS = 500;
const WRITE_DEBOUNCE_MS = 800;

const byId = (a: PersonalPracticeItem, b: PersonalPracticeItem) => a.id.localeCompare(b.id);
const serialize = (items: readonly PersonalPracticeItem[]) => JSON.stringify([...items].sort(byId));

function parseRemoteItems(value: unknown): PersonalPracticeItem[] {
  return Array.isArray(value) ? value.flatMap((entry) => { const item = parseItem(entry); return item === null ? [] : [item]; }) : [];
}

/** Newest `updatedAt` per id wins; an id only one side has is adopted as-is. */
function mergeById(remote: readonly PersonalPracticeItem[], local: readonly PersonalPracticeItem[]): PersonalPracticeItem[] {
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) {
    const existing = merged.get(item.id);
    if (existing === undefined || item.updatedAt > existing.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()];
}

/**
 * Firestore-backed `PersonalPracticeItemRepository` for a signed-in student:
 * Firestore is the source of truth, a `LocalStoragePersonalPracticeItemRepository`
 * underneath is a fast, offline-tolerant read cache.
 *
 * The first `list()`/`replaceAll()` call each session hydrates once: it reads
 * the Firestore doc, adopts any local-only items the cache already had (union
 * by id, most-recently-`updatedAt` wins on a clash) so a student who wrote
 * notes before signing in — or while offline — never loses them, and pushes
 * the merge back to Firestore only if it actually differs from what's there.
 * Writes update the cache immediately, then commit only changed/deleted IDs
 * in a debounced transaction. Remote additions reach subscribers online.
 */
export class FirestorePersonalPracticeItemRepository implements PersonalPracticeItemRepository {
  private readonly cache: LocalStoragePersonalPracticeItemRepository;
  private readonly docRef;
  private hydrated: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingBase: readonly PersonalPracticeItem[] | null = null;
  private writes: Promise<void> = Promise.resolve();
  private remoteItems: readonly PersonalPracticeItem[] = [];
  private readonly db: Firestore;

  constructor(db: Firestore, uid: string, storage: StorageLike, storageKey: string) {
    this.db = db;
    this.cache = new LocalStoragePersonalPracticeItemRepository(storage, storageKey);
    this.docRef = doc(db, "personalPractice", uid);
  }

  private hydrate(): Promise<void> {
    this.hydrated ??= (async () => {
      const [snapshot, local] = await Promise.all([getDoc(this.docRef), this.cache.list()]);
      const remote = snapshot.exists() ? parseRemoteItems(snapshot.data().items) : [];
      this.remoteItems = remote;
      const merged = mergeById(remote, local);
      await this.cache.replaceAll(merged);
      if (serialize(merged) !== serialize(remote)) await this.push(merged, remote);
    })();
    return this.hydrated;
  }

  private async push(items: readonly PersonalPracticeItem[], base: readonly PersonalPracticeItem[]): Promise<void> {
    await runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(this.docRef);
      const merged = applyPersonalPracticeChanges(parseRemoteItems(snapshot.data()?.items), base, items);
      if (merged.length > MAX_ITEMS) throw new Error("El cuaderno admite hasta 500 líneas.");
      transaction.set(this.docRef, { studentId: this.docRef.id, items: merged, updatedAt: serverTimestamp() });
    });
  }

  private schedulePush(items: readonly PersonalPracticeItem[], delay = WRITE_DEBOUNCE_MS): void {
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      const base = this.pendingBase ?? [];
      this.pendingBase = null;
      this.writes = this.writes.catch(() => {}).then(() => this.push(items, base)).catch(async () => {
        // Keep local edits and retry after connectivity returns.
        this.pendingBase = base;
        this.schedulePush(await this.cache.list(), 10000);
      });
    }, delay);
  }

  subscribe(listener: (items: readonly PersonalPracticeItem[]) => void): () => void {
    let active = true;
    let unsubscribe = () => {};
    void this.hydrate().then(() => {
      if (!active) return;
      unsubscribe = onSnapshot(this.docRef, (snapshot) => {
        this.remoteItems = parseRemoteItems(snapshot.data()?.items);
        void this.writes.then(async () => {
          if (!active || this.pendingBase !== null) return;
          await this.cache.replaceAll(this.remoteItems);
          if (active) listener(this.remoteItems);
        }).catch(() => {});
      }, () => {});
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }

  async list(): Promise<readonly PersonalPracticeItem[]> {
    await this.hydrate();
    return this.cache.list();
  }

  async replaceAll(items: readonly PersonalPracticeItem[]): Promise<void> {
    await this.hydrate();
    this.pendingBase ??= await this.cache.list();
    await this.cache.replaceAll(items);
    this.schedulePush(items);
  }
}
