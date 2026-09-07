/**
 * `NlpAnalyzer` — the one seam this feature's domain depends on for
 * linguistic analysis. §24: the domain must be substitutable onto another
 * analyzer without a redesign; `../adapters/spacy/spacy-analyzer.ts` and
 * `../adapters/fake/fake-analyzer.ts` are its two implementations, and
 * `../engine/candidate-builder.ts` imports neither directly.
 */

import type { NlpAnalysis } from "../domain/analysis.ts";

export type AnalyzerSentenceInput = {
  readonly sentenceIndex: number;
  readonly text: string;
};

export interface NlpAnalyzer {
  analyze(sentences: readonly AnalyzerSentenceInput[]): Promise<NlpAnalysis>;
}
