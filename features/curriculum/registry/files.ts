/**
 * Layout of the generated runtime registry.
 *
 * One canonical output tree. The same data is not duplicated anywhere else:
 * the CSVs stay the authoring authority, this tree is the executable one.
 */

import type { CurriculumData } from "../domain/model.ts";

/** Default output directory, relative to the repository root. */
export const REGISTRY_DIR = "generated/curriculum/a1";

export const RELEASE_FILE = "release.json";

/** Collection name -> generated file, in a fixed order for reproducibility. */
export const COLLECTION_FILES = [
  ["modules", "modules.json"],
  ["islands", "islands.json"],
  ["storyBlueprints", "story-blueprints.json"],
  ["lexemes", "lexemes.json"],
  ["lexemeForms", "forms.json"],
  ["senses", "senses.json"],
  ["mwuUnits", "mwu-units.json"],
  ["grammarUnits", "grammar-units.json"],
  ["sourceAssertions", "source-assertions.json"],
  ["targets", "targets.json"],
  ["recycleEdges", "recycle-edges.json"],
] as const satisfies readonly (readonly [keyof CurriculumData, string])[];

export type CollectionKey = (typeof COLLECTION_FILES)[number][0];
