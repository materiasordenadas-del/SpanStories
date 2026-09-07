import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  boundsOverlap,
  codePointLength,
  resolveAnchorText,
  validateAnchorBounds,
} from "../domain/anchors.ts";

describe("story engine / text anchors", () => {
  test("[start, end) recovers the exact substring", () => {
    const text = "Ayer Marta fue al mercado.";
    assert.equal(resolveAnchorText(text, { start: 5, end: 10 }), "Marta");
    assert.equal(resolveAnchorText(text, { start: 0, end: 4 }), "Ayer");
  });

  test("half-open: end is exclusive, start === end is empty and invalid", () => {
    const text = "hola";
    assert.equal(resolveAnchorText(text, { start: 0, end: 1 }), "h");
    assert.equal(validateAnchorBounds(text, { start: 2, end: 2 }).status, "EMPTY_OR_INVERTED");
    assert.equal(validateAnchorBounds(text, { start: 3, end: 1 }).status, "EMPTY_OR_INVERTED");
  });

  test("an anchor past the end of the text is out of bounds", () => {
    const text = "corto";
    assert.equal(validateAnchorBounds(text, { start: 0, end: 999 }).status, "OUT_OF_BOUNDS");
    assert.equal(validateAnchorBounds(text, { start: -1, end: 2 }).status, "OUT_OF_BOUNDS");
  });

  test("a valid anchor at the exact bounds of the text is VALID", () => {
    const text = "hola";
    assert.equal(validateAnchorBounds(text, { start: 0, end: 4 }).status, "VALID");
  });

  test("resolveAnchorText throws on invalid bounds rather than returning a wrong fragment", () => {
    assert.throws(() => resolveAnchorText("hola", { start: 0, end: 999 }), /TEXT_ANCHOR_INVALID/);
  });

  test("offsets are Unicode code points, not UTF-16 code units", () => {
    // "🎉" is one code point but two UTF-16 units; ".length" would disagree.
    const text = "Hoy hay fiesta 🎉 en la isla.";
    assert.notEqual(text.length, codePointLength(text));
    const start = codePointLength("Hoy hay fiesta ");
    assert.equal(resolveAnchorText(text, { start, end: start + 1 }), "🎉");
  });

  test("non-ASCII Spanish characters round-trip exactly", () => {
    const text = "¿Ñoño puede ir a España?";
    const codePoints = Array.from(text);
    const wordStart = codePoints.indexOf("Ñ");
    assert.equal(resolveAnchorText(text, { start: wordStart, end: wordStart + 4 }), "Ñoño");
    const espanaStart = codePoints.indexOf("E");
    assert.equal(resolveAnchorText(text, { start: espanaStart, end: espanaStart + 6 }), "España");
  });

  test("two intervals overlap iff they share a code point", () => {
    assert.equal(boundsOverlap({ start: 0, end: 3 }, { start: 3, end: 6 }), false);
    assert.equal(boundsOverlap({ start: 0, end: 4 }, { start: 3, end: 6 }), true);
    assert.equal(boundsOverlap({ start: 0, end: 2 }, { start: 5, end: 8 }), false);
  });
});
