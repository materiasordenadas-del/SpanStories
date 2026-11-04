"use server";

import { asId as asCurriculumId } from "../../curriculum/domain/ids.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import { loadLexicalEngine, type LexicalEngine } from "../../lexical-engine/index.ts";
import { resolveLexicalCandidates, senseCandidatesFor } from "../../nlp/engine/lexical-resolution.ts";
import type { PersonalPracticeResolutionStatus } from "../domain/personal-item.ts";

/**
 * Best-effort lexical resolution of freely typed notes text against the
 * published curriculum — read-only, and never a final answer for a phrase:
 * `resolveLexicalCandidates` only matches single published surfaces/forms, so
 * a multi-word phrase (no MWU lookup attempted here) simply comes back
 * UNRESOLVED. It never touches the NLP candidate/acceptance pipeline and
 * never mints a Lexeme or Sense — only records what already exists.
 *
 * Node-only (loadLexicalEngine reads curriculum files): built once per
 * server instance, never per call.
 */
let engine: LexicalEngine | null = null;
function getEngine(): LexicalEngine {
  engine ??= loadLexicalEngine();
  return engine;
}

export type PersonalPracticeResolution = {
  readonly status: PersonalPracticeResolutionStatus;
  readonly lexemeId: LexemeId | null;
  readonly senseId: SenseId | null;
};

export async function resolvePersonalPracticeSurface(surface: string): Promise<PersonalPracticeResolution> {
  const normalized = surface.trim().toLocaleLowerCase("es");
  if (normalized === "") return { status: "UNRESOLVED", lexemeId: null, senseId: null };

  const candidates = resolveLexicalCandidates(getEngine(), { surface: normalized, lemma: normalized });
  const lexemeIds = candidates.tier === "UNRESOLVED"
    ? []
    : candidates.tier === "PUBLISHED_FORM"
      ? [...new Set(candidates.matches.map((match) => match.lexemeId))]
      : [...candidates.lexemeIds];

  if (lexemeIds.length === 0) return { status: "UNRESOLVED", lexemeId: null, senseId: null };
  if (lexemeIds.length > 1) return { status: "AMBIGUOUS", lexemeId: null, senseId: null };

  const lexemeId = lexemeIds[0];
  const senses = senseCandidatesFor(getEngine(), lexemeId);
  if (senses.length === 0) return { status: "RESOLVED", lexemeId, senseId: null };
  if (senses.length > 1) return { status: "AMBIGUOUS", lexemeId, senseId: null };
  return { status: "RESOLVED", lexemeId, senseId: asCurriculumId("SenseId", senses[0].senseId) };
}
