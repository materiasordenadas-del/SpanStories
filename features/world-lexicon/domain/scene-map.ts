import { ACCENT_POLICIES, type AccentPolicy } from "./attempt.ts";
import type { LexiconLookup } from "./lexicon-lookup.ts";

/**
 * Mapa editorial de una zona: qué objetos 3D enseñan qué SenseId publicado.
 *
 * El mapa NO identifica vocabulario por nombre de malla. Cada entrada declara
 * un SenseId/LexemeId publicados y uno o más selectores explícitos:
 *   { registryKind }  tipo del registro del visor (p. ej. «tree»: todas las instancias)
 *   { collection }    colección de origen del modelo (grupo de mallas de un edificio)
 *   { objectIds }     ids estables explícitos
 * No existe selector por nombre o prefijo de malla: no se admite.
 *
 * El mapa lo leen el visor (selectores, audio, texto de pronunciación) y el
 * anfitrión (SenseId). La ortografía esperada y el género NO están en el mapa:
 * salen del registro publicado y de las anotaciones editoriales.
 */
export const WORLD_LEXICON_MAP_VERSION = 1;

export type WorldObjectSelector =
  | { readonly registryKind: string }
  | { readonly collection: string }
  | { readonly objectIds: readonly string[] };

export type WorldLexiconEntry = {
  readonly id: string;
  readonly senseId: string;
  readonly lexemeId: string;
  readonly selectors: readonly WorldObjectSelector[];
  /** «hit»: resalta el objeto tocado. «collection»: resalta todo el grupo de su colección. */
  readonly highlight: "hit" | "collection";
  readonly accentPolicy: AccentPolicy;
  /** Texto SOLO para la voz de respaldo. Debe coincidir con la forma canónica publicada. */
  readonly speech: { readonly text: string; readonly lang: string };
  /** Audio pregrabado opcional, relativo al mapa. Si falta o falla, se usa la voz de respaldo. */
  readonly audio?: { readonly url: string };
};

export type WorldLexiconMap = {
  readonly version: 1;
  readonly id: string;
  readonly zoneId: string;
  readonly curriculumReleaseId: string;
  readonly lexiconReleaseId: string;
  readonly entries: readonly WorldLexiconEntry[];
};

export type WorldLexiconIssueCode =
  | "NOT_AN_OBJECT"
  | "UNKNOWN_KEY"
  | "INVALID_FIELD"
  | "RELEASE_MISMATCH"
  | "DUPLICATE_ENTRY_ID"
  | "DUPLICATE_SENSE"
  | "UNKNOWN_SENSE"
  | "SENSE_NOT_A1"
  | "LEXEME_MISMATCH"
  | "SPEECH_TEXT_MISMATCH"
  | "NO_SELECTORS"
  | "INVALID_SELECTOR"
  | "HIGHLIGHT_WITHOUT_COLLECTION";

export type WorldLexiconIssue = {
  readonly code: WorldLexiconIssueCode;
  readonly entryId: string | null;
  readonly message: string;
};

export type WorldLexiconMapResult =
  | { readonly ok: true; readonly map: WorldLexiconMap; readonly issues: readonly [] }
  | { readonly ok: false; readonly map: null; readonly issues: readonly WorldLexiconIssue[] };

