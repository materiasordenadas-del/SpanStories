/**
 * Orchestrates `NlpAnalysis` + a `StoryVersion`'s real sentences + the
 * canonical registries into `AnnotationCandidate[]`.
 *
 * Determinism (§39): given the same `NlpAnalysis` (itself deterministic for
 * a fixed analyzer/model/config — see `../adapters/spacy/spacy-analyzer.ts`),
 * the same registries and the same `IdGenerator` sequence, this function
 * produces the same candidates every time — nothing here calls
 * `Date.now()`/`crypto.randomUUID()` directly (`../domain/ports.ts`).
 *
 * Never resolves a `Sense` or a target automatically: `proposedSenseId` is
 * always `null` here (a `SenseCandidateEntry` list is attached instead, even
 * when there is only one candidate) and a candidate's `status` is
 * `REVIEW_REQUIRED` whenever a tier of `resolveLexicalCandidates` returns
 * more than one candidate or nothing at all — `confidence` is recorded when
 * an analyzer step reports one, but it never *decides* `status` (§40).
 */

import type { CurriculumRegistry } from "../../curriculum/index.ts";
import type { LexicalEngine } from "../../lexical-engine/index.ts";
import type { StorySentence, StoryVersionId } from "../../story-engine/index.ts";
import { asId } from "../domain/ids.ts";
import type { NlpAnalysis, TokenAnalysis } from "../domain/analysis.ts";
import type { AnnotationCandidate, CandidatePart } from "../domain/candidate.ts";
import type { Clock, IdGenerator } from "../domain/ports.ts";
import { resolveLexicalCandidates, senseCandidatesFor } from "./lexical-resolution.ts";
import { resolveMwuTargetByPhrase } from "./mwu-candidates.ts";
import { detectConstructions, detectDiscontinuousMwus, detectFusedCliticSplit } from "./construction-rules.ts";

export type CandidateBuildContext = {
  readonly storyVersionId: StoryVersionId;
  readonly sentences: readonly StorySentence[];
  readonly registry: CurriculumRegistry;
  readonly lexicalEngine: LexicalEngine;
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly algorithmVersion: string;
};

const PUNCT_LIKE = new Set(["PUNCT", "SPACE", "SYM"]);

function newCandidateId(idGenerator: IdGenerator) {
  return asId("AnnotationCandidateId", idGenerator.next("AnnotationCandidateId"));
}

function baseFields(ctx: CandidateBuildContext, analysis: NlpAnalysis) {
  return {
    storyVersionId: ctx.storyVersionId,
    sourceAdapter: analysis.provenance.analyzer,
    algorithmVersion: ctx.algorithmVersion,
    provenance: analysis.provenance,
    curriculumReleaseId: ctx.curriculumReleaseId,
    lexiconReleaseId: ctx.lexiconReleaseId,
  };
}

function lexicalFieldsFor(ctx: CandidateBuildContext, surface: string, lemma: string) {
  const resolution = resolveLexicalCandidates(ctx.lexicalEngine, { surface, lemma });
  let proposedLexemeId: string | null = null;
  let proposedFormId: string | null = null;
  if (resolution.tier === "PUBLISHED_FORM" && resolution.matches.length === 1) {
    proposedLexemeId = resolution.matches[0].lexemeId;
    proposedFormId = resolution.matches[0].lexemeFormId;
  } else if (
    (resolution.tier === "LEXEME_CANDIDATES" || resolution.tier === "CANONICAL_FORM_CANDIDATES") &&
    resolution.lexemeIds.length === 1
  ) {
    proposedLexemeId = resolution.lexemeIds[0];
  }
  const isAmbiguous = resolution.tier === "PUBLISHED_FORM" ? resolution.matches.length > 1 : resolution.tier !== "UNRESOLVED" && resolution.lexemeIds.length > 1;
  const senseCandidates = proposedLexemeId !== null ? senseCandidatesFor(ctx.lexicalEngine, proposedLexemeId) : [];
  const status = resolution.tier === "UNRESOLVED" || isAmbiguous ? ("REVIEW_REQUIRED" as const) : ("CANDIDATE" as const);
  return { resolution, proposedLexemeId, proposedFormId, senseCandidates, status };
}

