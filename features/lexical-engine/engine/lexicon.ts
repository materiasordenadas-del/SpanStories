/**
 * The lexical engine.
 *
 * Resolves lexical identity and relations over the canonical curriculum
 * registry. It consumes the phase-1 registry rather than re-deriving it, and it
 * adds exactly three things the curriculum layer does not model: identity
 * annotations (lifecycle, pronominality), homograph grouping, and lineage.
 *
 * Two rules run through every method.
 *
 * First, no answer is `undefined`. An unknown id is `NOT_FOUND`, a known id
 * with nothing attached is `FOUND` with an empty collection, and a MWU the
 * curriculum deliberately left without lexeme identity is
 * `NO_LEXICAL_IDENTITY`. The last of these is a fact about 170 published units
 * and is never a reason to create a lexeme.
 *
 * Second, resolution goes through published ids. `resolveForm` answers from the
 * `lexemeId` the form publishes, never from comparing surface strings; two
 * lexemes may share a form, and the whole point of the homograph layer is that
 * sharing a form settles nothing about identity.
 */

import type {
  Lexeme,
  LexemeForm,
  MwuUnit,
  Sense,
  SourceAssertion,
} from "../../curriculum/domain/model.ts";
import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type { CurriculumRegistry } from "../../curriculum/registry/query.ts";
import { LexicalEngineError, lexicalIssue } from "../domain/errors.ts";
import type { HomographGroup } from "../domain/homograph.ts";
import {
  isSymmetric,
  type LexicalRelation,
  type LexicalRelationType,
} from "../domain/relations.ts";
import {
  isUnauthorizedClassification,
  type LexicalIdentity,
} from "../domain/identity.ts";
import type { LexemeLineageEvent } from "../domain/lineage.ts";
import {
  LEXICON_SCHEMA_VERSION,
  type LexiconRelease,
} from "../domain/release.ts";
import { asLexicalId, type LexiconReleaseId } from "../domain/ids.ts";
import {
  found,
  notFound,
  type LexicalResult,
  type MwuIdentityResult,
} from "../domain/result.ts";
import {
  deriveBaseIdentities,
  deriveHomographGroups,
  deriveHomographRelations,
  publishedLexemeIds,
} from "./annotations.ts";
import {
  LineageGraph,
  validateLineage,
  type LineageResolution,
} from "./lineage-graph.ts";

/**
 * The lexicon release phase 2 ships.
 *
 * `v1.0` of the lexical interpretation, drawn over curriculum release
 * `A1-CURRICULUM-v1.44`. It is aligned with that release, not derived from it:
 * a later lexical interpretation of the same curriculum gets a new id here and
 * leaves the curriculum release untouched.
 */
export const CURRENT_LEXICON_RELEASE_ID = asLexicalId(
  "LexiconReleaseId",
  "A1-LEXICON-v1.0",
) as LexiconReleaseId;

export type LexicalEngineOptions = {
  /**
   * Lineage events in force. Empty for the published A1 lexicon, which has no
   * lineage history yet; populated by fixtures and by future releases.
   */
  readonly lineageEvents?: readonly LexemeLineageEvent[];
  /**
   * Editorial identity overrides, keyed by published lexeme id. Each must name
   * an authority; an override that classifies while claiming `NOT_CLASSIFIED`
   * is rejected rather than accepted quietly.
   */
  readonly identityOverrides?: readonly LexicalIdentity[];
  /** Relations declared by editorial, added to the derived homograph ones. */
  readonly declaredRelations?: readonly LexicalRelation[];
  readonly releaseId?: LexiconReleaseId;
};

export class LexicalEngine {
  readonly release: LexiconRelease;
  readonly curriculum: CurriculumRegistry;
  readonly lineage: LineageGraph;

  private readonly identities: Map<string, LexicalIdentity>;
  private readonly groups: readonly HomographGroup[];
  private readonly groupByLexeme: Map<string, HomographGroup>;
  private readonly relations: readonly LexicalRelation[];
  private readonly relationsByLexeme: Map<string, LexicalRelation[]>;

