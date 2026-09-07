/**
 * "Which `StoryVersion` is the editorial workflow currently authoring
 * against" — an authority NLP acceptance consults but never derives.
 *
 * A `StoryVersion` is historical and immutable once created
 * (`docs/story-engine-implementation.md`): an old version keeps existing
 * (and stays fully readable) after a newer one supersedes it as the one
 * being worked on. `storyRepository.getStoryVersion(id) !== null` therefore
 * proves nothing about whether `id` is still current — see
 * `../review/acceptance-service.ts`'s stale-version check.
 *
 * This port is deliberately not derived from "highest `versionNumber`" or
 * "most recently created" — that guess is exactly what produced the bug this
 * type exists to fix. It is set explicitly by whatever editorial workflow
 * decides a story has moved on to a new authoring version; NLP only reads
 * it. `null` means no authoring version has been designated yet, which
 * `acceptAnnotationCandidate` treats as "nothing is current" (fails closed,
 * not open) unless historical reannotation is explicitly authorized.
 */

export interface CurrentStoryVersionResolver {
  currentEditableVersionId(storyId: string): Promise<string | null>;
}
