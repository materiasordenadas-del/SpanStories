/**
 * A deterministic `NlpAnalyzer` for contract/unit tests — no subprocess, no
 * model. §42: "mocks/fakes sirven para contract tests" but Fase 6 cannot be
 * declared complete using only this; see `../spacy/spacy-analyzer.ts` and
 * `../../__tests__/spacy-integration.test.ts` for the real adapter.
 *
 * Fixed by exact sentence text, not by a real tokenizer/parser — the caller
 * supplies the `SentenceAnalysis` a real analyzer *would* have produced for
 * each sentence it expects to see, so tests can exercise
 * `../../engine/candidate-builder.ts`'s logic against exact, hand-specified
 * dependency structures (the difficult Spanish cases in particular) without
 * depending on any particular model's actual output.
 */

import type { AnalyzerProvenance } from "../../domain/provenance.ts";
import type { NlpAnalysis, SentenceAnalysis } from "../../domain/analysis.ts";
import type { AnalyzerSentenceInput, NlpAnalyzer } from "../analyzer.ts";

export const FAKE_ANALYZER_VERSION = "1.0.0";
export const FAKE_ALGORITHM_VERSION = "nlp-candidate-builder/1.0.0";

export class FakeAnalyzer implements NlpAnalyzer {
  private readonly byText: ReadonlyMap<string, SentenceAnalysis>;
  private readonly now: () => Date;

  constructor(sentenceAnalyses: readonly SentenceAnalysis[], now: () => Date = () => new Date("2026-01-01T00:00:00.000Z")) {
    this.byText = new Map(sentenceAnalyses.map((s) => [s.text, s]));
    this.now = now;
  }

  async analyze(sentences: readonly AnalyzerSentenceInput[]): Promise<NlpAnalysis> {
    const provenance: AnalyzerProvenance = {
      analyzer: "fake",
      analyzerVersion: FAKE_ANALYZER_VERSION,
      modelName: null,
      modelVersion: null,
      algorithmVersion: FAKE_ALGORITHM_VERSION,
      createdAt: this.now().toISOString(),
    };
    const resolved: SentenceAnalysis[] = [];
    for (const input of sentences) {
      const fixed = this.byText.get(input.text);
      resolved.push(fixed !== undefined ? { ...fixed, sentenceIndex: input.sentenceIndex } : { sentenceIndex: input.sentenceIndex, text: input.text, tokens: [] });
    }
    return { sentences: resolved, provenance };
  }
}
