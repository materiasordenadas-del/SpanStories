/**
 * Story/Island/Module/Level progress, from curriculum content coverage plus
 * a learner's own `TargetEvidence` and declared state — see
 * `../domain/progress.ts` for why `computedMastery` is always `null` here.
 *
 * Coverage is walked from `CurriculumRegistry.getTargetsIntroducedIn`, the
 * same authority the Story Engine's publication validator uses — this
 * feature does not maintain a second copy of "which targets does this story
 * introduce." Every one of the 985 targets — 602 `SENSE`, 214
 * `MWU_SOURCE_UNIT`, 169 `GRAMMAR_UNIT` — is representable here: evidence for
 * a target never requires that target to have a `Lexeme`
 * (`../domain/target-evidence.ts`).
 */

import type { CurriculumRegistry, StoryBlueprintId, TargetType } from "../../curriculum/index.ts";
import type { DeclaredStateProjection } from "./declared-state-projection.ts";
import type { LearnerId } from "../domain/ids.ts";
import type {
  IslandProgress,
  ModuleProgress,
  ProgressProjection,
  StoryProgress,
  TargetCoverage,
  TargetTypeBreakdown,
  TargetTypeCounts,
} from "../domain/progress.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";
import type { TargetEvidenceProjection } from "./target-evidence-projection.ts";

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function emptyCounts(): TargetTypeCounts {
  return { total: 0, withEvidence: 0, withoutEvidence: 0 };
}

function addCounts(a: TargetTypeCounts, b: TargetTypeCounts): TargetTypeCounts {
  return {
    total: a.total + b.total,
    withEvidence: a.withEvidence + b.withEvidence,
    withoutEvidence: a.withoutEvidence + b.withoutEvidence,
  };
}

function emptyBreakdown(): TargetTypeBreakdown {
  return { SENSE: emptyCounts(), MWU_SOURCE_UNIT: emptyCounts(), GRAMMAR_UNIT: emptyCounts(), total: emptyCounts() };
}

function addBreakdown(a: TargetTypeBreakdown, b: TargetTypeBreakdown): TargetTypeBreakdown {
  return {
    SENSE: addCounts(a.SENSE, b.SENSE),
    MWU_SOURCE_UNIT: addCounts(a.MWU_SOURCE_UNIT, b.MWU_SOURCE_UNIT),
    GRAMMAR_UNIT: addCounts(a.GRAMMAR_UNIT, b.GRAMMAR_UNIT),
    total: addCounts(a.total, b.total),
  };
}

type MutableCounts = { total: number; withEvidence: number; withoutEvidence: number };

function bump(counts: MutableCounts, hasEvidence: boolean): void {
  counts.total += 1;
  if (hasEvidence) counts.withEvidence += 1;
  else counts.withoutEvidence += 1;
}

function breakdownOf(targets: readonly TargetCoverage[]): TargetTypeBreakdown {
  const sense: MutableCounts = { total: 0, withEvidence: 0, withoutEvidence: 0 };
  const mwu: MutableCounts = { total: 0, withEvidence: 0, withoutEvidence: 0 };
  const grammar: MutableCounts = { total: 0, withEvidence: 0, withoutEvidence: 0 };
  const total: MutableCounts = { total: 0, withEvidence: 0, withoutEvidence: 0 };

  for (const target of targets) {
    const perType = target.targetType === "SENSE" ? sense : target.targetType === "MWU_SOURCE_UNIT" ? mwu : grammar;
    bump(perType, target.hasEvidence);
    bump(total, target.hasEvidence);
  }

  return { SENSE: sense, MWU_SOURCE_UNIT: mwu, GRAMMAR_UNIT: grammar, total };
}

export function buildProgressProjection(
  learnerId: LearnerId,
  registry: CurriculumRegistry,
  targetEvidence: TargetEvidenceProjection,
  declaredState: DeclaredStateProjection,
  metadata: ProjectionMetadata,
): ProgressProjection {
  const buildStoryProgress = (storyBlueprintId: StoryBlueprintId): StoryProgress => {
    const introduced = registry.getTargetsIntroducedIn(storyBlueprintId);
    const targets: TargetCoverage[] = [];
    if (introduced.status === "FOUND") {
      for (const target of introduced.value) {
        const lexemeId = target.lexemeId;
        const hasEvidence = targetEvidence.evidenceByTarget.has(target.targetId);
        const declared = lexemeId !== null ? (declaredState.states.get(lexemeId)?.state ?? null) : null;
        targets.push({
          targetId: target.targetId,
          targetType: target.targetType as TargetType,
          hasEvidence,
          declaredState: declared,
        });
      }
    }
    return {
      storyBlueprintId,
      targets,
      totalTargets: targets.length,
      targetsWithEvidence: targets.filter((t) => t.hasEvidence).length,
      targetsDeclaredKnown: targets.filter((t) => t.declaredState === "KNOWN").length,
      breakdown: breakdownOf(targets),
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
        breakdown: stories.reduce((acc, s) => addBreakdown(acc, s.breakdown), emptyBreakdown()),
        computedMastery: null,
      };
    });
    return {
      moduleId: curriculumModule.id,
      islands,
      totalTargets: sum(islands.map((i) => i.totalTargets)),
      targetsWithEvidence: sum(islands.map((i) => i.targetsWithEvidence)),
      targetsDeclaredKnown: sum(islands.map((i) => i.targetsDeclaredKnown)),
      breakdown: islands.reduce((acc, i) => addBreakdown(acc, i.breakdown), emptyBreakdown()),
      computedMastery: null,
    };
  });

  return {
    learnerId,
    modules,
    totalTargets: sum(modules.map((m) => m.totalTargets)),
    targetsWithEvidence: sum(modules.map((m) => m.targetsWithEvidence)),
    targetsDeclaredKnown: sum(modules.map((m) => m.targetsDeclaredKnown)),
    breakdown: modules.reduce((acc, m) => addBreakdown(acc, m.breakdown), emptyBreakdown()),
    computedMastery: null,
    metadata,
  };
}
