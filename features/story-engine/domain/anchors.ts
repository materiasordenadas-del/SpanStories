/**
 * `TextAnchor` offset contract.
 *
 * Offsets are **Unicode code point indices**, not UTF-16 code units. JavaScript
 * strings are UTF-16 under the hood, so `"a".length` and `[..."a"].length`
 * disagree for any character outside the Basic Multilingual Plane (an astral
 * character such as an emoji occupies one code point but two UTF-16 units).
 * Every Spanish letter this curriculum uses (including "ñ", "á", "¿", "¡") is
 * in the BMP and would work either way, but Phase 6 hands these offsets to
 * Python, where `str` is already indexed by code point. Choosing code points
 * here — instead of "whatever `.slice()` happens to do" — is what makes an
 * anchor mean the same interval on both sides of that language boundary.
 *
 * Intervals are half-open: `[start, end)`. `start === end` is empty and
 * rejected — an anchor always names a non-empty fragment.
 */

export type AnchorBounds = {
  readonly start: number;
  readonly end: number;
};

/** Split a string into its Unicode code points. `Array.from` already does
 *  this correctly (it iterates by code point, pairing surrogates), but naming
 *  the operation keeps every caller here honest about which unit is in play. */
function codePoints(text: string): string[] {
  return Array.from(text);
}

export function codePointLength(text: string): number {
  return codePoints(text).length;
}

export type AnchorValidation =
  | { readonly status: "VALID" }
  | { readonly status: "OUT_OF_BOUNDS" }
  | { readonly status: "EMPTY_OR_INVERTED" };

export function validateAnchorBounds(text: string, bounds: AnchorBounds): AnchorValidation {
  if (bounds.end <= bounds.start) return { status: "EMPTY_OR_INVERTED" };
  const length = codePointLength(text);
  if (bounds.start < 0 || bounds.end > length) return { status: "OUT_OF_BOUNDS" };
  return { status: "VALID" };
}

/**
 * Resolve the exact surface fragment `[start, end)` names within `text`.
 *
 * Throws if the bounds are invalid; callers on a publish path should validate
 * first (`validateAnchorBounds`) and turn a bad result into a reported issue
 * rather than letting this throw reach them.
 */
export function resolveAnchorText(text: string, bounds: AnchorBounds): string {
  const validation = validateAnchorBounds(text, bounds);
  if (validation.status !== "VALID") {
    throw new RangeError(
      `TEXT_ANCHOR_INVALID: [${bounds.start}, ${bounds.end}) is ${validation.status} for text of length ${codePointLength(text)}`,
    );
  }
  return codePoints(text).slice(bounds.start, bounds.end).join("");
}

/** Two intervals on the same sentence overlap iff they share a code point. */
export function boundsOverlap(a: AnchorBounds, b: AnchorBounds): boolean {
  return a.start < b.end && b.start < a.end;
}