const ENTRY_ID = /^[a-z][a-z0-9-]{1,40}$/;
const SENSE_ID = /^SENSE-A1-\d{6}$/;
const LEXEME_ID = /^LEX-A1-\d{6}$/;
const OBJECT_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const KIND_OR_COLLECTION = /^[A-Za-z0-9._-]{1,80}$/;
const AUDIO_URL = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.(mp3|ogg|m4a|wav)$/;
const SPEECH_LANG = /^es(-[A-Z]{2})?$/;
const MAP_KEYS = new Set(["version", "id", "zoneId", "curriculumReleaseId", "lexiconReleaseId", "entries"]);
const ENTRY_KEYS = new Set(["id", "senseId", "lexemeId", "selectors", "highlight", "accentPolicy", "speech", "audio"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): string[] {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function parseSelector(raw: unknown): WorldObjectSelector | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return null;
  const [key] = keys;
  const value = raw[key];
  if (key === "registryKind" && typeof value === "string" && KIND_OR_COLLECTION.test(value)) return { registryKind: value };
  if (key === "collection" && typeof value === "string" && KIND_OR_COLLECTION.test(value)) return { collection: value };
  if (
    key === "objectIds" &&
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 500 &&
    value.every((id) => typeof id === "string" && OBJECT_ID.test(id)) &&
    new Set(value).size === value.length
  ) {
    return { objectIds: [...(value as string[])] };
  }
  return null;
}

/**
 * Valida un mapa (estructura + SenseIds publicados) y lo devuelve ya tipado.
 * Un mapa con cualquier problema no se entrega: el piloto no publica entradas a medias.
 */
export function validateWorldLexiconMap(raw: unknown, lookup: LexiconLookup): WorldLexiconMapResult {
  const issues: WorldLexiconIssue[] = [];
  const add = (code: WorldLexiconIssueCode, entryId: string | null, message: string) => issues.push({ code, entryId, message });
  if (!isRecord(raw)) return { ok: false, map: null, issues: [{ code: "NOT_AN_OBJECT", entryId: null, message: "El mapa debe ser un objeto." }] };

  for (const key of unknownKeys(raw, MAP_KEYS)) add("UNKNOWN_KEY", null, `Clave desconocida en el mapa: ${key}`);
  if (raw.version !== WORLD_LEXICON_MAP_VERSION) add("INVALID_FIELD", null, "version debe ser 1.");
  for (const field of ["id", "zoneId", "curriculumReleaseId", "lexiconReleaseId"] as const) {
    if (typeof raw[field] !== "string" || (raw[field] as string).trim() === "") add("INVALID_FIELD", null, `${field} es obligatorio.`);
  }
  if (raw.curriculumReleaseId !== lookup.curriculumReleaseId || raw.lexiconReleaseId !== lookup.lexiconReleaseId) {
    add("RELEASE_MISMATCH", null, "El mapa declara una versión de currículo o léxico distinta de la publicada.");
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    add("INVALID_FIELD", null, "entries debe ser una lista no vacía.");
    return { ok: false, map: null, issues };
  }

  const entries: WorldLexiconEntry[] = [];
  const seenIds = new Set<string>();
  const seenSenses = new Set<string>();
  for (const rawEntry of raw.entries as unknown[]) {
    if (!isRecord(rawEntry)) {
      add("NOT_AN_OBJECT", null, "Cada entrada debe ser un objeto.");
      continue;
    }
    const entryId = typeof rawEntry.id === "string" ? rawEntry.id : null;
    for (const key of unknownKeys(rawEntry, ENTRY_KEYS)) add("UNKNOWN_KEY", entryId, `Clave desconocida en la entrada: ${key}`);
    if (entryId === null || !ENTRY_ID.test(entryId)) {
      add("INVALID_FIELD", entryId, "id de entrada inválido.");
      continue;
    }
    if (seenIds.has(entryId)) add("DUPLICATE_ENTRY_ID", entryId, "id de entrada duplicado.");
    seenIds.add(entryId);

    const senseId = rawEntry.senseId;
    const lexemeId = rawEntry.lexemeId;
    if (typeof senseId !== "string" || !SENSE_ID.test(senseId)) add("INVALID_FIELD", entryId, "senseId debe ser un SenseId publicado.");
    if (typeof lexemeId !== "string" || !LEXEME_ID.test(lexemeId)) add("INVALID_FIELD", entryId, "lexemeId debe ser un LexemeId publicado.");

    if (typeof senseId === "string" && SENSE_ID.test(senseId)) {
      if (seenSenses.has(senseId)) add("DUPLICATE_SENSE", entryId, "Dos entradas apuntan al mismo Sense.");
      seenSenses.add(senseId);
      const facts = lookup.senseFacts(senseId);
      if (facts === null) add("UNKNOWN_SENSE", entryId, "El Sense no existe en el registro publicado.");
      else {
        if (!facts.isA1) add("SENSE_NOT_A1", entryId, "El Sense no es A1: no puede enseñarse en el mundo.");
        if (facts.lexemeId !== lexemeId) add("LEXEME_MISMATCH", entryId, "El lexemeId no corresponde al Sense publicado.");
        const speech = rawEntry.speech;
        if (isRecord(speech) && typeof speech.text === "string" && !facts.canonicalForms.includes(speech.text)) {
          add("SPEECH_TEXT_MISMATCH", entryId, "speech.text debe ser exactamente una forma canónica publicada.");
        }
      }
    }

    const selectors: WorldObjectSelector[] = [];
    if (!Array.isArray(rawEntry.selectors) || rawEntry.selectors.length === 0) add("NO_SELECTORS", entryId, "La entrada necesita al menos un selector explícito.");
    else {
      for (const rawSelector of rawEntry.selectors as unknown[]) {
        const selector = parseSelector(rawSelector);
        if (selector === null) add("INVALID_SELECTOR", entryId, "Selector inválido (solo registryKind, collection u objectIds).");
        else selectors.push(selector);
      }
    }

    const highlight = rawEntry.highlight === undefined ? "hit" : rawEntry.highlight;
    if (highlight !== "hit" && highlight !== "collection") add("INVALID_FIELD", entryId, "highlight debe ser «hit» o «collection».");
    else if (highlight === "collection" && !selectors.some((s) => "collection" in s)) {
      add("HIGHLIGHT_WITHOUT_COLLECTION", entryId, "highlight «collection» requiere un selector de colección.");
    }

    const accentPolicy = rawEntry.accentPolicy === undefined ? "FORGIVEN_WITH_CORRECTION" : rawEntry.accentPolicy;
    if (!ACCENT_POLICIES.includes(accentPolicy as AccentPolicy)) add("INVALID_FIELD", entryId, "accentPolicy inválida.");

    const speech = rawEntry.speech;
    if (!isRecord(speech) || typeof speech.text !== "string" || speech.text.trim() === "") add("INVALID_FIELD", entryId, "speech.text es obligatorio.");
    else if (speech.lang !== undefined && (typeof speech.lang !== "string" || !SPEECH_LANG.test(speech.lang))) add("INVALID_FIELD", entryId, "speech.lang inválido.");
    else if (Object.keys(speech).some((key) => key !== "text" && key !== "lang")) add("UNKNOWN_KEY", entryId, "Clave desconocida en speech.");

    let audio: { readonly url: string } | undefined;
    if (rawEntry.audio !== undefined) {
      const candidate = rawEntry.audio;
      if (!isRecord(candidate) || Object.keys(candidate).length !== 1 || typeof candidate.url !== "string" || !AUDIO_URL.test(candidate.url) || candidate.url.includes("..")) {
        add("INVALID_FIELD", entryId, "audio.url debe ser una ruta relativa a un archivo de audio.");
      } else audio = { url: candidate.url };
    }

    if (issues.length === 0 || !issues.some((i) => i.entryId === entryId)) {
      entries.push({
        id: entryId,
        senseId: senseId as string,
        lexemeId: lexemeId as string,
        selectors,
        highlight: highlight as "hit" | "collection",
        accentPolicy: accentPolicy as AccentPolicy,
        speech: { text: (speech as { text: string }).text, lang: ((speech as { lang?: string }).lang ?? "es-ES") },
        ...(audio ? { audio } : {}),
      });
    }
  }

  if (issues.length > 0) return { ok: false, map: null, issues };
  return {
    ok: true,
    issues: [],
    map: {
      version: 1,
      id: raw.id as string,
      zoneId: raw.zoneId as string,
      curriculumReleaseId: raw.curriculumReleaseId as string,
      lexiconReleaseId: raw.lexiconReleaseId as string,
      entries,
    },
  };
}
