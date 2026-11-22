/**
 * Resolution against the real committed A1 curriculum — "adiós" (LEX-A1-000015,
 * one published Sense) and "alemán" (homograph group HG-A1-0001,
 * LEX-A1-000029/LEX-A1-000030) are the same real published facts
 * `features/nlp/__tests__/lexical-resolution.test.ts` asserts against.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolvePersonalPracticeSurface } from "../engine/personal-practice-resolution.ts";

describe("personal practice / lexical resolution", () => {
  test("an unambiguous published word resolves to its Lexeme and Sense", async () => {
    const resolution = await resolvePersonalPracticeSurface("adiós");
    assert.equal(resolution.status, "RESOLVED");
    assert.equal(resolution.lexemeId, "LEX-A1-000015");
    assert.equal(resolution.senseId, "SENSE-A1-000015");
  });

  test("a homograph surface is AMBIGUOUS, never silently picked", async () => {
    const resolution = await resolvePersonalPracticeSurface("alemán");
    assert.equal(resolution.status, "AMBIGUOUS");
    assert.equal(resolution.lexemeId, null);
    assert.equal(resolution.senseId, null);
  });

  test("a word not in the published curriculum is UNRESOLVED but the caller keeps it", async () => {
    const resolution = await resolvePersonalPracticeSurface("zzqxwglorp");
    assert.equal(resolution.status, "UNRESOLVED");
    assert.equal(resolution.lexemeId, null);
    assert.equal(resolution.senseId, null);
  });

  test("a full phrase is UNRESOLVED — no MWU-splitting attempted here", async () => {
    const resolution = await resolvePersonalPracticeSurface("tener hambre");
    assert.equal(resolution.status, "UNRESOLVED");
  });

  test("resolving never mutates the shared Lexical Engine", async () => {
    const before = await resolvePersonalPracticeSurface("adiós");
    const after = await resolvePersonalPracticeSurface("adiós");
    assert.deepEqual(after, before);
  });
});
