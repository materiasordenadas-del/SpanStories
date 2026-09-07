/**
 * TECHNICAL_FIXTURE — not a curricular Story.
 *
 * `content/a1/module-1/island-1/story-1.ts` ("La compra olvidada") predates
 * the Story Engine: it is a hand-authored prototype with its own non-curricular
 * ids (`lex-ir`, `occ-fue`, ...), built to exercise `components/story-reader.tsx`
 * before any canonical engine existed. `HANDOFF_NEXT_PHASE.md` §11 and
 * `docs/architecture/plan-implementacion-motor-v1.0.md` both task Fase 3 with
 * showing the new engine can reproduce that fixture's technical behaviour —
 * contiguous *and* discontinuous occurrences addressable by stable ids —
 * without inventing a mapping onto one of the 32 published `StoryBlueprint`s.
 *
 * This module is that demonstration, built entirely with the phase-3 engine
 * (`Story`, `StoryVersion`, `TextAnchor`, `StoryOccurrence`, `OccurrencePart`).
 * `storyBlueprintId` is `null`: the publication validator rejects publishing
 * this as curricular (`STORY_HAS_NO_BLUEPRINT`) by construction, so it can
 * never be mistaken for one of the 32 stories — see `../__tests__/legacy-fixture.test.ts`.
 * The prototype file itself (`content/a1/...`, `lib/lexical-prototype.ts`,
 * `components/story-reader.tsx`) is left untouched; nothing here replaces it.
 */

import { asId } from "../domain/ids.ts";
import { assembleStoryVersion, createLexicalOccurrence, createStory, createTextAnchor } from "../engine/story-service.ts";
import type { Clock } from "../domain/ports.ts";
import type { LexemeId } from "../../curriculum/index.ts";
import type { Story, StoryOccurrence, StorySentence, StoryVersion, TextAnchor } from "../domain/model.ts";

// Fixture-only lexeme ids. Deliberately lowercase and hyphenated: they can
// never collide with a published `LEX-A1-######` id, mirroring the original
// prototype's own non-curricular namespace.
const LEX_IR = "lex-ir" as LexemeId;
const LEX_DARSE_CUENTA = "lex-darse-cuenta" as LexemeId;

export type LegacyFixtureStory = {
  readonly story: Story;
  readonly version: StoryVersion;
  readonly sentences: readonly StorySentence[];
  readonly anchors: readonly TextAnchor[];
  readonly occurrences: readonly StoryOccurrence[];
};

/** A fixed instant, so the fixture's own output is deterministic across runs. */
class FixtureClock implements Clock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

export function buildLegacyFixtureStory(clock: Clock = new FixtureClock()): LegacyFixtureStory {
  const storyId = asId("StoryId", "story-la-compra-olvidada");
  const storyVersionId = asId("StoryVersionId", "storyver-la-compra-olvidada-1");

  const story = createStory(storyId, null, clock); // no StoryBlueprint: not curricular

  const s1Text = "Ayer Marta fue al mercado.";
  const s1: StorySentence = { id: asId("SentenceId", "sent-1"), storyVersionId, order: 1, text: s1Text, tokens: [] };

  // Contiguous occurrence: "fue" (ir).
  const fueStart = s1Text.indexOf("fue");
  const fueAnchor = createTextAnchor(asId("TextAnchorId", "anchor-fue"), storyVersionId, s1, {
    start: fueStart,
    end: fueStart + "fue".length,
  });
  const fueOccurrence = createLexicalOccurrence({
    id: asId("StoryOccurrenceId", "occ-fue"),
    storyVersionId,
    sentenceId: s1.id,
    surface: "fue",
    lexemeId: LEX_IR,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "NOT_REQUIRED",
    parts: [{ id: asId("OccurrencePartId", "part-fue"), anchor: fueAnchor, role: "HEAD" }],
  });

  const s2Text = "Marta se dio finalmente cuenta del problema.";
  const s2: StorySentence = { id: asId("SentenceId", "sent-2"), storyVersionId, order: 2, text: s2Text, tokens: [] };

  // Discontinuous occurrence: "se dio [finalmente] cuenta" (darse cuenta).
  // "finalmente" sits between HEAD and FIXED and belongs to no part.
  const cliticStart = s2Text.indexOf(" se ") + 1;
  const cliticAnchor = createTextAnchor(asId("TextAnchorId", "anchor-se"), storyVersionId, s2, {
    start: cliticStart,
    end: cliticStart + 2,
  });
  const headStart = s2Text.indexOf("dio");
  const headAnchor = createTextAnchor(asId("TextAnchorId", "anchor-dio"), storyVersionId, s2, {
    start: headStart,
    end: headStart + "dio".length,
  });
  const fixedStart = s2Text.indexOf("cuenta");
  const fixedAnchor = createTextAnchor(asId("TextAnchorId", "anchor-cuenta"), storyVersionId, s2, {
    start: fixedStart,
    end: fixedStart + "cuenta".length,
  });
  const darseCuentaOccurrence = createLexicalOccurrence({
    id: asId("StoryOccurrenceId", "occ-se-dio-cuenta"),
    storyVersionId,
    sentenceId: s2.id,
    surface: "se dio cuenta",
    lexemeId: LEX_DARSE_CUENTA,
    senseId: null,
    lexemeFormId: null,
    senseResolutionStatus: "NOT_REQUIRED",
    parts: [
      { id: asId("OccurrencePartId", "part-se"), anchor: cliticAnchor, role: "CLITIC" },
      { id: asId("OccurrencePartId", "part-dio"), anchor: headAnchor, role: "HEAD" },
      { id: asId("OccurrencePartId", "part-cuenta"), anchor: fixedAnchor, role: "FIXED" },
    ],
  });

  const sentences = [s1, s2];
  const anchors = [fueAnchor, cliticAnchor, headAnchor, fixedAnchor];
  const occurrences = [fueOccurrence, darseCuentaOccurrence];

  const version = assembleStoryVersion({
    id: storyVersionId,
    storyId,
    versionNumber: 1,
    title: "La compra olvidada",
    sentences,
    status: "DRAFT",
    clock,
  });

  return { story, version, sentences, anchors, occurrences };
}
