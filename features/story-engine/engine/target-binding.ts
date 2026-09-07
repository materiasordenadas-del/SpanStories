/**
 * Construct a `StoryTargetBinding`.
 *
 * This is a plain, structural constructor — it does not check that the
 * target actually exists in the curriculum, that its kind/salience agrees
 * with the schedule, or that `productiveClaim` respects a regional target's
 * ceiling. Those are cross-referential checks against the curriculum
 * registry and belong to `../validation/publication-validator.ts`, which
 * runs before a `StoryVersion` may be published.
 */

import type { TargetType } from "../../curriculum/index.ts";
import type { StoryId, StoryOccurrenceId, StoryTargetBindingId, StoryVersionId } from "../domain/ids.ts";
import type { ProductiveClaim, StoryTargetBinding, StoryTargetBindingKind } from "../domain/model.ts";

export function createStoryTargetBinding(input: {
  readonly id: StoryTargetBindingId;
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  readonly occurrenceId: StoryOccurrenceId;
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly bindingKind: StoryTargetBindingKind;
  readonly salience?: "FOCUS" | "SUPPORTED" | null;
  readonly productiveClaim?: ProductiveClaim;
}): StoryTargetBinding {
  return {
    id: input.id,
    storyId: input.storyId,
    storyVersionId: input.storyVersionId,
    occurrenceId: input.occurrenceId,
    targetType: input.targetType,
    targetId: input.targetId,
    bindingKind: input.bindingKind,
    salience: input.bindingKind === "FIRST_INTRO" ? (input.salience ?? null) : null,
    productiveClaim: input.productiveClaim ?? "NONE",
  };
}