/** Build every candidate this feature can propose for one already-real sentence + its analysis. */
function buildForSentence(ctx: CandidateBuildContext, analysis: NlpAnalysis, sentence: StorySentence, tokens: readonly TokenAnalysis[]): AnnotationCandidate[] {
  const candidates: AnnotationCandidate[] = [];
  const consumed = new Set<number>();
  const base = baseFields(ctx, analysis);

  // 1. Fused clitic splits ("vete" -> HEAD "ve" + CLITIC "te").
  for (const token of tokens) {
    const split = detectFusedCliticSplit(token.surface);
    if (split === null) continue;
    consumed.add(token.index);
    const headEnd = token.start + [...split.head].length;
    const parts: CandidatePart[] = [
      { sentenceId: sentence.id, start: token.start, end: headEnd, role: "HEAD", slotLabel: null },
      { sentenceId: sentence.id, start: headEnd, end: token.end, role: "CLITIC", slotLabel: null },
    ];
    const lex = lexicalFieldsFor(ctx, split.head, split.headLemma);
    candidates.push({
      ...base,
      candidateId: newCandidateId(ctx.idGenerator),
      sentenceId: sentence.id,
      candidateType: "LEXICAL",
      parts,
      proposedLexemeId: lex.proposedLexemeId as never,
      proposedSenseId: null,
      proposedFormId: lex.proposedFormId as never,
      proposedGrammarTargetId: null,
      proposedMwuTargetId: null,
      lexicalResolution: lex.resolution,
      senseCandidates: lex.senseCandidates as never,
      constructionId: null,
      confidence: null,
      evidence: `fused clitic split: "${token.surface}" -> "${split.head}" + "${split.clitic}" (governed table match)`,
      status: lex.status,
    });
  }

  // 2. Discontinuous lexical MWU patterns ("se dio [finalmente] cuenta").
  for (const match of detectDiscontinuousMwus(tokens)) {
    if ([match.headToken.index, match.cliticToken.index, match.fixedToken.index].some((i) => consumed.has(i))) continue;
    for (const i of [match.headToken.index, match.cliticToken.index, match.fixedToken.index]) consumed.add(i);

    const resolved = resolveMwuTargetByPhrase(ctx.registry, match.canonicalPhrase);
    const hasLexicalIdentityForParts = resolved !== null && resolved.lexemeId !== null;
    const parts: CandidatePart[] = [match.cliticToken, match.headToken, match.fixedToken]
      .sort((a, b) => a.start - b.start)
      .map((t) => {
        if (hasLexicalIdentityForParts) {
          // LEXICAL shape: HEAD/FIXED/CLITIC (Story Engine's LEXICAL_PART_ROLES).
          const role = t === match.cliticToken ? "CLITIC" : t === match.headToken ? "HEAD" : "FIXED";
          return { sentenceId: sentence.id, start: t.start, end: t.end, role, slotLabel: null };
        }
        // CONSTRUCTION shape: the head verb is the pattern's ANCHOR (required —
        // createConstructionOccurrence rejects a construction with no ANCHOR
        // part); the clitic and fixed complement become labelled SLOTs
        // (Story Engine's CONSTRUCTION_PART_ROLES has no CLITIC/FIXED role).
        if (t === match.headToken) return { sentenceId: sentence.id, start: t.start, end: t.end, role: "ANCHOR", slotLabel: null };
        const slotLabel = t === match.cliticToken ? "CLITIC" : "FIXED";
        return { sentenceId: sentence.id, start: t.start, end: t.end, role: "SLOT", slotLabel };
      });

    const hasLexicalIdentity = resolved !== null && resolved.lexemeId !== null;
    candidates.push({
      ...base,
      candidateId: newCandidateId(ctx.idGenerator),
      sentenceId: sentence.id,
      candidateType: hasLexicalIdentity ? "LEXICAL" : "CONSTRUCTION",
      parts,
      proposedLexemeId: (hasLexicalIdentity ? resolved!.lexemeId : null) as never,
      proposedSenseId: null,
      proposedFormId: null,
      proposedGrammarTargetId: null,
      proposedMwuTargetId: resolved !== null ? (resolved.targetId as never) : null,
      lexicalResolution: hasLexicalIdentity
        ? { tier: "LEXEME_CANDIDATES", lexemeIds: [resolved!.lexemeId as never] }
        : null,
      senseCandidates: hasLexicalIdentity ? (senseCandidatesFor(ctx.lexicalEngine, resolved!.lexemeId as string) as never) : [],
      constructionId: hasLexicalIdentity ? null : `MWU_${match.patternId}`,
      confidence: null,
      evidence: `discontinuous pattern ${match.patternId}: CLITIC "${match.cliticToken.surface}" + HEAD "${match.headToken.surface}" + FIXED "${match.fixedToken.surface}"${resolved === null ? " (UNRESOLVED_CANDIDATE: registry publishes no target for this phrase)" : ""}`,
      status: resolved === null ? "REVIEW_REQUIRED" : "CANDIDATE",
    });
  }

  // 3. Grammar/MWU constructions (`llevar + DURATION + GERUND_PREDICATE`).
  for (const match of detectConstructions(tokens)) {
    const involved = [match.anchorToken.index, match.gerundToken.index, ...match.durationTokens.map((t) => t.index)];
    if (involved.some((i) => consumed.has(i))) continue;
    for (const i of involved) consumed.add(i);

    const grammarTargetId = resolveGrammarTargetForConstruction(ctx.registry, match.constructionId);
    const durationStart = match.durationTokens[0].start;
    const durationEnd = match.durationTokens[match.durationTokens.length - 1].end;
    const parts: CandidatePart[] = [
      { sentenceId: sentence.id, start: match.anchorToken.start, end: match.anchorToken.end, role: "ANCHOR", slotLabel: null },
      { sentenceId: sentence.id, start: durationStart, end: durationEnd, role: "SLOT", slotLabel: "DURATION" },
      { sentenceId: sentence.id, start: match.gerundToken.start, end: match.gerundToken.end, role: "SLOT", slotLabel: "GERUND_PREDICATE" },
    ];
    candidates.push({
      ...base,
      candidateId: newCandidateId(ctx.idGenerator),
      sentenceId: sentence.id,
      candidateType: "CONSTRUCTION",
      parts,
      proposedLexemeId: null,
      proposedSenseId: null,
      proposedFormId: null,
      proposedGrammarTargetId: grammarTargetId as never,
      proposedMwuTargetId: null,
      lexicalResolution: null,
      senseCandidates: [],
      constructionId: match.constructionId,
      confidence: null,
      evidence: `construction ${match.constructionId}: ANCHOR "${match.anchorToken.surface}", DURATION "${match.durationTokens.map((t) => t.surface).join(" ")}", GERUND_PREDICATE "${match.gerundToken.surface}"${grammarTargetId === null ? " (UNRESOLVED_CANDIDATE: registry publishes no grammar target for this construction)" : ""}`,
      status: grammarTargetId === null ? "REVIEW_REQUIRED" : "CANDIDATE",
    });
  }

  // 4. Plain single-token LEXICAL candidates for everything else content-bearing.
  for (const token of tokens) {
    if (consumed.has(token.index) || PUNCT_LIKE.has(token.pos)) continue;
    const lex = lexicalFieldsFor(ctx, token.surface, token.lemma);
    candidates.push({
      ...base,
      candidateId: newCandidateId(ctx.idGenerator),
      sentenceId: sentence.id,
      candidateType: "LEXICAL",
      parts: [{ sentenceId: sentence.id, start: token.start, end: token.end, role: "HEAD", slotLabel: null }],
      proposedLexemeId: lex.proposedLexemeId as never,
      proposedSenseId: null,
      proposedFormId: lex.proposedFormId as never,
      proposedGrammarTargetId: null,
      proposedMwuTargetId: null,
      lexicalResolution: lex.resolution,
      senseCandidates: lex.senseCandidates as never,
      constructionId: null,
      confidence: null,
      evidence: `token "${token.surface}" (lemma "${token.lemma}", ${token.pos}) resolved at tier ${lex.resolution.tier}`,
      status: lex.status,
    });
  }

  return candidates;
}

