import { collectPracticeOccurrences, type PracticeOccurrence } from "@/features/practice";
import { getStoryReaderViewModel } from "@/features/story-reader/reader";
import { getA1Catalog } from "./a1-catalog";

/**
 * Contenido que la práctica puede usar: las apariciones léxicas de todas las historias publicadas,
 * leídas del mismo modelo que usa el lector. Solo servidor (la historia 1 se lee del disco).
 */
export async function getPracticeOccurrences(): Promise<readonly PracticeOccurrence[]> {
  const stories = getA1Catalog().islands.filter((island) => island.published).flatMap((island) => island.stories);
  const models = await Promise.all(stories.map((story) => getStoryReaderViewModel(story.island, story.story)));
  return models.flatMap((model) => collectPracticeOccurrences(model));
}
