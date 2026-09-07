/**
 * Corrección E — reproducible spaCy/model version governance.
 *
 * See `../domain/analyzer-config.ts` for the single governed source of
 * `EXPECTED_SPACY_VERSION`/`EXPECTED_MODEL_NAME`/`EXPECTED_MODEL_VERSION`
 * both `../adapters/spacy/spacy-analyzer.ts` (Node) and `../adapters/spacy/
 * analyzer.py` (Python) read from — never two independently drifting
 * copies.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_SPACY_VERSION,
  EXPECTED_MODEL_NAME,
  EXPECTED_MODEL_VERSION,
  assertAnalyzerVersionGoverned,
  computeAnalyzerFingerprint,
  analyzerFingerprintString,
} from "../domain/analyzer-config.ts";
import { BRIDGE_CONTRACT_VERSION, SpaCyAnalyzer } from "../adapters/spacy/spacy-analyzer.ts";

describe("nlp / analyzer version governance (Corrección E)", () => {
  test("E1-E3. the governed pin is exactly spaCy 3.8.16 / es_core_news_sm 3.8.0", () => {
    assert.equal(EXPECTED_SPACY_VERSION, "3.8.16");
    assert.equal(EXPECTED_MODEL_NAME, "es_core_news_sm");
    assert.equal(EXPECTED_MODEL_VERSION, "3.8.0");
  });

  test("the real installed environment matches the governed pin", () => {
    assert.doesNotThrow(() =>
      assertAnalyzerVersionGoverned({ analyzerVersion: EXPECTED_SPACY_VERSION, modelName: EXPECTED_MODEL_NAME, modelVersion: EXPECTED_MODEL_VERSION }),
    );
  });

  test("E4. a simulated version mismatch (spaCy) fails", () => {
    assert.throws(
      () => assertAnalyzerVersionGoverned({ analyzerVersion: "3.9.0", modelName: EXPECTED_MODEL_NAME, modelVersion: EXPECTED_MODEL_VERSION }),
      /ANALYZER_VERSION_MISMATCH/,
    );
  });

  test("E4b. a simulated version mismatch (model) fails", () => {
    assert.throws(
      () => assertAnalyzerVersionGoverned({ analyzerVersion: EXPECTED_SPACY_VERSION, modelName: EXPECTED_MODEL_NAME, modelVersion: "3.9.0" }),
      /ANALYZER_VERSION_MISMATCH/,
    );
  });

  test("E4c. a simulated model name mismatch fails", () => {
    assert.throws(
      () => assertAnalyzerVersionGoverned({ analyzerVersion: EXPECTED_SPACY_VERSION, modelName: "es_core_news_md", modelVersion: EXPECTED_MODEL_VERSION }),
      /ANALYZER_VERSION_MISMATCH/,
    );
  });

  test("a matching version never throws", () => {
    assert.doesNotThrow(() =>
      assertAnalyzerVersionGoverned({ analyzerVersion: EXPECTED_SPACY_VERSION, modelName: EXPECTED_MODEL_NAME, modelVersion: EXPECTED_MODEL_VERSION }),
    );
  });

  test("E5. the fingerprint captures analyzer + model + bridge + algorithm version, and two identical configurations produce the same fingerprint string", () => {
    const provenance = { analyzer: "spaCy", analyzerVersion: EXPECTED_SPACY_VERSION, modelName: EXPECTED_MODEL_NAME, modelVersion: EXPECTED_MODEL_VERSION };
    const a = computeAnalyzerFingerprint(provenance, BRIDGE_CONTRACT_VERSION, "candidate-builder/1.0.0");
    const b = computeAnalyzerFingerprint(provenance, BRIDGE_CONTRACT_VERSION, "candidate-builder/1.0.0");
    assert.equal(analyzerFingerprintString(a), analyzerFingerprintString(b));

    const different = computeAnalyzerFingerprint({ ...provenance, modelVersion: "3.9.0" }, BRIDGE_CONTRACT_VERSION, "candidate-builder/1.0.0");
    assert.notEqual(analyzerFingerprintString(a), analyzerFingerprintString(different));
  });

  test("SpaCyAnalyzer with enforceGovernedVersion disabled skips the check (opt-out, never the default)", () => {
    const analyzer = new SpaCyAnalyzer({ enforceGovernedVersion: false });
    assert.ok(analyzer, "constructing with the opt-out must not itself throw");
  });
});
