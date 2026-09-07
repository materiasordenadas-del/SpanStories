/**
 * The publication gate: a `StoryVersion` may not be marked published while it
 * violates a textual, lexical or curricular invariant.
 *
 * This never throws — corruption must fail loudly, but loudly means "a
 * complete, inspectable report," not an exception a caller has to guess the
 * shape of. `validateStoryPublication` re-checks every invariant from first
 * principles against the given data, independent of whether that data was
 * built through `../engine/story-service.ts`'s constructors (which already
 * enforce some of this) or reconstructed from storage.
 */

import { validateAnchorBounds, resolveAnchorText, boundsOverlap } from "../domain/anchors.ts";
import type {
  Story,
  StoryOccurrence,
  StorySentence,
  StoryTargetBinding,
  StoryVersion,
  TextAnchor,
} from "../domain/model.ts";
import type { CurriculumRegistry } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";

export type PublicationIssueCode =
  | "STORY_HAS_NO_BLUEPRINT"
  | "STORY_BLUEPRINT_NOT_FOUND"
  | "ANCHOR_OUT_OF_BOUNDS"
  | "ANCHOR_TEXT_MISMATCH"
  | "PART_ANCHOR_NOT_FOUND"
  | "PART_OVERLAP"
  | "OCCURRENCE_NO_PARTS"
  | "OCCURRENCE_MISSING_HEAD"
  | "OCCURRENCE_MISSING_ANCHOR_ROLE"
  | "LEXEME_NOT_FOUND"
  | "SENSE_NOT_FOUND"
  | "SENSE_LEXEME_MISMATCH"
  | "FORM_NOT_FOUND"
  | "A2_BOUNDARY_PUBLISHED_AS_A1"
  | "TARGET_BINDING_TARGET_NOT_FOUND"
  | "TARGET_BINDING_OCCURRENCE_NOT_FOUND"
  | "TARGET_BINDING_STORY_MISMATCH"
  | "TARGET_BINDING_KIND_MISMATCH"
  | "TARGET_BINDING_SALIENCE_MISMATCH"
  | "TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM"
  | "MISSING_REQUIRED_TARGET_BINDING";

export type PublicationIssue = {
  readonly code: PublicationIssueCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
};

export type PublicationValidationResult =
  | { readonly status: "VALID" }
  | { readonly status: "INVALID"; readonly issues: readonly PublicationIssue[] };

export type PublicationContext = {
  readonly story: Story;
  readonly storyVersion: StoryVersion;
  readonly sentences: readonly StorySentence[];
  readonly anchors: readonly TextAnchor[];
  readonly occurrences: readonly StoryOccurrence[];
  readonly targetBindings: readonly StoryTargetBinding[];
  readonly curriculumRegistry: CurriculumRegistry;
  readonly lexicalEngine: LexicalEngine;
};

function issue(code: PublicationIssueCode, message: string, context?: Record<string, unknown>): PublicationIssue {
  return context === undefined ? { code, message } : { code, message, context };
}

