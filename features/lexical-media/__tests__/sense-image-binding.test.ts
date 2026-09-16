import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { validateBinding, type SenseImageBinding } from "../domain/sense-image-binding.ts";
import { codesOf } from "./fixtures.ts";

const validCandidate = {
  rank: 1,
  provider: "openverse" as const,
  providerAssetId: "3f1a9c2e-openverse-uuid",
  remoteImageUrl: "https://example.org/full.jpg",
  thumbnailUrl: "https://example.org/thumb.jpg",
  sourcePageUrl: "https://example.org/page",
  creator: "Jane Doe",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  altText: "un gato blanco durmiendo",
  status: "APPROVED" as const,
  validatedAt: "2026-01-01",
};

describe("lexical-media / sense-image-binding", () => {
  test("a well-formed single-candidate binding passes", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [validCandidate],
    };
    assert.deepEqual(validateBinding(binding), []);
  });

  test("rejects a senseId that does not match SENSE-A1-NNNNNN", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-123",
      candidates: [validCandidate],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_ID_PATTERN_INVALID"));
  });

  test("rejects an empty candidate list", () => {
    const binding: SenseImageBinding = { senseId: "SENSE-A1-000123", candidates: [] };
    const issues = validateBinding(binding);
    assert.deepEqual(codesOf(issues), ["MEDIA_BINDING_EMPTY"]);
  });

  test("rejects duplicate ranks", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [validCandidate, { ...validCandidate, status: "FALLBACK" }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_DUPLICATE_RANK"));
  });

  test("rejects a blank attribution field", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [{ ...validCandidate, creator: "   " }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_ATTRIBUTION_INCOMPLETE"));
  });

  test("rejects a non-positive rank", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [{ ...validCandidate, rank: 0 }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_RANK_INVALID"));
  });

  test("rejects a blank providerAssetId", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [{ ...validCandidate, providerAssetId: "  " }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_PROVIDER_ASSET_ID_INVALID"));
  });

  test("rejects a providerAssetId that is actually a URL", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [{ ...validCandidate, providerAssetId: "https://example.org/full.jpg" }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_PROVIDER_ASSET_ID_INVALID"));
  });

  test("rejects a rank gap (1, 3) even without duplicates", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [validCandidate, { ...validCandidate, rank: 3, status: "FALLBACK" }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_RANK_SEQUENCE_INVALID"));
  });

  test("rejects a malformed URL field", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [{ ...validCandidate, remoteImageUrl: "not-a-url" }],
    };
    const issues = validateBinding(binding);
    assert.ok(codesOf(issues).includes("MEDIA_URL_INVALID"));
  });

  test("accepts a Commons-style File: title as providerAssetId", () => {
    const binding: SenseImageBinding = {
      senseId: "SENSE-A1-000123",
      candidates: [
        { ...validCandidate, provider: "wikimedia", providerAssetId: "File:Example_cat.jpg" },
      ],
    };
    assert.deepEqual(validateBinding(binding), []);
  });
});
