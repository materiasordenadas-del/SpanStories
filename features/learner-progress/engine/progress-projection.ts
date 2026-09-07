/**
 * Story/Island/Module progress, from curriculum content coverage plus a
 * learner's own evidence and declared state — see `../domain/progress.ts`
 * for why `computedMastery` is always `null` here.
 *
 * Coverage is walked from `CurriculumRegistry.getTargetsIntroducedIn`, the
 * same authority the Story Engine's publication validator uses — this
 * feature does not maintain a second copy of "which targets does this story
 * introduce."
 */

import type { CurriculumRegistry, StoryBlueprintId } from "../../curriculum/index.ts";
import type { ContextHistoryProjection } from "../domain/context-history.ts";
import type { DeclaredStateProjection } from "./declared-state-projection.ts";
import type { LearnerId } from "../domain/ids.ts";
import type {
  IslandProgress,
  ModuleProgress,
  ProgressProjection,
  StoryProgress,
  TargetCoverage,
} from "../domain/progress.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function buildProgressProjection(
  learnerId: LearnerId,
  registry: CurriculumRegistry,
  contextHistory: ContextHistoryProjection,
  declaredState: DeclaredStateProjection,
  metadata: ProjectionMetadata,
): ProgressProjection {
  const buildStoryProgress = (storyBlueprintId: StoryBlueprintId): StoryProgress => {
    const introduced = registry.getTargetsIntroducedIn(storyBlueprintId);
    const targets: TargetCoverage[] = [];
    if (introduced.status === "FOUND") {
      for (const target of introduced.value) {
        const lexemeId = target.lexemeId;
        const hasEvidence = lexemeId !== null && contextHistory.entriesByLexeme.has(lexemeId);
        const declared = lexemeId !== null ? (declaredState.states.get(lexemeId)?.state ?? null) : null;
        targets.push({ targetId: target.targetId, hasEvidence, declaredState: declared });
      }
    }
    return {
      storyBlueprintId,
      targets,
      totalTargets: targets.length,
      targetsWithEvidence: targets.filter((t) => t.hasEvidence).length,
      targetsDeclaredKnown: targets.filter((t) => t.declaredState === "KNOWN").length,
      computedMastery: null,
    };
  };

  const modules: ModuleProgress[] = registry.getModulesInOrder().map((curriculumModule) => {
    const islands: IslandProgress[] = curriculumModule.islandIds.map((islandId) => {
      const island = registry.getIslandById(islandId);
      const stories: StoryProgress[] = (island?.storyIds ?? []).map(buildStoryProgress);
      return {
        islandId,
        stories,
        totalTargets: sum(stories.map((s) => s.totalTargets)),
        targetsWithEvidence: sum(stories.map((s) => s.targetsWithEvidence)),
        targetsDeclaredKnown: sum(stories.map((s) => s.targetsDeclaredKnown)),
        computedMastery: null,
      };
    });
    return {
      moduleId: curriculumModule.id,
      islands,
      totalTargets: sum(islands.map((i) => i.totalTargets)),
      targetsWithEvidence: sum(islands.map((i) => i.targetsWithEvidence)),
      targetsDeclaredKnown: sum(islands.map((i) => i.targetsDeclaredKnown)),
      computedMastery: null,
    };
  });

  return { learnerId, modules, metadata };
}
