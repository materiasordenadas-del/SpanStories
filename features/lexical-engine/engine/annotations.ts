/**
 * The lexical layer built over a curriculum registry.
 *
 * This module draws the line between what may be *derived* and what must be
 * *declared*, and the line is evidential:
 *
 *   Homograph groups are derived. That two published lexemes carry the same
 *   canonical form is an observation about the release — it can be recomputed
 *   from the data and checked by anyone. Deriving it invents nothing.
 *
 *   Pronominality is not derived. No published field states it, and the only
 *   available signal is a `-se` ending on six lemmas, which is orthography
 *   rather than a lexical fact. Every lexeme therefore starts `UNSPECIFIED`
 *   with authority `NOT_CLASSIFIED`, and only an editorial declaration moves it.
 *
 *   Lifecycle is declared-then-derived. Published lexemes start `ACTIVE`;
 *   lineage events, which A1 does not yet carry, are what produce `SUPERSEDED`
 *   and `RETIRED`.
 */

import type { CurriculumRegistry } from "../../curriculum/registry/query.ts";
import type { Lexeme } from "../../curriculum/domain/model.ts";
import type { LexemeId } from "../../curriculum/domain/ids.ts";
import {
  asLexicalId,
  type HomographGroupId,
  type LexicalRelationId,
  type LexiconReleaseId,
} from "../domain/ids.ts";
import type { HomographGroup, HomographMember } from "../domain/homograph.ts";
import type { LexicalRelation } from "../domain/relations.ts";
import {
  publishedIdentity,
  type LexicalIdentity,
} from "../domain/identity.ts";

/**
 * The canonical written form of a lexeme, for grouping purposes.
 *
 * Deliberately the published `lemma` and nothing else: no lowercasing, no
 * accent folding, no normalisation. Two lexemes are grouped when the curriculum
 * publishes the same string for both, not when a normaliser decides they are
 * close enough. Fold accents here and `si` would join `sí`.
 */
export function canonicalFormOf(lexeme: Lexeme): string {
  return lexeme.lemma;
}

function memberOf(lexeme: Lexeme): HomographMember {
  return {
    lexemeId: lexeme.id,
    enginePos: lexeme.enginePos,
    lexicalCategory: lexeme.lexicalCategory,
  };
}

/** Zero-padded sequence number for an id this feature assigns. */
function sequence(index: number, width: number): string {
  return String(index).padStart(width, "0");
}

/**
 * Derive homograph groups from published form collisions.
 *
 * Groups are emitted in ascending canonical-form order and members in ascending
 * published-id order, so the same registry always yields the same group ids.
 * Ids are positional within that stable ordering; they are never derived from
 * the form string itself.
 */
export function deriveHomographGroups(
  lexemes: readonly Lexeme[],
  effectiveRelease: LexiconReleaseId,
): readonly HomographGroup[] {
  const byForm = new Map<string, Lexeme[]>();
  for (const lexeme of lexemes) {
    const form = canonicalFormOf(lexeme);
    const bucket = byForm.get(form);
    if (bucket === undefined) byForm.set(form, [lexeme]);
    else bucket.push(lexeme);
  }

  const forms = [...byForm.keys()]
    .filter((form) => (byForm.get(form) as Lexeme[]).length > 1)
    .sort();

  return forms.map((form, index) => {
    const members = (byForm.get(form) as Lexeme[])
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(memberOf);
    return {
      id: asLexicalId(
        "HomographGroupId",
        `HG-A1-${sequence(index + 1, 4)}`,
      ) as HomographGroupId,
      canonicalForm: form,
      members,
      basis: "PUBLISHED_FORM_COLLISION" as const,
      effectiveRelease,
    };
  });
}

/**
 * Derive the `HOMOGRAPH_OF` relations implied by a set of groups.
 *
 * Stored once per unordered pair; the engine answers from either endpoint
 * because the relation is symmetric. A group of n members yields n*(n-1)/2
 * relations.
 */
export function deriveHomographRelations(
  groups: readonly HomographGroup[],
  effectiveRelease: LexiconReleaseId,
): readonly LexicalRelation[] {
  const relations: LexicalRelation[] = [];
  for (const group of groups) {
    for (let i = 0; i < group.members.length; i += 1) {
      for (let j = i + 1; j < group.members.length; j += 1) {
        relations.push({
          id: asLexicalId(
            "LexicalRelationId",
            `LR-A1-${sequence(relations.length + 1, 6)}`,
          ) as LexicalRelationId,
          type: "HOMOGRAPH_OF",
          fromLexemeId: group.members[i].lexemeId,
          toLexemeId: group.members[j].lexemeId,
          basis: "PUBLISHED_FORM_COLLISION",
          effectiveRelease,
          note: `shares the canonical form "${group.canonicalForm}"`,
        });
      }
    }
  }
  return relations;
}

/**
 * The identity record every published lexeme starts with.
 *
 * Uniform by construction. A per-lexeme default would mean the engine had
 * decided something the curriculum did not state.
 */
export function deriveBaseIdentities(
  lexemes: readonly Lexeme[],
  effectiveRelease: LexiconReleaseId,
): ReadonlyMap<string, LexicalIdentity> {
  const out = new Map<string, LexicalIdentity>();
  for (const lexeme of lexemes) {
    out.set(lexeme.id, publishedIdentity(lexeme.id as LexemeId, effectiveRelease));
  }
  return out;
}

/** Published lexeme ids of a registry, for lineage reference checking. */
export function publishedLexemeIds(
  registry: CurriculumRegistry,
): ReadonlySet<string> {
  return new Set(registry.data.lexemes.map((lexeme) => lexeme.id));
}
