import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAttempt, normalizeTyped, type AttemptExpectation } from "../domain/attempt.ts";

const arbol: AttemptExpectation = { forms: ["árbol"], accentPolicy: "FORGIVEN_WITH_CORRECTION", acceptedArticles: ["el", "un"] };
const casa: AttemptExpectation = { forms: ["casa"], accentPolicy: "FORGIVEN_WITH_CORRECTION", acceptedArticles: ["la", "una"] };
const sinArticulo: AttemptExpectation = { forms: ["calle"], accentPolicy: "FORGIVEN_WITH_CORRECTION", acceptedArticles: [] };
const estricta: AttemptExpectation = { forms: ["árbol"], accentPolicy: "REQUIRED", acceptedArticles: ["el", "un"] };

test("mayúsculas y espacios accidentales no cuentan como error", () => {
  for (const typed of ["casa", "CASA", "  Casa  ", "cAsA", "\tcasa\n"]) assert.equal(evaluateAttempt(typed, casa).outcome, "CORRECT", typed);
  assert.equal(normalizeTyped("  la   casa "), "la casa");
  assert.equal(evaluateAttempt("la    casa", casa).outcome, "CORRECT");
  assert.equal(evaluateAttempt("casa​", casa).outcome, "CORRECT");
});

test("la forma con tilde compuesta o descompuesta es la misma palabra", () => {
  assert.equal(evaluateAttempt("árbol", arbol).outcome, "CORRECT");
  assert.equal(evaluateAttempt("ÁRBOL", arbol).outcome, "CORRECT");
});

test("sustantivo sin artículo siempre; con artículo solo el correcto y autorizado", () => {
  assert.equal(evaluateAttempt("casa", casa).outcome, "CORRECT");
  assert.equal(evaluateAttempt("la casa", casa).outcome, "CORRECT");
  assert.equal(evaluateAttempt("una casa", casa).outcome, "CORRECT");
  assert.equal(evaluateAttempt("el árbol", arbol).outcome, "CORRECT");
});

test("un artículo de género equivocado, plural o no autorizado nunca se acepta", () => {
  for (const typed of ["el casa", "un casa", "los casa", "las casa", "unas casa"]) {
    const verdict = evaluateAttempt(typed, casa);
    assert.equal(verdict.outcome, "INCORRECT", typed);
    assert.equal(verdict.reason, "WRONG_ARTICLE", typed);
  }
  for (const typed of ["la árbol", "una árbol", "los árbol"]) assert.equal(evaluateAttempt(typed, arbol).outcome, "INCORRECT", typed);
  const sinAutorizacion = evaluateAttempt("la calle", sinArticulo);
  assert.equal(sinAutorizacion.outcome, "INCORRECT");
  assert.equal(sinAutorizacion.reason, "ARTICLE_NOT_ACCEPTED");
  assert.equal(evaluateAttempt("calle", sinArticulo).outcome, "CORRECT");
});

test("el artículo solo se evalúa si el sustantivo es correcto", () => {
  assert.equal(evaluateAttempt("la mesa", casa).reason, "WRONG_WORD");
  assert.equal(evaluateAttempt("el", casa).outcome, "INCORRECT");
});

test("política de tildes: una tilde ausente se perdona con corrección; de más o cambiada, no", () => {
  const ausente = evaluateAttempt("arbol", arbol);
  assert.equal(ausente.outcome, "CORRECT_ACCENT_MISSING");
  assert.equal(ausente.display, "árbol");
  assert.equal(evaluateAttempt("el arbol", arbol).outcome, "CORRECT_ACCENT_MISSING");
  assert.equal(evaluateAttempt("árbol", arbol).outcome, "CORRECT");
  assert.equal(evaluateAttempt("arból", arbol).outcome, "INCORRECT");
  assert.equal(evaluateAttempt("cása", casa).outcome, "INCORRECT");
  assert.equal(evaluateAttempt("àrbol", arbol).outcome, "INCORRECT");
});

test("política de tildes REQUIRED: faltar la tilde es error", () => {
  assert.equal(evaluateAttempt("arbol", estricta).outcome, "INCORRECT");
  assert.equal(evaluateAttempt("árbol", estricta).outcome, "CORRECT");
});

test("ñ y ü no son tildes: nunca se perdonan", () => {
  const nino: AttemptExpectation = { forms: ["niño"], accentPolicy: "FORGIVEN_WITH_CORRECTION", acceptedArticles: [] };
  assert.equal(evaluateAttempt("nino", nino).outcome, "INCORRECT");
  assert.equal(evaluateAttempt("niño", nino).outcome, "CORRECT");
});

test("vacío, demasiado largo y entradas no textuales son errores sin revelar la palabra", () => {
  assert.equal(evaluateAttempt("   ", casa).reason, "EMPTY");
  assert.equal(evaluateAttempt("x".repeat(200), casa).reason, "TOO_LONG");
  assert.equal(evaluateAttempt(undefined, casa).outcome, "INCORRECT");
  assert.equal(evaluateAttempt(42, casa).outcome, "INCORRECT");
  for (const typed of ["mesa", "   ", "x".repeat(200)]) assert.equal(evaluateAttempt(typed, casa).display, null, "un fallo nunca muestra la ortografía");
});

test("varias formas canónicas: cualquiera es válida", () => {
  const dos: AttemptExpectation = { forms: ["mi", "mí"], accentPolicy: "REQUIRED", acceptedArticles: [] };
  assert.equal(evaluateAttempt("mi", dos).outcome, "CORRECT");
  assert.equal(evaluateAttempt("mí", dos).outcome, "CORRECT");
});
