/**
 * Provenance every `AnnotationCandidate` and `NlpAnalysis` carries, so the
 * system can answer "¿por qué apareció esta propuesta?" after the fact
 * (`docs/nlp-annotation-assistant.md` §"Provenance"). Nothing here is
 * optional-and-usually-absent: an analyzer that cannot report its own
 * version has no business producing candidates.
 */

export type AnalyzerProvenance = {
  readonly analyzer: string;
  readonly analyzerVersion: string;
  readonly modelName: string | null;
  readonly modelVersion: string | null;
  /** This feature's own candidate-generation logic version — independent of
   *  the analyzer/model versions, bumped when `../engine/*` rules change. */
  readonly algorithmVersion: string;
  readonly createdAt: string;
};
