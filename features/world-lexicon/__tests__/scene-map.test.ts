import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLexiconLookup, type LexiconLookup } from "../domain/lexicon-lookup.ts";
import { validateWorldLexiconMap } from "../domain/scene-map.ts";
import { PILOT_NOUN_ANNOTATIONS, acceptedArticlesFor, articlesAreGenderConsistent, createNounAnnotationIndex, validateNounAnnotations } from "../editorial/noun-annotations.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const senses = read("../../../generated/curriculum/a1/senses.json");
const forms = read("../../../generated/curriculum/a1/forms.json");
const release = read("../../../generated/curriculum/a1/release.json");
const pilot = read("../../../SpanStories-Ciudades/Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/vocabulario.json");
const lookup: LexiconLookup = createLexiconLookup({ curriculumReleaseId: release.releaseId, lexiconReleaseId: "A1-LEXICON-v1.0", senses, forms });
const clone = <T,>(value: T): T => structuredClone(value);
const codes = (raw: unknown) => validateWorldLexiconMap(raw, lookup).issues.map((issue) => issue.code);

test("el mapa piloto de Barcelona es válido frente al registro A1 publicado", () => {
  const result = validateWorldLexiconMap(pilot, lookup);
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.map.entries.map((e) => e.id).sort(), ["arbol", "casa", "iglesia", "calle", "puerta"].sort());
});

test("cada entrada del piloto apunta a un Sense publicado y su texto de voz es la forma canónica", () => {
  for (const entry of pilot.entries) {
    const facts = lookup.senseFacts(entry.senseId);
    assert.ok(facts, entry.senseId);
    assert.equal(facts.lexemeId, entry.lexemeId);
    assert.equal(facts.isA1, true);
    assert.ok(facts.canonicalForms.includes(entry.speech.text), entry.id);
  }
});

test("el piloto no identifica vocabulario por nombre de malla", () => {
  for (const entry of pilot.entries) for (const selector of entry.selectors) assert.ok(["registryKind", "collection", "objectIds"].includes(Object.keys(selector)[0]));
  const bad = clone(pilot);
  bad.entries[0].selectors = [{ meshName: "BCN_ARB-001" }];
  assert.ok(codes(bad).includes("INVALID_SELECTOR"));
  const prefix = clone(pilot);
  prefix.entries[0].selectors = [{ namePrefix: "BCN_ARB" }];
  assert.ok(codes(prefix).includes("INVALID_SELECTOR"));
});

test("rechaza Senses desconocidos, de otra versión, duplicados y léxemas que no coinciden", () => {
  const unknown = clone(pilot); unknown.entries[0].senseId = "SENSE-A1-999999";
  assert.ok(codes(unknown).includes("UNKNOWN_SENSE"));
  const mismatch = clone(pilot); mismatch.entries[0].lexemeId = "LEX-A1-000001";
  assert.ok(codes(mismatch).includes("LEXEME_MISMATCH"));
  const duplicate = clone(pilot); duplicate.entries[1].senseId = duplicate.entries[0].senseId; duplicate.entries[1].lexemeId = duplicate.entries[0].lexemeId;
  assert.ok(codes(duplicate).includes("DUPLICATE_SENSE"));
  const release2 = clone(pilot); release2.curriculumReleaseId = "A1-CURRICULUM-v9";
  assert.ok(codes(release2).includes("RELEASE_MISMATCH"));
});

test("speech.text debe ser exactamente una forma canónica y el audio solo puede ser una ruta relativa", () => {
  const speech = clone(pilot); speech.entries[0].speech.text = "arbol";
  assert.ok(codes(speech).includes("SPEECH_TEXT_MISMATCH"));
  for (const url of ["https://evil.test/a.mp3", "../x.mp3", "/abs.mp3", "audio/arbol.exe"]) {
    const audio = clone(pilot); audio.entries[0].audio = { url };
    assert.ok(codes(audio).includes("INVALID_FIELD"), url);
  }
  const ok = clone(pilot); ok.entries[0].audio = { url: "audio/arbol.mp3" };
  assert.equal(validateWorldLexiconMap(ok, lookup).ok, true);
});

test("rechaza claves desconocidas (el mapa no puede traer la respuesta ni el veredicto)", () => {
  const withAnswer = clone(pilot); withAnswer.entries[0].expected = "árbol";
  assert.ok(codes(withAnswer).includes("UNKNOWN_KEY"));
  const withGender = clone(pilot); withGender.entries[0].gender = "M";
  assert.ok(codes(withGender).includes("UNKNOWN_KEY"));
});

test("resaltar toda la colección exige un selector de colección", () => {
  const bad = clone(pilot); bad.entries[0].highlight = "collection";
  assert.ok(codes(bad).includes("HIGHLIGHT_WITHOUT_COLLECTION"));
});

test("anotaciones de género del piloto: explícitas, editoriales y coherentes", () => {
  assert.deepEqual(validateNounAnnotations(PILOT_NOUN_ANNOTATIONS, lookup), []);
  const index = createNounAnnotationIndex(PILOT_NOUN_ANNOTATIONS, lookup);
  assert.deepEqual(acceptedArticlesFor(index.get("SENSE-A1-000050")), ["el", "un"]);
  assert.deepEqual(acceptedArticlesFor(index.get("SENSE-A1-000117")), ["la", "una"]);
  assert.deepEqual(acceptedArticlesFor(index.get("SENSE-A1-999999")), [], "sin anotación no se acepta artículo");
  assert.ok(PILOT_NOUN_ANNOTATIONS.every(articlesAreGenderConsistent));
  assert.throws(() => createNounAnnotationIndex([{ ...PILOT_NOUN_ANNOTATIONS[0], senseId: "SENSE-A1-999999" }], lookup));
});
