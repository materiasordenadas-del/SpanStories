/**
 * Evaluación de una palabra escrita por el estudiante al tocar un objeto del mundo.
 *
 * Esta función es la ÚNICA autoridad de validación. El visor 3D nunca conoce
 * la ortografía esperada: envía el texto escrito y recibe un veredicto.
 *
 * Política de normalización (explícita, ver README):
 *   - NFC, espacios en los extremos fuera, espacios internos colapsados a uno,
 *     caracteres de ancho cero fuera, minúsculas según el idioma español.
 *     Mayúsculas y espacios accidentales NUNCA cuentan como error.
 *
 * Política de tildes (explícita):
 *   - «Tilde» es solo el acento agudo sobre vocal (á é í ó ú).
 *   - FORGIVEN_WITH_CORRECTION: una tilde AUSENTE se acepta (CORRECT_ACCENT_MISSING),
 *     pero el resultado no cuenta como evidencia independiente (lo decide el
 *     servicio con `assisted`). Una tilde de más o en otra vocal es error.
 *   - REQUIRED: cualquier diferencia de tilde es error.
 *   - La ñ y la diéresis (ü) NO son tildes: cambian la palabra y nunca se perdonan.
 *
 * Política de artículos (explícita):
 *   - Sin artículo: siempre se admite el sustantivo solo.
 *   - Con artículo: solo si la entrada lo autoriza (`acceptedArticles` no vacío).
 *     Se admite únicamente un artículo singular de la lista autorizada.
 *     Un artículo de género equivocado, plural o no autorizado NUNCA se acepta.
 *   - El artículo solo se evalúa si el sustantivo es correcto.
 */

export const ARTICLE_FORMS = ["el", "la", "los", "las", "un", "una", "unos", "unas"] as const;
export type ArticleForm = (typeof ARTICLE_FORMS)[number];

export type AccentPolicy = "REQUIRED" | "FORGIVEN_WITH_CORRECTION";
export const ACCENT_POLICIES: readonly AccentPolicy[] = ["REQUIRED", "FORGIVEN_WITH_CORRECTION"];

export type AttemptExpectation = {
  /** Formas canónicas publicadas del léxico. Nunca salen de este módulo hacia el visor antes de acertar. */
  readonly forms: readonly string[];
  readonly accentPolicy: AccentPolicy;
  /** Vacío = los artículos no están autorizados para esta entrada. */
  readonly acceptedArticles: readonly ArticleForm[];
};

export type AttemptOutcome = "CORRECT" | "CORRECT_ACCENT_MISSING" | "INCORRECT";
export type AttemptReason = "EMPTY" | "TOO_LONG" | "WRONG_WORD" | "WRONG_ARTICLE" | "ARTICLE_NOT_ACCEPTED";

export type AttemptVerdict = {
  readonly outcome: AttemptOutcome;
  readonly reason: AttemptReason | null;
  /** Forma publicada con su tilde correcta; solo si el resultado es aceptado. */
  readonly matchedForm: string | null;
  readonly article: ArticleForm | null;
  /** Texto a mostrar al estudiante tras acertar («el árbol» / «árbol»); null si falló. */
  readonly display: string | null;
};

export const MAX_TYPED_LENGTH = 60;
const MAX_RAW_LENGTH = 200;
const ACUTE_BASE: Readonly<Record<string, string>> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

export function normalizeTyped(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[​-‍⁠﻿]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("es");
}

export function isArticleForm(value: string): value is ArticleForm {
  return (ARTICLE_FORMS as readonly string[]).includes(value);
}

type WordMatch = "EXACT" | "ACCENT_MISSING" | "NONE";

/** `form` ya normalizada. Solo una tilde AUSENTE es «ACCENT_MISSING»; cualquier otra diferencia es NONE. */
function compareWord(typed: string, form: string): WordMatch {
  if (typed === form) return "EXACT";
  if (typed.length !== form.length) return "NONE";
  let missing = false;
  for (let i = 0; i < form.length; i++) {
    const t = typed[i];
    const f = form[i];
    if (t === f) continue;
    if (ACUTE_BASE[f] === t) {
      missing = true;
      continue;
    }
    return "NONE";
  }
  return missing ? "ACCENT_MISSING" : "EXACT";
}

type FormMatch = { readonly form: string; readonly match: WordMatch };

function bestMatch(typed: string, forms: readonly string[]): FormMatch {
  let best: FormMatch = { form: "", match: "NONE" };
  for (const form of forms) {
    const match = compareWord(typed, normalizeTyped(form));
    if (match === "EXACT") return { form, match };
    if (match === "ACCENT_MISSING" && best.match === "NONE") best = { form, match };
  }
  return best;
}

function incorrect(reason: AttemptReason): AttemptVerdict {
  return { outcome: "INCORRECT", reason, matchedForm: null, article: null, display: null };
}

function accept(found: FormMatch, article: ArticleForm | null, policy: AccentPolicy): AttemptVerdict {
  if (found.match === "ACCENT_MISSING" && policy === "REQUIRED") return incorrect("WRONG_WORD");
  return {
    outcome: found.match === "ACCENT_MISSING" ? "CORRECT_ACCENT_MISSING" : "CORRECT",
    reason: null,
    matchedForm: found.form,
    article,
    display: article === null ? found.form : `${article} ${found.form}`,
  };
}

export function evaluateAttempt(typedRaw: unknown, expectation: AttemptExpectation): AttemptVerdict {
  if (expectation.forms.length === 0) throw new Error("La entrada no tiene formas canónicas publicadas");
  if (typeof typedRaw !== "string") return incorrect("EMPTY");
  if (typedRaw.length > MAX_RAW_LENGTH) return incorrect("TOO_LONG");
  const typed = normalizeTyped(typedRaw);
  if (typed === "") return incorrect("EMPTY");
  if (typed.length > MAX_TYPED_LENGTH) return incorrect("TOO_LONG");

  const whole = bestMatch(typed, expectation.forms);
  if (whole.match !== "NONE") return accept(whole, null, expectation.accentPolicy);

  const space = typed.indexOf(" ");
  if (space > 0) {
    const head = typed.slice(0, space);
    if (isArticleForm(head)) {
      const rest = bestMatch(typed.slice(space + 1), expectation.forms);
      if (rest.match === "NONE") return incorrect("WRONG_WORD");
      if (expectation.acceptedArticles.length === 0) return incorrect("ARTICLE_NOT_ACCEPTED");
      if (!expectation.acceptedArticles.includes(head)) return incorrect("WRONG_ARTICLE");
      return accept(rest, head, expectation.accentPolicy);
    }
  }
  return incorrect("WRONG_WORD");
}
