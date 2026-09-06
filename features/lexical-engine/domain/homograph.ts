/**
 * Homograph groups.
 *
 * A `HomographGroup` collects distinct Lexemes that share a canonical written
 * form. It is a *lookup aid*, not an identity and not a knowledge unit: knowing
 * one member says nothing about the others, and the group must never be used to
 * merge, dedupe or rank its members.
 *
 * Three separations the type enforces:
 *
 *   surface string            is not lexical identity
 *   canonical form + POS      does not guarantee one Lexeme
 *   HomographGroup            is not a learner knowledge unit
 *
 * The second matters for the key. A1 publishes 20 groups and all are cross-POS
 * (`este` DEMONSTRATIVE vs NOUN, `mañana` ADV vs NOUN, `que` PRON vs SCONJ), so
 * keying by form+POS would appear to work today and would silently forbid
 * same-POS homography (`cura` "priest" vs `cura` "cure") the moment editorial
 * publishes it. The group is therefore keyed by canonical form alone, and POS
 * is recorded per member as evidence, never as a discriminator.
 */

import type { LexemeId } from "../../curriculum/domain/ids.ts";
import type { HomographGroupId, LexiconReleaseId } from "./ids.ts";

/**
 * One lexeme's participation in a group.
 *
 * `enginePos` is copied from the published lexeme and is `null` for the 468 of
 * 599 A1 lexemes the curriculum does not annotate. A null POS is not a defect
 * and does not disqualify membership: sharing a form is what makes a homograph,
 * and this feature does not tag parts of speech the curriculum withheld.
 */
export type HomographMember = {
  readonly lexemeId: LexemeId;
  /** Published POS, or null where the curriculum annotates none. */
  readonly enginePos: string | null;
  /** Published lexical category, or null. */
  readonly lexicalCategory: string | null;
};

/**
 * How a group was established.
 *
 * `PUBLISHED_FORM_COLLISION` groups are observations over published data: these
 * lexemes demonstrably share a canonical form. That is a fact about the
 * release, not a new claim, which is why deriving them is allowed where
 * inventing pronominality is not.
 */
export const HOMOGRAPH_BASES = [
  "PUBLISHED_FORM_COLLISION",
  "EDITORIAL_DECISION",
  "FIXTURE",
] as const;
export type HomographBasis = (typeof HOMOGRAPH_BASES)[number];

export type HomographGroup = {
  readonly id: HomographGroupId;
  /** The written form the members share, quoted from the published lexemes. */
  readonly canonicalForm: string;
  /** At least two distinct lexemes; a one-member group is a contradiction. */
  readonly members: readonly HomographMember[];
  readonly basis: HomographBasis;
  readonly effectiveRelease: LexiconReleaseId;
};

/**
 * Whether every member of a group carries the same published POS.
 *
 * Reported, never acted on: a same-POS group is exactly the case that must stay
 * representable without fusing identities.
 */
export function isSamePosGroup(group: HomographGroup): boolean {
  if (group.members.length === 0) return false;
  const first = group.members[0].enginePos;
  if (first === null) return false;
  return group.members.every((member) => member.enginePos === first);
}
