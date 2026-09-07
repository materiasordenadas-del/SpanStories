/**
 * In-memory `CurrentStoryVersionResolver` — a plain `Map` the editorial
 * workflow (never NLP) writes to via `setCurrentEditableVersion`. See
 * `../domain/current-version.ts`.
 */

import type { CurrentStoryVersionResolver } from "../domain/current-version.ts";

export class InMemoryCurrentStoryVersionResolver implements CurrentStoryVersionResolver {
  private readonly current = new Map<string, string>();

  setCurrentEditableVersion(storyId: string, versionId: string): void {
    this.current.set(storyId, versionId);
  }

  async currentEditableVersionId(storyId: string): Promise<string | null> {
    return this.current.get(storyId) ?? null;
  }
}
