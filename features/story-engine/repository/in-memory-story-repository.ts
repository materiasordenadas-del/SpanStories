/**
 * Pure in-memory `StoryRepository` — for tests and early development, not
 * intended as a production persistence layer (phase 5 adds PostgreSQL).
 *
 * Every read returns a fresh shallow copy of its backing array so a caller
 * mutating the returned array can never corrupt this repository's state; the
 * objects themselves are the same frozen-by-convention (`readonly`-typed)
 * values the domain already treats as immutable.
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
import type { NewVersionInput, StoryRepository } from "./story-repository.ts";

export class InMemoryStoryRepository implements StoryRepository {
  private readonly stories = new Map<StoryId, Story>();
  private readonly versions = new Map<StoryVersionId, StoryVersion>();
  private readonly versionsByStory = new Map<StoryId, StoryVersionId[]>();
  private readonly sentencesByVersion = new Map<StoryVersionId, StorySentence[]>();
  private readonly anchorsByVersion = new Map<StoryVersionId, TextAnchor[]>();
  private readonly occurrences = new Map<StoryOccurrenceId, StoryOccurrence>();
  private readonly occurrencesByVersion = new Map<StoryVersionId, StoryOccurrenceId[]>();
  private readonly bindingsByVersion = new Map<StoryVersionId, StoryTargetBinding[]>();
  private readonly revisionsByOccurrence = new Map<StoryOccurrenceId, OccurrenceAnnotationRevision[]>();

  getStory(id: StoryId): Story | null {
    return this.stories.get(id) ?? null;
  }

  saveStory(story: Story): void {
    this.stories.set(story.id, story);
  }

  getStoryVersion(id: StoryVersionId): StoryVersion | null {
    return this.versions.get(id) ?? null;
  }

  listVersions(storyId: StoryId): readonly StoryVersion[] {
    const ids = this.versionsByStory.get(storyId) ?? [];
    return ids.map((id) => this.versions.get(id)!).filter((v): v is StoryVersion => v !== undefined);
  }

  getPublishedVersion(storyId: StoryId): StoryVersion | null {
    const versions = this.listVersions(storyId).filter((v) => v.status === "PUBLISHED");
    if (versions.length === 0) return null;
    return versions.reduce((latest, v) => (v.versionNumber > latest.versionNumber ? v : latest));
  }

  saveNewVersion(input: NewVersionInput): void {
    if (this.versions.has(input.version.id)) {
      throw new Error(`DUPLICATE_STORY_VERSION_ID: ${input.version.id} already exists — new text requires a new id`);
    }
    this.versions.set(input.version.id, input.version);
    const list = this.versionsByStory.get(input.version.storyId) ?? [];
    list.push(input.version.id);
    this.versionsByStory.set(input.version.storyId, list);

    this.sentencesByVersion.set(input.version.id, [...input.sentences]);
    this.anchorsByVersion.set(input.version.id, [...input.anchors]);

    const occurrenceIds: StoryOccurrenceId[] = [];
    for (const occurrence of input.occurrences) {
      this.occurrences.set(occurrence.id, occurrence);
      occurrenceIds.push(occurrence.id);
    }
    this.occurrencesByVersion.set(input.version.id, occurrenceIds);
    this.bindingsByVersion.set(input.version.id, [...input.targetBindings]);
  }

  markPublished(version: StoryVersion): void {
    const existing = this.versions.get(version.id);
    if (existing === undefined) {
      throw new Error(`UNKNOWN_STORY_VERSION: cannot publish ${version.id}, it was never saved`);
    }
    if (existing.text !== version.text || existing.title !== version.title) {
      throw new Error(`STORY_VERSION_TEXT_IMMUTABLE: markPublished must not change text/title of ${version.id}`);
    }
    this.versions.set(version.id, version);
  }

  listSentences(storyVersionId: StoryVersionId): readonly StorySentence[] {
    return [...(this.sentencesByVersion.get(storyVersionId) ?? [])];
  }

  listAnchors(storyVersionId: StoryVersionId): readonly TextAnchor[] {
    return [...(this.anchorsByVersion.get(storyVersionId) ?? [])];
  }

  getOccurrence(id: StoryOccurrenceId): StoryOccurrence | null {
    return this.occurrences.get(id) ?? null;
  }

  listOccurrences(storyVersionId: StoryVersionId): readonly StoryOccurrence[] {
    const ids = this.occurrencesByVersion.get(storyVersionId) ?? [];
    return ids.map((id) => this.occurrences.get(id)!).filter((o): o is StoryOccurrence => o !== undefined);
  }

  listTargetBindings(storyVersionId: StoryVersionId): readonly StoryTargetBinding[] {
    return [...(this.bindingsByVersion.get(storyVersionId) ?? [])];
  }

  appendAnnotationRevision(revision: OccurrenceAnnotationRevision): void {
    const list = this.revisionsByOccurrence.get(revision.occurrenceId) ?? [];
    list.push(revision);
    this.revisionsByOccurrence.set(revision.occurrenceId, list);
  }

  listAnnotationRevisions(occurrenceId: StoryOccurrenceId): readonly OccurrenceAnnotationRevision[] {
    return [...(this.revisionsByOccurrence.get(occurrenceId) ?? [])];
  }
}
