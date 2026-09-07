/**
 * Story Engine repository contract.
 *
 * The domain composes against this interface, never against a concrete
 * adapter — `../../../features/story-engine/index.ts` exports it alongside
 * `InMemoryStoryRepository` (a pure in-memory adapter for tests and early
 * development). A PostgreSQL adapter (phase 5) implements the same interface;
 * contract tests run unchanged against both.
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
  getStory(id: StoryId): Story | null;
  saveStory(story: Story): void;

  getStoryVersion(id: StoryVersionId): StoryVersion | null;
  listVersions(storyId: StoryId): readonly StoryVersion[];
  getPublishedVersion(storyId: StoryId): StoryVersion | null;

  /** Persists a brand-new version and all of its content in one call. */
  saveNewVersion(input: NewVersionInput): void;
  /** Flips an existing version's `status` to `PUBLISHED`. Never alters text. */
  markPublished(version: StoryVersion): void;

  listSentences(storyVersionId: StoryVersionId): readonly StorySentence[];
  listAnchors(storyVersionId: StoryVersionId): readonly TextAnchor[];

  getOccurrence(id: StoryOccurrenceId): StoryOccurrence | null;
  listOccurrences(storyVersionId: StoryVersionId): readonly StoryOccurrence[];

  listTargetBindings(storyVersionId: StoryVersionId): readonly StoryTargetBinding[];

  appendAnnotationRevision(revision: OccurrenceAnnotationRevision): void;
  listAnnotationRevisions(occurrenceId: StoryOccurrenceId): readonly OccurrenceAnnotationRevision[];
}
