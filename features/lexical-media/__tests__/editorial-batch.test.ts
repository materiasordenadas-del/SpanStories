/**
 * The 20-Sense editorial test batch (10 concrete nouns, 10 visualizable
 * verbs), curated from real Openverse/Wikimedia search results against the
 * real published A1 `senseId`s. Proves the registry resolves end to end for
 * actual curated data, not just synthetic fixtures.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadImageRegistry } from "../index.ts";

const EDITORIAL_BATCH_SENSE_IDS = [
  // 10 concrete nouns
  "SENSE-A1-000370", // mesa
  "SENSE-A1-000117", // casa
  "SENSE-A1-000141", // coche
  "SENSE-A1-000337", // libro
  "SENSE-A1-000097", // cama
  "SENSE-A1-000480", // puerta
  "SENSE-A1-000551", // teléfono
  "SENSE-A1-000149", // comida
  "SENSE-A1-000526", // silla
  "SENSE-A1-000585", // ventana
  // 10 visualizable verbs
  "SENSE-A1-000147", // comer
  "SENSE-A1-000070", // beber
  "SENSE-A1-000164", // correr
  "SENSE-A1-000333", // leer
  "SENSE-A1-000227", // escribir
  "SENSE-A1-000009", // abrir
  "SENSE-A1-000131", // cerrar
  "SENSE-A1-000285", // hablar
  "SENSE-A1-000393", // nadar
  "SENSE-A1-000059", // bailar
];

describe("lexical-media / editorial batch (20 real A1 Senses)", () => {
  const registry = loadImageRegistry();

  for (const senseId of EDITORIAL_BATCH_SENSE_IDS) {
    test(`${senseId} resolves to an APPROVED candidate with complete attribution`, () => {
      const resolved = registry.resolveImageForSense(senseId);
      assert.notEqual(resolved, null, `expected an approved image for ${senseId}`);
      assert.equal(resolved?.status, "APPROVED");
      assert.equal(resolved?.provider, "wikimedia");
      assert.ok(resolved && resolved.providerAssetId.startsWith("File:"));
      assert.ok(resolved && resolved.creator.trim().length > 0);
      assert.ok(resolved && resolved.license.trim().length > 0);
      assert.ok(resolved && resolved.licenseUrl.startsWith("http"));
      assert.ok(resolved && resolved.altText.trim().length > 0);
    });
  }

  test("all 20 batch senseIds are distinct", () => {
    assert.equal(new Set(EDITORIAL_BATCH_SENSE_IDS).size, EDITORIAL_BATCH_SENSE_IDS.length);
  });
});
