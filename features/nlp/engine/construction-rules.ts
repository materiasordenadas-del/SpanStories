/**
 * Explicit, auditable construction patterns — §34 of the governing brief:
 * "los patrones de construcciones deben venir de reglas gobernadas/
 * configuración explícita, no de una inferencia opaca imposible de auditar."
 *
 * Every rule below is a small, named, inspectable table plus a detector
 * function that reads `TokenAnalysis[]`. None of it classifies
 * pronominality (§31 — `LexicalIdentity.pronominality` is never touched by
 * this feature, let alone inferred from a `-se` suffix): a governed surface
 * pattern here only ever *proposes* a candidate's structure, for a human or
 * the deterministic acceptance service to confirm or reject.
 */

import type { TokenAnalysis } from "../domain/analysis.ts";

// ------------------------------------------------------ fused clitic split

/**
 * Imperative forms where a clitic pronoun is orthographically fused onto the
 * verb inside one token — "vete" = "ve" (imperative of "ir") + "te". A
 * deliberately small, explicit table (§33: "no exigir que el tokenizer lo
 * separe físicamente" — the split is proposed regardless of how the
 * tokenizer segmented the surface), not a general morphological analyzer.
 * Extend by adding a row, never by adding a generic "-se ending" rule.
 */
export const FUSED_CLITIC_TABLE: readonly { readonly fused: string; readonly head: string; readonly headLemma: string; readonly clitic: string }[] = [
  { fused: "vete", head: "ve", headLemma: "ir", clitic: "te" },
  { fused: "vámonos", head: "vámo", headLemma: "ir", clitic: "nos" },
  { fused: "dile", head: "di", headLemma: "decir", clitic: "le" },
  { fused: "dame", head: "da", headLemma: "dar", clitic: "me" },
  { fused: "hazlo", head: "haz", headLemma: "hacer", clitic: "lo" },
];

export type FusedCliticSplit = { readonly head: string; readonly headLemma: string; readonly clitic: string };

/** Case-insensitive lookup against `FUSED_CLITIC_TABLE`. `null` if `surface` names no known fusion. */
export function detectFusedCliticSplit(surface: string): FusedCliticSplit | null {
  const lower = surface.toLowerCase();
  const match = FUSED_CLITIC_TABLE.find((row) => row.fused === lower);
  return match === undefined ? null : { head: match.head, headLemma: match.headLemma, clitic: match.clitic };
}

// ------------------------------------------------- discontinuous lexical MWU

/**
 * A discontinuous multiword pattern: a reflexive CLITIC, a verbal HEAD and a
 * FIXED complement, all sharing the same syntactic head, in any surface
 * order and with any gap between them (`"se dio [finalmente] cuenta"`).
 * `cliticSurface` is matched on surface, not lemma — this model's Spanish
 * lemmatizer does not reliably lemmatise clitic pronouns, and the surface
 * form of a Spanish reflexive/object clitic is a closed, known set anyway.
 */
export type DiscontinuousMwuPattern = {
  readonly patternId: string;
  /** The exact phrase looked up against `MwuUnit.item`/`GrammarUnit.item` — never invented, only resolved. */
  readonly canonicalPhrase: string;
  readonly headLemma: string;
  readonly cliticSurface: string;
  readonly fixedLemma: string;
  readonly fixedDepRelations: readonly string[];
  readonly cliticDepRelations: readonly string[];
};

export const DISCONTINUOUS_MWU_TABLE: readonly DiscontinuousMwuPattern[] = [
  {
    patternId: "DARSE_CUENTA",
    canonicalPhrase: "darse cuenta",
    headLemma: "dar",
    cliticSurface: "se",
    fixedLemma: "cuenta",
    fixedDepRelations: ["obj", "iobj"],
    cliticDepRelations: ["expl:pv", "expl", "obj", "iobj"],
  },
];

