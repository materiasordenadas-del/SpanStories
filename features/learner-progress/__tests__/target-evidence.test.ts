/**
 * `TargetEvidence` — evidence for all three curriculum target types, without
 * collapsing `SENSE`/`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` into one lexical shape.
 * See `../domain/target-evidence.ts` and `../engine/target-evidence-projection.ts`.
 *
 * Fixtures here reference real published ids from the committed A1-CURRICULUM
 * registry (found once via a throwaway inspection script, not invented):
 *   MWU with lexical identity     12B1-MWU-0005 / LEX-A1-000231
 *   MWU without lexical identity  12B1-MWU-0208
 *   GRAMMAR_UNIT                  GRAM-A1-004
 *   SENSE                         SENSE-A1-000015 / LEX-A1-000015
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../domain/ids.ts";
import { recordOccurrenceOpened } from "../engine/record-event.ts";
import { buildDeclaredStateProjection } from "../engine/declared-state-projection.ts";
import { buildProgressProjection } from "../engine/progress-projection.ts";
import {
  buildTargetEvidenceProjection,
  createStoryTargetBindingEvidence,
  indexTargetBindingsByOccurrence,
} from "../engine/target-evidence-projection.ts";
import { withoutCalculatedAt } from "../domain/projection-metadata.ts";
import { CURRENT_LEXICON_RELEASE_ID } from "../../lexical-engine/index.ts";
import { FixedClock, registry } from "./fixtures.ts";
import { asId as asStoryId, createStoryTargetBinding } from "../../story-engine/index.ts";
import type { LexemeId, SenseId } from "../../curriculum/index.ts";
import { reviseOccurrenceAnnotation, type LexicalOccurrence, type OccurrenceAnnotationRevision } from "../../story-engine/index.ts";
import { LexicalEngine } from "../../lexical-engine/engine/lexicon.ts";
import { lineageEvent } from "../../lexical-engine/__tests__/fixtures.ts";
import type { LearnerEvent } from "../domain/events.ts";
import type { StoryTargetBinding } from "../../story-engine/index.ts";
import type { ProjectionMetadata } from "../domain/projection-metadata.ts";

const learnerId = asId("LearnerId", "learner-1");

const MWU_WITH_LEXEME_TARGET = "12B1-MWU-0005";
const MWU_WITH_LEXEME_LEXEME = "LEX-A1-000231" as LexemeId;
const MWU_NO_LEXEME_TARGET = "12B1-MWU-0208";
const GRAMMAR_TARGET = "GRAM-A1-004";
const SENSE_TARGET = "SENSE-A1-000015";
const SENSE_LEXEME = "LEX-A1-000015" as LexemeId;

function metadata(): ProjectionMetadata {
  return {
    projectionAlgorithmVersion: "target-evidence/1.0.0",
    curriculumReleaseId: registry.release.releaseId,
    lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
    eventCutoff: "2026-12-31T23:59:59.999Z",
    calculatedAt: new Date().toISOString(),
  };
}

type Fixture = { readonly event: LearnerEvent; readonly binding: StoryTargetBinding | null };

/**
 * Builds one OCCURRENCE_OPENED event bound (via StoryTargetBinding) to a real
 * curriculum target. The underlying `StoryOccurrence` itself is out of scope
 * here (`../../story-engine/__tests__/construction-occurrences.test.ts`
 * already proves LEXICAL/CONSTRUCTION occurrences construct correctly for
 * these exact cases) — `TargetEvidence` resolution only needs the event and
 * the binding, both of which reference an occurrence purely by id.
 */
function fixtureFor(
  tag: string,
  targetType: "SENSE" | "MWU_SOURCE_UNIT" | "GRAMMAR_UNIT",
  targetId: string,
  recordedLexemeId: LexemeId | null,
  recordedSenseId: SenseId | null = null,
): Fixture {
  const storyId = asStoryId("StoryId", `story-te-${tag}`);
  const storyVersionId = asStoryId("StoryVersionId", `storyver-te-${tag}`);
  const occurrenceId = asStoryId("StoryOccurrenceId", `occ-te-${tag}`);

  const binding = createStoryTargetBinding({
    id: asStoryId("StoryTargetBindingId", `bind-te-${tag}`),
    storyId,
    storyVersionId,
    occurrenceId,
    targetType,
    targetId,
    bindingKind: "FIRST_INTRO",
    salience: "FOCUS",
  });

  const event = recordOccurrenceOpened(
    {
      eventId: asId("LearnerEventId", `levt-te-${tag}`),
      learnerId,
      storyId,
      storyVersionId,
      curriculumReleaseId: registry.release.releaseId,
      lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      occurrenceId,
      recordedLexemeId,
      recordedSenseId,
      recordedFormId: null,
    },
    new FixedClock(),
  );

  return { event, binding };
}

