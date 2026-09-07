/**
 * Progress, distinguishing four dimensions that must never collapse into one
 * another (`docs/architecture/plan-implementacion-motor-v1.0.md` §"FASE 4"):
 *
 *   content coverage     how many targets a Story/Island/Module schedules
 *   learner evidence      how many of those targets have >= 1 recorded encounter
 *   learner declared state  what the learner said about a target's lexeme
 *   computed mastery       deliberately `null` — phase 4 defines no formula
 *
 * `computedMastery` is a real field, not an omitted one: the type keeps a
 * named place for it so a future phase adds a formula, not a new shape. It is
 * never derived from `targetsDeclaredKnown` or `targetsWithEvidence` here —
 * `KNOWN != mastery` and `exposure count != mastery`.
 */

import type { IslandId, ModuleId, StoryBlueprintId, TargetType } from "../../curriculum/index.ts";
import type { LearnerId } from "./ids.ts";
import type { DeclaredState } from "./declared-state.ts";
import type { ProjectionMetadata } from "./projection-metadata.ts";

export type TargetCoverage = {
  readonly targetId: string;
  readonly targetType: TargetType;
  readonly hasEvidence: boolean;
  readonly declaredState: DeclaredState | null;
};

/**
 * Scheduled/evidenced/missing counts for one `TargetType`, plus the `total`
 * across all three — never one blended figure. Every scope (`Story`/`Island`/
 * `Module`/the whole `ProgressProjection`) answers, per type and overall:
 * how many targets exist, how many have evidence, how many don't.
 *
 * `withEvidence + withoutEvidence === total` always; neither figure is
 * `mastery` — see `StoryProgress.computedMastery`.
 */
export type TargetTypeCounts = {
  readonly total: number;
  readonly withEvidence: number;
  readonly withoutEvidence: number;
};

export type TargetTypeBreakdown = {
  readonly SENSE: TargetTypeCounts;
  readonly MWU_SOURCE_UNIT: TargetTypeCounts;
  readonly GRAMMAR_UNIT: TargetTypeCounts;
  readonly total: TargetTypeCounts;
};

export type StoryProgress = {
  readonly storyBlueprintId: StoryBlueprintId;
  readonly targets: readonly TargetCoverage[];
  readonly totalTargets: number;
  readonly targetsWithEvidence: number;
  readonly targetsDeclaredKnown: number;
  readonly breakdown: TargetTypeBreakdown;
  readonly computedMastery: null;
};

export type IslandProgress = {
  readonly islandId: IslandId;
  readonly stories: readonly StoryProgress[];
  readonly totalTargets: number;
  readonly targetsWithEvidence: number;
  readonly targetsDeclaredKnown: number;
  readonly breakdown: TargetTypeBreakdown;
  readonly computedMastery: null;
};

export type ModuleProgress = {
  readonly moduleId: ModuleId;
  readonly islands: readonly IslandProgress[];
  readonly totalTargets: number;
  readonly targetsWithEvidence: number;
  readonly targetsDeclaredKnown: number;
  readonly breakdown: TargetTypeBreakdown;
  readonly computedMastery: null;
};

export type ProgressProjection = {
  readonly learnerId: LearnerId;
  readonly modules: readonly ModuleProgress[];
  readonly totalTargets: number;
  readonly targetsWithEvidence: number;
  readonly targetsDeclaredKnown: number;
  /** Level-wide breakdown: the sum of every module's. */
  readonly breakdown: TargetTypeBreakdown;
  readonly computedMastery: null;
  readonly metadata: ProjectionMetadata;
};