export type DiscontinuousMwuMatch = {
  readonly patternId: string;
  readonly canonicalPhrase: string;
  readonly headToken: TokenAnalysis;
  readonly cliticToken: TokenAnalysis;
  readonly fixedToken: TokenAnalysis;
};

/** Find every `DISCONTINUOUS_MWU_TABLE` pattern realised in one sentence's tokens. */
export function detectDiscontinuousMwus(tokens: readonly TokenAnalysis[]): readonly DiscontinuousMwuMatch[] {
  const matches: DiscontinuousMwuMatch[] = [];
  for (const headToken of tokens) {
    for (const pattern of DISCONTINUOUS_MWU_TABLE) {
      if (headToken.lemma.toLowerCase() !== pattern.headLemma) continue;
      const cliticToken = tokens.find(
        (t) => t.headIndex === headToken.index && t.surface.toLowerCase() === pattern.cliticSurface && pattern.cliticDepRelations.includes(t.depRelation),
      );
      const fixedToken = tokens.find(
        (t) => t.headIndex === headToken.index && t.lemma.toLowerCase() === pattern.fixedLemma && pattern.fixedDepRelations.includes(t.depRelation),
      );
      if (cliticToken !== undefined && fixedToken !== undefined) {
        matches.push({ patternId: pattern.patternId, canonicalPhrase: pattern.canonicalPhrase, headToken, cliticToken, fixedToken });
      }
    }
  }
  return matches;
}

// ------------------------------------------------------- grammar constructions

/**
 * A productive grammatical construction: an ANCHOR token plus labelled SLOT
 * dependents. `llevar + DURATION + GERUND_PREDICATE`
 * (`"Lleva tres años estudiando español"`) is the one case the brief
 * requires; add a row (never inline logic) for another.
 */
export type ConstructionPattern = {
  readonly constructionId: string;
  readonly anchorLemma: string;
  readonly durationDepRelations: readonly string[];
  readonly gerundDepRelations: readonly string[];
};

export const CONSTRUCTION_TABLE: readonly ConstructionPattern[] = [
  {
    constructionId: "LLEVAR_DURATION_GERUND",
    anchorLemma: "llevar",
    durationDepRelations: ["obj", "nmod"],
    gerundDepRelations: ["advcl", "xcomp"],
  },
];

export type ConstructionMatch = {
  readonly constructionId: string;
  readonly anchorToken: TokenAnalysis;
  /** The duration noun phrase, ordered start-to-end (e.g. "tres" then "años"). */
  readonly durationTokens: readonly TokenAnalysis[];
  readonly gerundToken: TokenAnalysis;
};

function isGerund(token: TokenAnalysis): boolean {
  return (token.morphology ?? "").includes("VerbForm=Ger");
}

/** Find every `CONSTRUCTION_TABLE` pattern realised in one sentence's tokens. */
export function detectConstructions(tokens: readonly TokenAnalysis[]): readonly ConstructionMatch[] {
  const matches: ConstructionMatch[] = [];
  for (const anchorToken of tokens) {
    for (const pattern of CONSTRUCTION_TABLE) {
      if (anchorToken.lemma.toLowerCase() !== pattern.anchorLemma) continue;

      const durationHead = tokens.find((t) => t.headIndex === anchorToken.index && pattern.durationDepRelations.includes(t.depRelation) && t.pos === "NOUN");
      if (durationHead === undefined) continue;
      const durationModifiers = tokens.filter((t) => t.headIndex === durationHead.index && t.pos === "NUM");
      const durationTokens = [...durationModifiers, durationHead].sort((a, b) => a.start - b.start);

      const gerundToken = tokens.find((t) => t.headIndex === anchorToken.index && pattern.gerundDepRelations.includes(t.depRelation) && isGerund(t));
      if (gerundToken === undefined) continue;

      matches.push({ constructionId: pattern.constructionId, anchorToken, durationTokens, gerundToken });
    }
  }
  return matches;
}