  constructor(
    curriculum: CurriculumRegistry,
    options: LexicalEngineOptions = {},
  ) {
    this.curriculum = curriculum;
    const releaseId = options.releaseId ?? CURRENT_LEXICON_RELEASE_ID;
    const lexemes = curriculum.data.lexemes;

    const lineageEvents = options.lineageEvents ?? [];
    const validation = validateLineage(
      lineageEvents,
      publishedLexemeIds(curriculum),
    );
    if (validation.status === "FAIL") throw new LexicalEngineError(validation.issues);
    this.lineage = new LineageGraph(lineageEvents);

    this.identities = new Map(deriveBaseIdentities(lexemes, releaseId));
    for (const override of options.identityOverrides ?? []) {
      if (!this.identities.has(override.lexemeId)) {
        throw new LexicalEngineError([
          lexicalIssue(
            "LEXICAL_REFERENCE_NOT_FOUND",
            `identity override names unpublished lexeme ${override.lexemeId}`,
            { referencedId: override.lexemeId },
          ),
        ]);
      }
      if (isUnauthorizedClassification(override)) {
        throw new LexicalEngineError([
          lexicalIssue(
            "LEXICAL_ANNOTATION_UNAUTHORIZED",
            `pronominality ${override.pronominality} on ${override.lexemeId} claims no authority`,
            { recordId: override.lexemeId, field: "pronominalityAuthority" },
          ),
        ]);
      }
      this.identities.set(override.lexemeId, override);
    }
    // Lineage is the authority on lifecycle: an id an event superseded is
    // superseded regardless of what the base annotation said.
    for (const [lexemeId, identity] of this.identities) {
      const fromLineage = this.lineage.lifecycleOf(lexemeId);
      if (fromLineage !== "ACTIVE" && identity.lifecycle !== fromLineage) {
        this.identities.set(lexemeId, { ...identity, lifecycle: fromLineage });
      }
    }

    this.groups = deriveHomographGroups(lexemes, releaseId);
    this.groupByLexeme = new Map();
    for (const group of this.groups) {
      for (const member of group.members) {
        this.groupByLexeme.set(member.lexemeId, group);
      }
    }

    this.relations = [
      ...deriveHomographRelations(this.groups, releaseId),
      ...(options.declaredRelations ?? []),
    ];
    this.relationsByLexeme = new Map();
    for (const relation of this.relations) {
      const ends = isSymmetric(relation.type)
        ? [relation.fromLexemeId, relation.toLexemeId]
        : [relation.fromLexemeId];
      for (const end of ends) {
        const bucket = this.relationsByLexeme.get(end);
        if (bucket === undefined) this.relationsByLexeme.set(end, [relation]);
        else bucket.push(relation);
      }
    }

    this.release = {
      releaseId,
      schemaVersion: LEXICON_SCHEMA_VERSION,
      curriculumReleaseId: curriculum.release.releaseId,
      lexemeCount: lexemes.length,
      homographGroupCount: this.groups.length,
      relationCount: this.relations.length,
      lineageEventCount: lineageEvents.length,
    };
  }

  // ------------------------------------------------------------- identities

  resolveLexeme(id: string): LexicalResult<Lexeme> {
    const lexeme = this.curriculum.getLexemeById(id);
    return lexeme === null ? notFound(id) : found(lexeme);
  }

  resolveForm(id: string): LexicalResult<LexemeForm> {
    const form = this.curriculum.getFormById(id);
    return form === null ? notFound(id) : found(form);
  }

  resolveSense(id: string): LexicalResult<Sense> {
    const sense = this.curriculum.getSenseById(id);
    return sense === null ? notFound(id) : found(sense);
  }

  /**
   * Form -> Lexeme, by published id.
   *
   * The curriculum query returns `null` for both an unknown form and a form
   * whose lexeme is missing. Those are different failures — a typo versus a
   * corrupt registry — so this method separates them, and a dangling reference
   * throws rather than being reported as a plausible `NOT_FOUND`.
   */
  getLexemeForForm(formId: string): LexicalResult<Lexeme> {
    const form = this.curriculum.getFormById(formId);
    if (form === null) return notFound(formId);
    const lexeme = this.curriculum.getLexemeById(form.lexemeId);
    if (lexeme === null) {
      throw new LexicalEngineError([
        lexicalIssue(
          "LEXICAL_REFERENCE_NOT_FOUND",
          `form ${formId} points at missing lexeme ${form.lexemeId}`,
          { recordId: formId, referencedId: form.lexemeId },
        ),
      ]);
    }
    return found(lexeme);
  }

  /** Sense -> Lexeme, by published id. Same separation as `getLexemeForForm`. */
  getLexemeForSense(senseId: string): LexicalResult<Lexeme> {
    const sense = this.curriculum.getSenseById(senseId);
    if (sense === null) return notFound(senseId);
    const lexeme = this.curriculum.getLexemeById(sense.lexemeId);
    if (lexeme === null) {
      throw new LexicalEngineError([
        lexicalIssue(
          "LEXICAL_REFERENCE_NOT_FOUND",
          `sense ${senseId} points at missing lexeme ${sense.lexemeId}`,
          { recordId: senseId, referencedId: sense.lexemeId },
        ),
      ]);
    }
    return found(lexeme);
  }

  getForms(lexemeId: string): LexicalResult<readonly LexemeForm[]> {
    const result = this.curriculum.getFormsOfLexeme(lexemeId);
    return result.status === "FOUND" ? found(result.value) : notFound(lexemeId);
  }

  getSenses(lexemeId: string): LexicalResult<readonly Sense[]> {
    const result = this.curriculum.getSensesOfLexeme(lexemeId);
    return result.status === "FOUND" ? found(result.value) : notFound(lexemeId);
  }