function resolveGrammarTargetForConstruction(registry: CurriculumRegistry, constructionId: string): string | null {
  // A construction's canonical curricular label is not the same string as
  // its technical constructionId (§27: "1 NLP token != 1 Lexeme", and the
  // same non-identity holds for constructions vs. GrammarUnit labels) — this
  // feature never guesses a mapping; it only resolves what the registry
  // itself publishes an exact item for, which real A1 content may or may not do.
  return registry.data.grammarUnits.find((g) => g.item.toUpperCase() === constructionId)?.id ?? null;
}

/**
 * Match `analysis.sentences` to `ctx.sentences` positionally and by exact
 * text; a sentence whose text no longer matches is silently skipped (its
 * analysis is stale — see `../domain/analysis.ts`), never trusted.
 */
export function buildAnnotationCandidates(ctx: CandidateBuildContext, analysis: NlpAnalysis): readonly AnnotationCandidate[] {
  const candidates: AnnotationCandidate[] = [];
  for (const sentenceAnalysis of analysis.sentences) {
    const sentence = ctx.sentences[sentenceAnalysis.sentenceIndex];
    if (sentence === undefined || sentence.text !== sentenceAnalysis.text) continue;
    candidates.push(...buildForSentence(ctx, analysis, sentence, sentenceAnalysis.tokens));
  }
  return candidates;
}
