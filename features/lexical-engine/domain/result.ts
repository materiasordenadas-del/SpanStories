/**
 * Result shapes for lexical lookups.
 *
 * Phase 1 established that an unknown id and a known id with nothing attached
 * are different answers, never both `undefined`. Phase 2 keeps that rule and
 * adds one case the curriculum layer had no reason to model: a published MWU
 * that deliberately carries no lexeme identity.
 *
 *   unknown id                       -> NOT_FOUND
 *   known id, nothing attached       -> FOUND with an empty collection
 *   known MWU, no lexeme by decision -> NO_LEXICAL_IDENTITY
 *
 * The third case is a curricular fact about 170 of the 214 published MWUs, not
 * missing data, so it must not collapse into either of the other two.
 */

export type LexicalResult<T> =
  | { readonly status: "FOUND"; readonly value: T }
  | { readonly status: "NOT_FOUND"; readonly id: string };

/**
 * Outcome of asking a MWU for its lexeme identity.
 *
 * `NO_LEXICAL_IDENTITY` is a terminal, successful answer: the unit exists and
 * the curriculum has decided it is not a Lexeme. Callers must never react to it
 * by minting one.
 */
export type MwuIdentityResult<T> =
  | { readonly status: "FOUND"; readonly value: T }
  | { readonly status: "NO_LEXICAL_IDENTITY"; readonly mwuId: string }
  | { readonly status: "NOT_FOUND"; readonly id: string };

export function found<T>(value: T): LexicalResult<T> {
  return { status: "FOUND", value };
}

export function notFound<T>(id: string): LexicalResult<T> {
  return { status: "NOT_FOUND", id };
}

/** Narrowing helper so callers can read a value without re-checking the tag. */
export function isFound<T>(
  result: LexicalResult<T> | MwuIdentityResult<T>,
): result is { readonly status: "FOUND"; readonly value: T } {
  return result.status === "FOUND";
}

/**
 * Unwrap a result or throw. For call sites that have already proved the id
 * exists (tests, invariants); never for handling user or data input.
 */
export function expectFound<T>(result: LexicalResult<T>, what: string): T {
  if (result.status === "NOT_FOUND") {
    throw new Error(`LEXICAL_NOT_FOUND: ${what} (${result.id})`);
  }
  return result.value;
}
