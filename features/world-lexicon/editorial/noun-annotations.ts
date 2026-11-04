import { ARTICLE_FORMS, type ArticleForm } from "../domain/attempt.ts";
import type { LexiconLookup } from "../domain/lexicon-lookup.ts";

/**
 * Anotaciones EDITORIALES de sustantivos.
 *
 * El registro A1 publicado (A1-LEXICON-v1.0) NO publica el género de los
 * sustantivos: de 666 formas solo 42 llevan `gender`, todas de determinantes y
 * pronombres. Por eso el género no se infiere de la terminación (-a/-o): cada
 * entrada que admita artículo lo declara aquí, de forma explícita, y queda
 * pendiente de revisión editorial. Sin anotación, el artículo no se acepta.
 *
 * Los artículos aceptados se derivan SOLO del género declarado:
 *   M → el, un      F → la, una
 * Los sustantivos femeninos con /a/ tónica inicial (el agua, el águila) exigirán
 * una excepción explícita ANTES de entrar al inventario; el piloto no los usa.
 */
export type NounGender = "M" | "F";

export type NounAnnotation = {
  readonly senseId: string;
  readonly gender: NounGender;
  /** Autorización editorial para aceptar «el árbol» además de «árbol». */
  readonly articlesAuthorized: boolean;
  readonly provenance: "EDITORIAL";
  readonly note?: string;
};

export const ARTICLES_BY_GENDER: Readonly<Record<NounGender, readonly ArticleForm[]>> = Object.freeze({
  M: Object.freeze(["el", "un"] as const),
  F: Object.freeze(["la", "una"] as const),
});

export function acceptedArticlesFor(annotation: NounAnnotation | undefined): readonly ArticleForm[] {
  if (annotation === undefined || !annotation.articlesAuthorized) return [];
  return ARTICLES_BY_GENDER[annotation.gender];
}

/** Piloto: cuatro sustantivos de género inequívoco. Revisión editorial pendiente. */
export const PILOT_NOUN_ANNOTATIONS: readonly NounAnnotation[] = Object.freeze([
  { senseId: "SENSE-A1-000050", gender: "M", articlesAuthorized: true, provenance: "EDITORIAL", note: "árbol" },
  { senseId: "SENSE-A1-000117", gender: "F", articlesAuthorized: true, provenance: "EDITORIAL", note: "casa" },
  { senseId: "SENSE-A1-000302", gender: "F", articlesAuthorized: true, provenance: "EDITORIAL", note: "iglesia (lugar de culto)" },
  { senseId: "SENSE-A1-000095", gender: "F", articlesAuthorized: true, provenance: "EDITORIAL", note: "calle" },
]);

export type NounAnnotationIndex = {
  get(senseId: string): NounAnnotation | undefined;
};

export type NounAnnotationIssue = { readonly code: string; readonly senseId: string; readonly message: string };

export function validateNounAnnotations(
  annotations: readonly NounAnnotation[],
  lookup: LexiconLookup,
): readonly NounAnnotationIssue[] {
  const issues: NounAnnotationIssue[] = [];
  const seen = new Set<string>();
  for (const annotation of annotations) {
    const issue = (code: string, message: string) => issues.push({ code, senseId: annotation.senseId, message });
    if (seen.has(annotation.senseId)) issue("DUPLICATE_ANNOTATION", "Hay dos anotaciones para el mismo Sense.");
    seen.add(annotation.senseId);
    if (lookup.senseFacts(annotation.senseId) === null) issue("UNKNOWN_SENSE", "El Sense no está publicado en el registro.");
    if (annotation.gender !== "M" && annotation.gender !== "F") issue("INVALID_GENDER", "El género debe ser M o F.");
    if (annotation.provenance !== "EDITORIAL") issue("INVALID_PROVENANCE", "La procedencia debe declararse EDITORIAL.");
  }
  return issues;
}

export function createNounAnnotationIndex(
  annotations: readonly NounAnnotation[],
  lookup: LexiconLookup,
): NounAnnotationIndex {
  const issues = validateNounAnnotations(annotations, lookup);
  if (issues.length > 0) throw new Error(`Anotaciones de sustantivos inválidas: ${issues.map((i) => `${i.senseId}:${i.code}`).join(", ")}`);
  const map = new Map(annotations.map((a) => [a.senseId, a]));
  return { get: (senseId) => map.get(senseId) };
}

/** Defensa en profundidad: los artículos aceptados por una anotación nunca salen de ARTICLES_BY_GENDER. */
export function articlesAreGenderConsistent(annotation: NounAnnotation): boolean {
  const allowed = ARTICLES_BY_GENDER[annotation.gender];
  return acceptedArticlesFor(annotation).every((article) => allowed.includes(article) && ARTICLE_FORMS.includes(article));
}
