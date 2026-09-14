import { practiceTargetKey } from "@/features/practice";
import { getA1CatalogForReading } from "./a1-catalog";
import { getPracticeOccurrences } from "./practice-library";

/**
 * Lo que el profesor necesita para leer el progreso sincronizado de sus estudiantes.
 * El progreso guarda ids (clave de historia, id de la palabra); los títulos y las palabras salen del contenido publicado.
 * Solo servidor.
 */

export type PublishedStory = { readonly key: string; readonly title: string };

/** Historias publicadas, con la misma clave que usa la memoria de lectura (`05/01`). */
export async function getPublishedStories(): Promise<readonly PublishedStory[]> {
  const catalog = await getA1CatalogForReading();
  return catalog.islands
    .filter((island) => island.published)
    .flatMap((island) => island.stories.map((story) => ({ key: `${story.island}/${story.story}`, title: story.title })));
}

/** La palabra (lema) de cada palabra guardable, por su clave de práctica. */
export async function getSavedWordLabels(): Promise<Readonly<Record<string, string>>> {
  const labels: Record<string, string> = {};
  for (const occurrence of await getPracticeOccurrences()) {
    const key = practiceTargetKey(occurrence.target);
    labels[key] ??= occurrence.lemma.trim();
  }
  return labels;
}
