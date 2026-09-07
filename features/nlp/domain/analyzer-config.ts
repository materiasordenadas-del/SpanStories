/**
 * Corrección E — the single governed identity of "the spaCy analyzer
 * configuration this codebase is built and tested against."
 *
 * `pin spacy==3.8.16` in `../adapters/spacy/requirements.txt` fixes the
 * Python package, but nothing previously fixed the *model* package version
 * (`es_core_news_sm`) as a reproducible dependency, and recording
 * `modelVersion` in candidate provenance after the fact does not stop the
 * runtime from silently analyzing under a different model than the one this
 * codebase's tests were written against. This module is the one place both
 * sides of the Node<->Python bridge read these values from — Node imports
 * this file directly; Python receives the same values over stdin
 * (`../adapters/spacy/spacy-analyzer.ts` puts them in every request) rather
 * than hardcoding its own possibly-drifting copy in `analyzer.py`.
 *
 * Bumping any of these is a deliberate, reviewed change — update the
 * constant, `../adapters/spacy/requirements.txt`, and the version-pin tests
 * in `../__tests__/analyzer-version.test.ts` together, never one alone.
 */

import { NlpError, nlpIssue } from "./errors.ts";

export const EXPECTED_SPACY_VERSION = "3.8.16";
export const EXPECTED_MODEL_NAME = "es_core_news_sm";
export const EXPECTED_MODEL_VERSION = "3.8.0";

/**
 * Identifies the exact combination of analyzer/model/bridge/algorithm that
 * produced a candidate — every `AnnotationCandidate.provenance`
 * (`./provenance.ts`) can be reduced to one of these, and two candidates
 * with the same fingerprint were produced by a bit-for-bit reproducible
 * configuration (`docs/nlp-annotation-assistant.md` §39's determinism claim,
 * extended to cover the runtime dependency, not just this codebase's own
 * logic).
 */
export type AnalyzerFingerprint = {
  readonly analyzer: string;
  readonly analyzerVersion: string;
  readonly modelName: string | null;
  readonly modelVersion: string | null;
  readonly bridgeContractVersion: string;
  readonly candidateBuilderAlgorithmVersion: string;
};

export function analyzerFingerprintString(fp: AnalyzerFingerprint): string {
  return [fp.analyzer, fp.analyzerVersion, fp.modelName ?? "-", fp.modelVersion ?? "-", fp.bridgeContractVersion, fp.candidateBuilderAlgorithmVersion].join(
    "|",
  );
}

/**
 * Builds the fingerprint for one `NlpAnalysis`'s provenance plus whatever
 * candidate-builder `algorithmVersion` a caller is about to stamp its
 * `AnnotationCandidate`s with (`../engine/candidate-builder.ts`'s
 * `CandidateBuildContext.algorithmVersion` — this feature has never fixed
 * that to one constant, since a synthetic-registry test fixture and the
 * real production wiring legitimately use different values; the fingerprint
 * simply records whichever one actually ran).
 */
export function computeAnalyzerFingerprint(
  provenance: { readonly analyzer: string; readonly analyzerVersion: string; readonly modelName: string | null; readonly modelVersion: string | null },
  bridgeContractVersion: string,
  candidateBuilderAlgorithmVersion: string,
): AnalyzerFingerprint {
  return {
    analyzer: provenance.analyzer,
    analyzerVersion: provenance.analyzerVersion,
    modelName: provenance.modelName,
    modelVersion: provenance.modelVersion,
    bridgeContractVersion,
    candidateBuilderAlgorithmVersion,
  };
}

/**
 * Corrección E §31 — never run silently under a different analyzer/model
 * version than the governed one. Compares only what the caller supplies
 * (Node checks `analyzerVersion`/`modelName`/`modelVersion` against the
 * governed constants above; `expected`/`actual` are passed in rather than
 * hardcoded here so this same check is usable both for the real bridge
 * output and for a fabricated mismatch in a unit test). Throws `NlpError`
 * carrying `ANALYZER_VERSION_MISMATCH` — same typed-issue convention as
 * every other domain error in this feature (`./errors.ts`).
 */
export function assertAnalyzerVersionGoverned(actual: {
  readonly analyzerVersion: string;
  readonly modelName: string | null;
  readonly modelVersion: string | null;
}): void {
  const mismatches: string[] = [];
  if (actual.analyzerVersion !== EXPECTED_SPACY_VERSION) {
    mismatches.push(`spaCy ${actual.analyzerVersion} (expected ${EXPECTED_SPACY_VERSION})`);
  }
  if (actual.modelName !== EXPECTED_MODEL_NAME) {
    mismatches.push(`model ${actual.modelName ?? "null"} (expected ${EXPECTED_MODEL_NAME})`);
  }
  if (actual.modelVersion !== EXPECTED_MODEL_VERSION) {
    mismatches.push(`model version ${actual.modelVersion ?? "null"} (expected ${EXPECTED_MODEL_VERSION})`);
  }
  if (mismatches.length > 0) {
    throw new NlpError([nlpIssue("ANALYZER_VERSION_MISMATCH", mismatches.join(", "))]);
  }
}