  /**
   * Curricular assertions attached to a sense.
   *
   * Level and status come from here and from nowhere else: never recomputed
   * from frequency, cognate status, lemma shape or any linguistic intuition.
   */
  getCurricularAssertionsForSense(
    senseId: string,
  ): LexicalResult<readonly SourceAssertion[]> {
    const result = this.curriculum.getSourceAssertionsForSense(senseId);
    return result.status === "FOUND" ? found(result.value) : notFound(senseId);
  }

  // -------------------------------------------------------------------- MWU

  resolveMwu(id: string): LexicalResult<MwuUnit> {
    const unit = this.curriculum.getMwuUnitById(id);
    return unit === null ? notFound(id) : found(unit);
  }

  /**
   * The lexeme identity of a MWU, when the curriculum published one.
   *
   * 44 of 214 units carry a `lexemeId`; the other 170 return
   * `NO_LEXICAL_IDENTITY`. That is a curricular decision recorded in the
   * published `identityPolicy` of the unit, not missing data, and it must
   * never be answered by minting a lexeme.
   */
  getMwuLexicalIdentity(mwuId: string): MwuIdentityResult<Lexeme> {
    const unit = this.curriculum.getMwuUnitById(mwuId);
    if (unit === null) return { status: "NOT_FOUND", id: mwuId };
    if (unit.lexemeId === null) {
      return { status: "NO_LEXICAL_IDENTITY", mwuId };
    }
    const lexeme = this.curriculum.getLexemeById(unit.lexemeId);
    if (lexeme === null) {
      throw new LexicalEngineError([
        lexicalIssue(
          "LEXICAL_REFERENCE_NOT_FOUND",
          `MWU ${mwuId} points at missing lexeme ${unit.lexemeId}`,
          { recordId: mwuId, referencedId: unit.lexemeId },
        ),
      ]);
    }
    return { status: "FOUND", value: lexeme };
  }

  // ------------------------------------------------------------- annotations

  getIdentity(lexemeId: string): LexicalResult<LexicalIdentity> {
    const identity = this.identities.get(lexemeId);
    return identity === undefined ? notFound(lexemeId) : found(identity);
  }

  // --------------------------------------------------------------- homographs

  getHomographGroups(): readonly HomographGroup[] {
    return this.groups;
  }

  /**
   * The group a lexeme belongs to, or `FOUND` with `null` when it shares its
   * form with nothing. A published lexeme with no homograph is not an error.
   */
  getHomographGroupOf(
    lexemeId: string,
  ): LexicalResult<HomographGroup | null> {
    if (this.curriculum.getLexemeById(lexemeId) === null) {
      return notFound(lexemeId);
    }
    return found(this.groupByLexeme.get(lexemeId) ?? null);
  }

  /**
   * Lexemes sharing a canonical written form.
   *
   * Returns a plain list, empty when nothing publishes the form: asking about
   * an arbitrary string is a legitimate question with a legitimate empty
   * answer, unlike asking about an id that ought to exist. A non-empty result
   * establishes only that the form is shared, never that the lexemes are one.
   */
  getLexemesByCanonicalForm(form: string): readonly Lexeme[] {
    return this.curriculum.data.lexemes.filter(
      (lexeme) => lexeme.lemma === form,
    );
  }

  // ---------------------------------------------------------------- relations

  getRelations(
    lexemeId: string,
    type?: LexicalRelationType,
  ): LexicalResult<readonly LexicalRelation[]> {
    if (this.curriculum.getLexemeById(lexemeId) === null) {
      return notFound(lexemeId);
    }
    const all = this.relationsByLexeme.get(lexemeId) ?? [];
    return found(type === undefined ? all : all.filter((r) => r.type === type));
  }

  // ------------------------------------------------------------------ lineage

  /**
   * What a published lexeme id means in this release.
   *
   * Superseded and retired ids keep resolving; a split source reports every
   * successor without electing one.
   */
  resolveLineage(lexemeId: string): LexicalResult<LineageResolution> {
    if (this.curriculum.getLexemeById(lexemeId) === null) {
      return notFound(lexemeId);
    }
    return found(this.lineage.resolve(lexemeId as LexemeId));
  }

  getSuccessors(lexemeId: string): LexicalResult<readonly LexemeId[]> {
    if (this.curriculum.getLexemeById(lexemeId) === null) {
      return notFound(lexemeId);
    }
    return found(this.lineage.getSuccessors(lexemeId));
  }

  getPredecessors(lexemeId: string): LexicalResult<readonly LexemeId[]> {
    if (this.curriculum.getLexemeById(lexemeId) === null) {
      return notFound(lexemeId);
    }
    return found(this.lineage.getPredecessors(lexemeId));
  }
}

/** Build an engine over an already-loaded curriculum registry. */
export function createLexicalEngine(
  curriculum: CurriculumRegistry,
  options: LexicalEngineOptions = {},
): LexicalEngine {
  return new LexicalEngine(curriculum, options);
}