export function validateStoryPublication(ctx: PublicationContext): PublicationValidationResult {
  const issues: PublicationIssue[] = [];

  const sentenceById = new Map(ctx.sentences.map((s) => [s.id, s] as const));
  const anchorById = new Map(ctx.anchors.map((a) => [a.id, a] as const));

  // ---------------------------------------------------------- text integrity
  for (const anchor of ctx.anchors) {
    const sentence = sentenceById.get(anchor.sentenceId);
    if (sentence === undefined) {
      issues.push(issue("ANCHOR_OUT_OF_BOUNDS", `anchor ${anchor.id} names unknown sentence ${anchor.sentenceId}`, { anchorId: anchor.id }));
      continue;
    }
    const validation = validateAnchorBounds(sentence.text, anchor);
    if (validation.status !== "VALID") {
      issues.push(issue("ANCHOR_OUT_OF_BOUNDS", `anchor ${anchor.id} is ${validation.status} on sentence ${sentence.id}`, { anchorId: anchor.id }));
    }
  }

  for (const occurrence of ctx.occurrences) {
    if (occurrence.parts.length === 0) {
      issues.push(issue("OCCURRENCE_NO_PARTS", `occurrence ${occurrence.id} has no parts`, { occurrenceId: occurrence.id }));
      continue;
    }

    const resolvedParts: { readonly anchor: TextAnchor; readonly role: string }[] = [];
    for (const part of occurrence.parts) {
      const anchor = anchorById.get(part.anchorId);
      if (anchor === undefined) {
        issues.push(issue("PART_ANCHOR_NOT_FOUND", `part ${part.id} names unknown anchor ${part.anchorId}`, { partId: part.id }));
        continue;
      }
      const sentence = sentenceById.get(anchor.sentenceId);
      if (sentence !== undefined) {
        try {
          resolveAnchorText(sentence.text, anchor);
        } catch {
          issues.push(issue("ANCHOR_TEXT_MISMATCH", `anchor ${anchor.id} cannot resolve against sentence ${sentence.id}`, { anchorId: anchor.id }));
        }
      }
      resolvedParts.push({ anchor, role: part.role });
    }

    for (let i = 0; i < resolvedParts.length; i++) {
      for (let j = i + 1; j < resolvedParts.length; j++) {
        if (boundsOverlap(resolvedParts[i].anchor, resolvedParts[j].anchor)) {
          issues.push(issue("PART_OVERLAP", `occurrence ${occurrence.id} has overlapping parts`, { occurrenceId: occurrence.id }));
        }
      }
    }

    if (occurrence.kind === "LEXICAL" && !resolvedParts.some((p) => p.role === "HEAD")) {
      issues.push(issue("OCCURRENCE_MISSING_HEAD", `LEXICAL occurrence ${occurrence.id} has no HEAD part`, { occurrenceId: occurrence.id }));
    }
    if (occurrence.kind === "CONSTRUCTION" && !resolvedParts.some((p) => p.role === "ANCHOR")) {
      issues.push(issue("OCCURRENCE_MISSING_ANCHOR_ROLE", `CONSTRUCTION occurrence ${occurrence.id} has no ANCHOR part`, { occurrenceId: occurrence.id }));
    }
  }

  // ------------------------------------------------------- lexical integrity
  for (const occurrence of ctx.occurrences) {
    if (occurrence.kind !== "LEXICAL") continue;

    const lexemeResult = ctx.lexicalEngine.resolveLexeme(occurrence.lexemeId);
    if (lexemeResult.status === "NOT_FOUND") {
      issues.push(issue("LEXEME_NOT_FOUND", `occurrence ${occurrence.id} names unknown lexeme ${occurrence.lexemeId}`, { occurrenceId: occurrence.id }));
    }

    if (occurrence.senseId !== null) {
      const senseResult = ctx.lexicalEngine.resolveSense(occurrence.senseId);
      if (senseResult.status === "NOT_FOUND") {
        issues.push(issue("SENSE_NOT_FOUND", `occurrence ${occurrence.id} names unknown sense ${occurrence.senseId}`, { occurrenceId: occurrence.id }));
      } else {
        const senseLexeme = ctx.lexicalEngine.getLexemeForSense(occurrence.senseId);
        if (senseLexeme.status === "FOUND" && senseLexeme.value.id !== occurrence.lexemeId) {
          issues.push(
            issue("SENSE_LEXEME_MISMATCH", `sense ${occurrence.senseId} belongs to ${senseLexeme.value.id}, not ${occurrence.lexemeId}`, {
              occurrenceId: occurrence.id,
            }),
          );
        }
        if (senseResult.status === "FOUND" && !senseResult.value.isA1) {
          issues.push(
            issue("A2_BOUNDARY_PUBLISHED_AS_A1", `occurrence ${occurrence.id} uses A2-boundary sense ${occurrence.senseId} in an A1 story`, {
              occurrenceId: occurrence.id,
            }),
          );
        }
      }
    }

    if (occurrence.lexemeFormId !== null) {
      const formResult = ctx.lexicalEngine.resolveForm(occurrence.lexemeFormId);
      if (formResult.status === "NOT_FOUND") {
        issues.push(issue("FORM_NOT_FOUND", `occurrence ${occurrence.id} names unknown form ${occurrence.lexemeFormId}`, { occurrenceId: occurrence.id }));
      }
    }
  }

  // ---------------------------------------------------- curricular integrity
  if (ctx.story.storyBlueprintId === null) {
    issues.push(issue("STORY_HAS_NO_BLUEPRINT", `story ${ctx.story.id} has no StoryBlueprint and cannot be published as curricular`, { storyId: ctx.story.id }));
    return { status: "INVALID", issues };
  }

  const blueprintId = ctx.story.storyBlueprintId;
  const blueprint = ctx.curriculumRegistry.getStoryBlueprintById(blueprintId);
  if (blueprint === null) {
    issues.push(issue("STORY_BLUEPRINT_NOT_FOUND", `story ${ctx.story.id} names unknown blueprint ${blueprintId}`, { storyId: ctx.story.id }));
    return { status: "INVALID", issues };
  }

  const occurrenceById = new Map(ctx.occurrences.map((o) => [o.id, o] as const));

  for (const binding of ctx.targetBindings) {
    const resolved = ctx.curriculumRegistry.resolveTarget(binding.targetId);
    if (resolved === null) {
      issues.push(issue("TARGET_BINDING_TARGET_NOT_FOUND", `binding ${binding.id} names unknown target ${binding.targetId}`, { bindingId: binding.id }));
      continue;
    }
    if (!occurrenceById.has(binding.occurrenceId)) {
      issues.push(issue("TARGET_BINDING_OCCURRENCE_NOT_FOUND", `binding ${binding.id} names unknown occurrence ${binding.occurrenceId}`, { bindingId: binding.id }));
    }

    if (binding.bindingKind === "FIRST_INTRO") {
      if (resolved.allocation.firstIntroductionStoryId !== blueprintId) {
        issues.push(
          issue("TARGET_BINDING_STORY_MISMATCH", `target ${binding.targetId} is first introduced in ${resolved.allocation.firstIntroductionStoryId}, not ${blueprintId}`, {
            bindingId: binding.id,
          }),
        );
      }
      if (resolved.allocation.introSalience !== binding.salience) {
        issues.push(
          issue("TARGET_BINDING_SALIENCE_MISMATCH", `target ${binding.targetId} is scheduled ${resolved.allocation.introSalience}, binding claims ${binding.salience}`, {
            bindingId: binding.id,
          }),
        );
      }
    } else {
      const edge = ctx.curriculumRegistry.data.recycleEdges.find(
        (e) => e.targetId === binding.targetId && e.returnStoryId === blueprintId,
      );
      if (edge === undefined) {
        issues.push(
          issue("TARGET_BINDING_STORY_MISMATCH", `target ${binding.targetId} has no recycle edge returning in ${blueprintId}`, { bindingId: binding.id }),
        );
      } else if (edge.returnStage !== binding.bindingKind) {
        issues.push(
          issue("TARGET_BINDING_KIND_MISMATCH", `target ${binding.targetId} returns in ${blueprintId} as ${edge.returnStage}, binding claims ${binding.bindingKind}`, {
            bindingId: binding.id,
          }),
        );
      }
    }

    if (binding.productiveClaim === "UNIVERSAL" && resolved.allocation.regionalPolicy !== null) {
      issues.push(
        issue("TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM", `target ${binding.targetId} is regional-receptive; binding ${binding.id} cannot claim UNIVERSAL productive demand`, {
          bindingId: binding.id,
        }),
      );
    }
  }

  const boundFirstIntro = new Set(
    ctx.targetBindings.filter((b) => b.bindingKind === "FIRST_INTRO").map((b) => b.targetId),
  );
  const introducedHere = ctx.curriculumRegistry.getTargetsIntroducedIn(blueprintId);
  if (introducedHere.status === "FOUND") {
    for (const target of introducedHere.value) {
      if (!boundFirstIntro.has(target.targetId)) {
        issues.push(
          issue("MISSING_REQUIRED_TARGET_BINDING", `target ${target.targetId} is first introduced in ${blueprintId} but has no FIRST_INTRO binding`, {
            targetId: target.targetId,
          }),
        );
      }
    }
  }

  const boundReturns = new Set(
    ctx.targetBindings.filter((b) => b.bindingKind !== "FIRST_INTRO").map((b) => `${b.targetId}::${b.bindingKind}`),
  );
  const returningHere = ctx.curriculumRegistry.data.recycleEdges.filter((e) => e.returnStoryId === blueprintId);
  for (const edge of returningHere) {
    const key = `${edge.targetId}::${edge.returnStage}`;
    if (!boundReturns.has(key)) {
      issues.push(
        issue("MISSING_REQUIRED_TARGET_BINDING", `target ${edge.targetId} returns (${edge.returnStage}) in ${blueprintId} but has no matching binding`, {
          targetId: edge.targetId,
        }),
      );
    }
  }

  return issues.length === 0 ? { status: "VALID" } : { status: "INVALID", issues };
}