function buildEvidence(fixtures: readonly Fixture[]) {
  const events = fixtures.map((f) => f.event);
  const bindings = fixtures.map((f) => f.binding).filter((b): b is StoryTargetBinding => b !== null);
  return buildTargetEvidenceProjection(learnerId, registry, events, indexTargetBindingsByOccurrence(bindings), metadata());
}

describe("learner-progress / TargetEvidence", () => {
  test("1. SENSE evidence funciona", () => {
    const { event, binding } = fixtureFor("sense", "SENSE", SENSE_TARGET, SENSE_LEXEME);
    const evidence = buildEvidence([{ event, binding }]);
    const records = evidence.evidenceByTarget.get(SENSE_TARGET);
    assert.ok(records && records.length >= 1);
    assert.equal(records![0].targetType, "SENSE");
    assert.equal(records![0].evidenceKind, "LEXEME_ATTRIBUTION");
  });

  test("2. MWU con Lexeme funciona", () => {
    const { event, binding } = fixtureFor("mwu-lex", "MWU_SOURCE_UNIT", MWU_WITH_LEXEME_TARGET, MWU_WITH_LEXEME_LEXEME);
    const evidence = buildEvidence([{ event, binding }]);
    const records = evidence.evidenceByTarget.get(MWU_WITH_LEXEME_TARGET);
    assert.ok(records && records.length === 1);
    assert.equal(records![0].targetType, "MWU_SOURCE_UNIT");
    assert.equal(records![0].evidenceKind, "STORY_TARGET_BINDING");
  });

  test("3. MWU sin Lexeme funciona (NO_LEXICAL_IDENTITY still produces legitimate evidence)", () => {
    const { event, binding } = fixtureFor("mwu-nolex", "MWU_SOURCE_UNIT", MWU_NO_LEXEME_TARGET, null);
    const evidence = buildEvidence([{ event, binding }]);
    const records = evidence.evidenceByTarget.get(MWU_NO_LEXEME_TARGET);
    assert.ok(records && records.length === 1);
    assert.equal(records![0].targetType, "MWU_SOURCE_UNIT");
  });

  test("4. Grammar evidence funciona", () => {
    const { event, binding } = fixtureFor("gram", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    const evidence = buildEvidence([{ event, binding }]);
    const records = evidence.evidenceByTarget.get(GRAMMAR_TARGET);
    assert.ok(records && records.length === 1);
    assert.equal(records![0].targetType, "GRAMMAR_UNIT");
  });

  test("5. una MWU no crea Lexeme artificial", () => {
    const before = registry.data.lexemes.length;
    const { event, binding } = fixtureFor("mwu-nolex-2", "MWU_SOURCE_UNIT", MWU_NO_LEXEME_TARGET, null);
    const evidence = buildEvidence([{ event, binding }]);
    const record = evidence.evidenceByTarget.get(MWU_NO_LEXEME_TARGET)![0];
    assert.ok(!("lexemeId" in record));
    assert.equal(registry.data.lexemes.length, before);
  });

  test("6. Grammar no crea Lexeme artificial", () => {
    const before = registry.data.lexemes.length;
    const { event, binding } = fixtureFor("gram-2", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    const evidence = buildEvidence([{ event, binding }]);
    const record = evidence.evidenceByTarget.get(GRAMMAR_TARGET)![0];
    assert.ok(!("lexemeId" in record));
    assert.equal(registry.data.lexemes.length, before);
  });

  test("7. target inexistente falla", () => {
    const { event, binding } = fixtureFor("unknown", "GRAMMAR_UNIT", "GRAM-A1-DOES-NOT-EXIST", null);
    assert.throws(
      () => createStoryTargetBindingEvidence({ registry, event: event as never, binding: binding! }),
      /TARGET_EVIDENCE_UNKNOWN_TARGET/,
    );
  });

  test("8. StoryTargetBinding incompatible falla (occurrence/version mismatch)", () => {
    const a = fixtureFor("mismatch-a", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    const b = fixtureFor("mismatch-b", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    // b's binding does not belong to a's event: different occurrenceId/storyVersionId.
    assert.throws(
      () => createStoryTargetBindingEvidence({ registry, event: a.event as never, binding: b.binding! }),
      /TARGET_EVIDENCE_BINDING_MISMATCH/,
    );
  });

  test("9. evidence target type incorrecto falla", () => {
    const { event, binding } = fixtureFor("wrong-type", "MWU_SOURCE_UNIT", GRAMMAR_TARGET, null);
    // GRAMMAR_TARGET is really a GRAMMAR_UNIT; the binding lies and calls it MWU_SOURCE_UNIT.
    assert.throws(
      () => createStoryTargetBindingEvidence({ registry, event: event as never, binding: binding! }),
      /TARGET_EVIDENCE_TARGET_TYPE_MISMATCH/,
    );
  });

  test("10. rebuild projection = mismo resultado", () => {
    const fixtures = [
      fixtureFor("rb-sense", "SENSE", SENSE_TARGET, SENSE_LEXEME),
      fixtureFor("rb-mwu", "MWU_SOURCE_UNIT", MWU_NO_LEXEME_TARGET, null),
      fixtureFor("rb-gram", "GRAMMAR_UNIT", GRAMMAR_TARGET, null),
    ];
    const a = buildEvidence(fixtures);
    const b = buildEvidence(fixtures);
    assert.deepEqual(withoutCalculatedAt(a), withoutCalculatedAt(b));
  });

  test("11. lineage Sense sigue funcionando (unchanged lexeme-attribution path)", () => {
    const { event, binding } = fixtureFor("lineage", "SENSE", SENSE_TARGET, SENSE_LEXEME);
    const evidence = buildEvidence([{ event, binding }]);
    const record = evidence.evidenceByTarget.get(SENSE_TARGET)![0];
    assert.equal(record.evidenceKind, "LEXEME_ATTRIBUTION");
    assert.ok("lexemeId" in record && record.lexemeId === SENSE_LEXEME);
  });

  test("12. MWU evidence no depende de lineage lexical si no tiene Lexeme", () => {
    const { event, binding } = fixtureFor("mwu-no-lineage", "MWU_SOURCE_UNIT", MWU_NO_LEXEME_TARGET, null);
    assert.equal(event.eventType, "OCCURRENCE_OPENED");
    assert.equal((event as { recordedLexemeId: LexemeId | null }).recordedLexemeId, null);
    const evidence = buildEvidence([{ event, binding }]);
    assert.ok(evidence.evidenceByTarget.has(MWU_NO_LEXEME_TARGET));
  });

  test("13. Grammar evidence no depende de Lexeme", () => {
    const { event, binding } = fixtureFor("gram-no-lex", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    assert.equal((event as { recordedLexemeId: LexemeId | null }).recordedLexemeId, null);
    const evidence = buildEvidence([{ event, binding }]);
    assert.ok(evidence.evidenceByTarget.has(GRAMMAR_TARGET));
  });

  test("14. 602/214/169 son representables en la proyeccion de progreso", () => {
    const declaredState = buildDeclaredStateProjection(learnerId, [], metadata());
    const targetEvidence = buildTargetEvidenceProjection(learnerId, registry, [], indexTargetBindingsByOccurrence([]), metadata());
    const progression = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
    assert.equal(progression.breakdown.SENSE.total, 602);
    assert.equal(progression.breakdown.MWU_SOURCE_UNIT.total, 214);
    assert.equal(progression.breakdown.GRAMMAR_UNIT.total, 169);
  });

  test("15. total = 985", () => {
    const declaredState = buildDeclaredStateProjection(learnerId, [], metadata());
    const targetEvidence = buildTargetEvidenceProjection(learnerId, registry, [], indexTargetBindingsByOccurrence([]), metadata());
    const progression = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
    assert.equal(progression.breakdown.total.total, 985);
    assert.equal(progression.totalTargets, 985);
  });

  test("16. computedMastery sigue null", () => {
    const fixtures = [fixtureFor("mastery-1", "GRAMMAR_UNIT", GRAMMAR_TARGET, null)];
    const declaredState = buildDeclaredStateProjection(learnerId, fixtures.map((f) => f.event), metadata());
    const targetEvidence = buildEvidence(fixtures);
    const progression = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
    assert.equal(progression.computedMastery, null);
    for (const m of progression.modules) {
      assert.equal(m.computedMastery, null);
      for (const i of m.islands) {
        assert.equal(i.computedMastery, null);
        for (const s of i.stories) assert.equal(s.computedMastery, null);
      }
    }
  });

  test("17. KNOWN sigue siendo estado declarado, no mastery", () => {
    // KNOWN is USER_DECLARED_STATE; evidence alone (OCCURRENCE_OPENED) never sets it.
    const { event } = fixtureFor("known", "SENSE", SENSE_TARGET, SENSE_LEXEME);
    const declaredState = buildDeclaredStateProjection(learnerId, [event], metadata());
    assert.equal(declaredState.states.has(SENSE_LEXEME), false);
  });

  test("18. exposure count no se convierte en mastery", () => {
    const fixtures = [
      fixtureFor("exposure-1", "GRAMMAR_UNIT", GRAMMAR_TARGET, null),
      fixtureFor("exposure-2", "GRAMMAR_UNIT", GRAMMAR_TARGET, null),
      fixtureFor("exposure-3", "GRAMMAR_UNIT", GRAMMAR_TARGET, null),
    ];
    const evidence = buildEvidence(fixtures);
    const records = evidence.evidenceByTarget.get(GRAMMAR_TARGET)!;
    assert.equal(records.length, 3);
    const declaredState = buildDeclaredStateProjection(learnerId, fixtures.map((f) => f.event), metadata());
    const progression = buildProgressProjection(learnerId, registry, evidence, declaredState, metadata());
    assert.equal(progression.computedMastery, null);
  });
});

/**
 * Corrección A — Sense-exact evidence (see `../engine/target-evidence-projection.ts`).
 *
 * `LEX-A1-000379` is a real published multi-Sense Lexeme (no fixture): it
 * carries exactly `SENSE-A1-000385` and `SENSE-A1-000386`, found once via a
 * throwaway inspection script, not invented. `LEX-A1-000260` is real and
 * carries the split fixture `lexical-engine/__tests__/lineage.test.ts` uses.
 */
describe("learner-progress / TargetEvidence — Corrección A (Sense-exact)", () => {
  const MULTI_SENSE_LEXEME = "LEX-A1-000379" as LexemeId;
  const SENSE_A = "SENSE-A1-000385" as SenseId;
  const SENSE_B = "SENSE-A1-000386" as SenseId;

  test("A1. recordedSenseId=A credits only Sense A, never sibling Sense B", () => {
    const { event, binding } = fixtureFor("a1", "SENSE", SENSE_A, MULTI_SENSE_LEXEME, SENSE_A);
    const evidence = buildEvidence([{ event, binding }]);
    assert.ok(evidence.evidenceByTarget.has(SENSE_A));
    assert.equal(evidence.evidenceByTarget.has(SENSE_B), false);
  });

  test("A2. recordedLexemeId with recordedSenseId=null on a multi-Sense Lexeme credits neither Sense", () => {
    const { event, binding } = fixtureFor("a2", "SENSE", SENSE_A, MULTI_SENSE_LEXEME, null);
    const evidence = buildEvidence([{ event, binding }]);
    assert.equal(evidence.evidenceByTarget.has(SENSE_A), false);
    assert.equal(evidence.evidenceByTarget.has(SENSE_B), false);
  });

  test("A3. reannotation (Sense A -> Sense B) moves evidence without touching the historical event", () => {
    const occurrenceId = asStoryId("StoryOccurrenceId", "occ-te-a3");
    const occurrence: LexicalOccurrence = {
      kind: "LEXICAL",
      id: occurrenceId,
      storyVersionId: asStoryId("StoryVersionId", "storyver-te-a3"),
      sentenceId: asStoryId("SentenceId", "sent-te-a3"),
      surface: "fixture",
      lexemeId: MULTI_SENSE_LEXEME,
      senseId: SENSE_A,
      lexemeFormId: null,
      senseResolutionStatus: "RESOLVED",
      parts: [],
    };
    const revision: OccurrenceAnnotationRevision = reviseOccurrenceAnnotation(
      asStoryId("OccurrenceAnnotationRevisionId", "rev-te-a3"),
      occurrence,
      {
        newLexemeId: MULTI_SENSE_LEXEME,
        newSenseId: SENSE_B,
        reason: "fixture: corrected Sense",
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
      },
      new FixedClock(),
    );

    const event = recordOccurrenceOpened(
      {
        eventId: asId("LearnerEventId", "levt-te-a3"),
        learnerId,
        storyId: asStoryId("StoryId", "story-te-a3"),
        storyVersionId: occurrence.storyVersionId,
        curriculumReleaseId: registry.release.releaseId,
        lexiconReleaseId: CURRENT_LEXICON_RELEASE_ID,
        occurrenceId,
        recordedLexemeId: MULTI_SENSE_LEXEME,
        recordedSenseId: SENSE_A, // historical: what the learner actually saw at the time.
        recordedFormId: null,
      },
      new FixedClock(),
    );

    const evidence = buildTargetEvidenceProjection(
      learnerId,
      registry,
      [event],
      indexTargetBindingsByOccurrence([]),
      metadata(),
      {
        occurrenceById: new Map([[occurrenceId, occurrence]]),
        revisionsByOccurrence: new Map([[occurrenceId, [revision]]]),
      },
    );

    assert.equal(evidence.evidenceByTarget.has(SENSE_A), false);
    assert.ok(evidence.evidenceByTarget.has(SENSE_B));
    // The historical event itself is never mutated.
    assert.equal(event.recordedSenseId, SENSE_A);
  });

  test("A4. an ambiguous split (no disambiguating Sense) credits no SENSE target for either successor", () => {
    const SPLIT_SOURCE = "LEX-A1-000260" as LexemeId;
    const split = lineageEvent("SPLIT", ["LEX-A1-000260"], ["LEX-A1-000261", "LEX-A1-000584"], {
      reason: "fixture: ambiguous split for target-evidence A4",
    });
    const lexicalEngine = new LexicalEngine(registry, { lineageEvents: [split] });

    const { event, binding } = fixtureFor("a4", "SENSE", "SENSE-A1-000015", SPLIT_SOURCE, null);
    const evidence = buildTargetEvidenceProjection(
      learnerId,
      registry,
      [event],
      indexTargetBindingsByOccurrence(binding !== null ? [binding] : []),
      metadata(),
      { lexicalEngine },
    );
    // Neither the source's own (superseded) target nor a successor's target gets credited.
    for (const [, records] of evidence.evidenceByTarget) {
      for (const r of records) {
        assert.notEqual((r as { lexemeId?: string }).lexemeId, "LEX-A1-000261");
        assert.notEqual((r as { lexemeId?: string }).lexemeId, "LEX-A1-000584");
      }
    }
    assert.equal(evidence.evidenceByTarget.has(SPLIT_SOURCE as unknown as string), false);
  });

  test("A5. MWU_SOURCE_UNIT and GRAMMAR_UNIT evidence is unaffected by the Sense-exact change", () => {
    const { event: mwuEvent, binding: mwuBinding } = fixtureFor("a5-mwu", "MWU_SOURCE_UNIT", MWU_WITH_LEXEME_TARGET, MWU_WITH_LEXEME_LEXEME);
    const { event: gramEvent, binding: gramBinding } = fixtureFor("a5-gram", "GRAMMAR_UNIT", GRAMMAR_TARGET, null);
    const evidence = buildEvidence([
      { event: mwuEvent, binding: mwuBinding },
      { event: gramEvent, binding: gramBinding },
    ]);
    assert.equal(evidence.evidenceByTarget.get(MWU_WITH_LEXEME_TARGET)?.length, 1);
    assert.equal(evidence.evidenceByTarget.get(GRAMMAR_TARGET)?.length, 1);
  });

  test("A6. curriculum target model coverage stays 985/985 regardless of evidence presence", () => {
    const declaredState = buildDeclaredStateProjection(learnerId, [], metadata());
    const targetEvidence = buildTargetEvidenceProjection(learnerId, registry, [], indexTargetBindingsByOccurrence([]), metadata());
    const progression = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
    assert.equal(progression.breakdown.SENSE.total, 602);
    assert.equal(progression.breakdown.MWU_SOURCE_UNIT.total, 214);
    assert.equal(progression.breakdown.GRAMMAR_UNIT.total, 169);
    assert.equal(progression.totalTargets, 985);
  });

  test("A7. computedMastery stays null with Sense-exact evidence present", () => {
    const { event, binding } = fixtureFor("a7", "SENSE", SENSE_A, MULTI_SENSE_LEXEME, SENSE_A);
    const declaredState = buildDeclaredStateProjection(learnerId, [event], metadata());
    const targetEvidence = buildEvidence([{ event, binding }]);
    const progression = buildProgressProjection(learnerId, registry, targetEvidence, declaredState, metadata());
    assert.equal(progression.computedMastery, null);
  });
});
