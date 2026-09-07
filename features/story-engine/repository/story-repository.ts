/**
 * Story Engine repository contract.
 *
 * The domain composes against this interface, never against a concrete
 * adapter — `../../../features/story-engine/index.ts` exports it alongside
 * `InMemoryStoryRepository` (a pure in-memory adapter for tests and early
 * development). `features/persistence`'s `PostgresStoryRepository` (phase 5)
 * implements the same interface; contract tests run unchanged against both.
 *
 * Every method is `async`/returns a `Promise`, even
 * `InMemoryStoryRepository`'s trivial in-process implementation — a real
 * persistence adapter cannot answer synchronously, and a caller written
 * against a sync contract could not be swapped onto a real database without
 * changing every call site. Committing to `Promise` here in phase 3 (rather
 * than "fixing it later" in phase 5) is what makes the swap in
 * `docs/persistence.md` possible with zero change to this interface itself.
 *
 * There is no `updateVersion`/`updateOccurrence` method anywhere here: a
 * published `StoryVersion`'s content never changes in place. New text is
 * always a new version, saved with `saveNewVersion`. `markPublished` only
 * ever flips `status`/`publishedAt` on a version that already exists.
 */

import type {
  OccurrenceAnnotationRevision,
  Story,
  StoryOccurrence,
  StorySentence,
  StoryTargetBinding,
  StoryVersion,
  TextAnchor,
} from "../domain/model.ts";
import type { StoryId, StoryOccurrenceId, StoryVersionId } from "../domain/ids.ts";

export type NewVersionInput = {
  readonly version: StoryVersion;
  readonly sentences: readonly StorySentence[];
  readonly anchors: readonly TextAnchor[];
  readonly occurrences: readonly StoryOccurrence[];
  readonly targetBindings: readonly StoryTargetBinding[];
};

export interface StoryRepository {
  getStory(id: StoryId): Promise<Story | null>;
  saveStory(story: Story): Promise<void>;

  getStoryVersion(id: StoryVersionId): Promise<StoryVersion | null>;
  listVersions(storyId: StoryId): Promise<readonly StoryVersion[]>;
  getPublishedVersion(storyId: StoryId): Promise<StoryVersion | null>;

  /** Persists a brand-new version and all of its content in one call. */
  saveNewVersion(input: NewVersionInput): Promise<void>;
  /** Flips an existing version's `status` to `PUBLISHED`. Never alters text. */
  markPublished(version: StoryVersion): Promise<void>;

  listSentences(storyVersionId: StoryVersionId): Promise<readonly StorySentence[]>;
  listAnchors(storyVersionId: StoryVersionId): Promise<readonly TextAnchor[]>;

  getOccurrence(id: StoryOccurrenceId): Promise<StoryOccurrence | null>;
  listOccurrences(storyVersionId: StoryVersionId): Promise<readonly StoryOccurrence[]>;

  listTargetBindings(storyVersionId: StoryVersionId): Promise<readonly StoryTargetBinding[]>;

  appendAnnotationRevision(revision: OccurrenceAnnotationRevision): Promise<void>;
  listAnnotationRevisions(occurrenceId: StoryOccurrenceId): Promise<readonly OccurrenceAnnotationRevision[]>;
}
