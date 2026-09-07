/**
 * `NlpAnalysis` — the raw, un-opinionated output of running an analyzer
 * (`../adapters/analyzer.ts`'s `NlpAnalyzer` port) over one `StoryVersion`'s
 * sentences. This is deliberately *not* candidate-shaped yet: a
 * `TokenAnalysis` is one linguistic observation (surface, lemma, POS,
 * morphology, dependency), not a claim about a `Lexeme`, `Sense` or
 * curriculum target — that resolution happens in `../engine/*`, against the
 * canonical registries, never inside the analyzer itself.
 *
 * `start`/`end` are **Unicode code point offsets**, half-open `[start, end)`,
 * into the exact `text` of the `StorySentence` the token belongs to — the
 * same contract `features/story-engine/domain/anchors.ts` documents for
 * `TextAnchor`. Python's `str` is already code-point indexed, so the bridge
 * (`../adapters/spacy/analyzer.py`) needs no conversion to produce this; the
 * Node side must resolve/compare these offsets with
 * `codePointLength`/`resolveAnchorText` from `features/story-engine`, never
 * with raw `.slice()`/`.length` (UTF-16 code units) — see
 * `../__tests__/offsets.test.ts`.
 */

import type { AnalyzerProvenance } from "./provenance.ts";

export type TokenAnalysis = {
  /** 0-based position among this sentence's tokens, as the analyzer segmented them. */
  readonly index: number;
  readonly surface: string;
  readonly start: number;
  readonly end: number;
  readonly lemma: string;
  /** Universal POS tag (spaCy's `pos_`), e.g. "VERB", "NOUN", "ADP". */
  readonly pos: string;
  /** Fine-grained, analyzer/model-specific tag (spaCy's `tag_`). */
  readonly tag: string;
  /** Raw morphological feature string (e.g. "Case=Acc|Person=3|Reflex=Yes"), or `null`. */
  readonly morphology: string | null;
  /** Dependency relation to `headIndex` (spaCy's `dep_`), e.g. "nsubj", "obj", "expl:pv". */
  readonly depRelation: string;
  /** Index (within this sentence) of the syntactic head token; equals `index` for the root. */
  readonly headIndex: number;
};

export type SentenceAnalysis = {
  /** Position among the `StoryVersion`'s sentences the analyzer was given, matched back
   *  by `../engine/candidate-builder.ts` against real `StorySentence`s by exact text. */
  readonly sentenceIndex: number;
  /** The exact sentence text the analyzer actually processed — must equal the
   *  corresponding `StorySentence.text` byte-for-byte, checked before any candidate
   *  is trusted (a mismatch means the analysis was computed over stale content). */
  readonly text: string;
  readonly tokens: readonly TokenAnalysis[];
};

export type NlpAnalysis = {
  readonly sentences: readonly SentenceAnalysis[];
  readonly provenance: AnalyzerProvenance;
};
