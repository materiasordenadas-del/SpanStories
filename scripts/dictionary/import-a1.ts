import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SENSES_PATH = join(ROOT, "generated", "curriculum", "a1", "senses.json");
const LEXEMES_PATH = join(ROOT, "generated", "curriculum", "a1", "lexemes.json");
const OUTPUT_PATH = join(ROOT, "generated", "dictionary", "a1", "enrichments.json");
const MANIFEST_PATH = join(ROOT, "generated", "dictionary", "a1", "manifest.json");
const AUDIT_PATH = join(ROOT, "generated", "dictionary", "a1", "audit.json");
const CACHE_DIR = join(ROOT, ".cache", "dictionary", "kaikki");

const EN_KAIKKI = "https://kaikki.org/dictionary/Spanish";
const ES_KAIKKI = "https://kaikki.org/eswiktionary/Espa%C3%B1ol";
const FREQUENCY_URL = "https://raw.githubusercontent.com/doozan/spanish_data/master/frequency.csv";
const USER_AGENT = "SpanStories-A1-Dictionary/0.1 (+https://github.com/materiasordenadas-del/SpanStories)";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const strict = args.has("--strict");
const refresh = args.has("--refresh");

/** Shape intentionally limited to fields emitted by the canonical curriculum JSON. */
type CurriculumSense = {
  readonly id: string;
  readonly lexemeId: string;
  readonly item: string;
  readonly senseKey: string;
  readonly status: string;
  readonly scope: string;
  readonly enginePos: string | null;
  readonly lexicalCategory: string | null;
  readonly sourceAssertionScopeKey: string | null;
  readonly isA1: boolean;
};

type CurriculumLexeme = {
  readonly id: string;
  readonly lemma: string;
  readonly lexemeKey: string;
  readonly type: "ATOMIC" | "MULTIWORD";
  readonly enginePos: string | null;
  readonly lexicalCategory: string | null;
};

type KaikkiExample = {
  readonly text?: string;
  readonly english?: string;
  readonly translation?: string;
  readonly type?: string;
};

type KaikkiRelation = { readonly word?: string; readonly sense?: string; readonly sense_index?: string };

type KaikkiSense = {
  readonly id?: string;
  readonly sense_index?: string;
  readonly glosses?: readonly string[];
  readonly raw_glosses?: readonly string[];
  readonly tags?: readonly string[];
  readonly raw_tags?: readonly string[];
  readonly examples?: readonly KaikkiExample[];
  readonly related?: readonly KaikkiRelation[];
  readonly synonyms?: readonly KaikkiRelation[];
};

type KaikkiTranslation = {
  readonly lang?: string;
  readonly lang_code?: string;
  readonly word?: string;
  readonly sense?: string;
  readonly sense_index?: string;
};

type KaikkiEntry = {
  readonly word?: string;
  readonly lang_code?: string;
  readonly pos?: string;
  readonly pos_title?: string;
  readonly senses?: readonly KaikkiSense[];
  readonly related?: readonly KaikkiRelation[];
  readonly synonyms?: readonly KaikkiRelation[];
  readonly translations?: readonly KaikkiTranslation[];
};

type DictionarySourceRef = {
  readonly kind: "KAIKKI_WIKTEXTRACT" | "DOOZAN_SPANISH_DATA";
  readonly label: string;
  readonly reference: string;
};

type DictionaryEnrichment = {
  readonly senseId: string;
  readonly translation?: string;
  readonly partOfSpeechLabel?: string;
  readonly shortUsage?: string;
  readonly examples?: readonly { readonly text: string; readonly translation?: string }[];
  readonly usageNotes?: readonly string[];
  readonly frequency?: string;
  readonly relatedWords?: readonly string[];
  readonly sources: readonly DictionarySourceRef[];
};

type Candidate = {
  readonly entry: KaikkiEntry;
  readonly sense: KaikkiSense;
  readonly score: number;
};

type FrequencyRow = { readonly rank: number; readonly count: number; readonly pos: string };

const POS_LABELS: Readonly<Record<string, string>> = {
  noun: "Sustantivo",
  verb: "Verbo",
  adj: "Adjetivo",
  adv: "Adverbio",
  prep: "Preposición",
  pron: "Pronombre",
  det: "Determinante",
  article: "Artículo",
  intj: "Interjección",
  num: "Numeral",
  numeral: "Numeral",
  conj: "Conjunción",
  phrase: "Expresión",
  prep_phrase: "Expresión",
  adv_phrase: "Expresión",
  name: "Nombre propio",
  proper_noun: "Nombre propio",
};

const ENGINE_POS_TO_SOURCE: Readonly<Record<string, readonly string[]>> = {
  NOUN: ["noun"],
  VERB: ["verb"],
  ADJ: ["adj"],
  ADV: ["adv"],
  ADP: ["prep", "prep_phrase"],
  PRON: ["pron"],
  ARTICLE: ["article", "det"],
  DET: ["det", "article"],
  INTERJECTION: ["intj"],
  NUM: ["num", "numeral"],
  CCONJ: ["conj"],
  SCONJ: ["conj"],
  MWU: ["phrase", "prep_phrase", "adv_phrase", "noun", "adv", "prep", "intj"],
};

const CATEGORY_TO_SOURCE: Readonly<Record<string, readonly string[]>> = {
  NOUN: ["noun"],
  VERB: ["verb"],
  ADJECTIVE: ["adj"],
  TEMPORAL_NOUN: ["noun"],
  TEMPORAL_ADVERB: ["adv"],
  PREPOSITION: ["prep"],
  PERSONAL_PRONOUN_SUBJECT: ["pron"],
  CLITIC: ["pron"],
  DEFINED_ARTICLE: ["article", "det"],
  INDEFINITE_ARTICLE: ["article", "det"],
  DEMONSTRATIVE: ["det", "pron", "adj"],
  ATONIC_POSSESSIVE: ["det", "pron", "adj"],
  INTERROGATIVE: ["pron", "adv", "det"],
  QUANTIFIER_DEGREE: ["adv", "det", "pron", "adj"],
  ORDINAL_NUMERAL: ["num", "numeral", "adj"],
  CONJUNCTION_CONNECTOR: ["conj"],
  MWU_CHUNK: ["phrase", "adv", "prep", "intj"],
  INTERROGATIVE_LOCUTION: ["phrase", "adv", "pron"],
  ADVERBIAL_OR_PREPOSITIONAL_LOCUTION: ["phrase", "adv_phrase", "prep_phrase", "adv", "prep"],
  NOMINAL_OR_LEXICALIZED_TERM: ["phrase", "noun"],
};

/** Terms that carry no useful sense information when a curriculum scope key is tokenized. */
const SCOPE_STOPWORDS = new Set([
  "a1", "a2", "core", "curriculum", "normative", "regional", "receptive", "general",
  "use", "usage", "sense", "scope", "related", "term", "lexical", "source", "boundary",
]);

/** Small bilingual bridge for the handful of explicitly scoped/polysemous curriculum senses. */
const SCOPE_HINTS: Readonly<Record<string, readonly string[]>> = {
  TICKET_TRANSPORT_OR_PURCHASE: ["ticket", "fare", "transport", "travel", "entrada", "boleto", "pasaje", "transporte"],
  BANKNOTE_MONEY: ["banknote", "bank note", "paper money", "dinero", "papel moneda"],
  ADULT_WOMAN: ["adult woman", "woman", "mujer adulta"],
  WIFE_PARTNER: ["wife", "spouse", "partner", "esposa", "cónyuge", "pareja"],
  FATHER_PARENT: ["father", "male parent", "padre"],
  PARENTS_FATHER_AND_MOTHER: ["parents", "father and mother", "padres", "padre y madre"],
  WEATHER_COLD: ["cold weather", "weather", "temperatura", "frío atmosférico", "clima"],
  PHYSICAL_COLD_SENSATION: ["feeling cold", "sensation", "sensación", "sentir frío"],
  PLACE_OF_WORSHIP: ["church building", "place of worship", "building", "edificio", "templo", "culto"],
  CHURCH_INSTITUTION: ["institution", "organization", "institución", "organización"],
  BANKNOTE: ["banknote", "money", "dinero"],
  POLITICAL_PRESIDENT: ["political", "country", "state", "government", "político", "gobierno", "estado"],
  BUSINESS_PRESIDENT: ["company", "corporation", "business", "empresa", "empresarial"],
  ORGANIZATION_EDUCATION_WORK_DIRECTOR: ["director", "manager", "school", "organization", "empresa", "escuela", "organización"],
  FILM_THEATRE_DIRECTOR: ["film", "movie", "theatre", "cinema", "cine", "teatro"],
  EXCESSIVE_TOO_MUCH: ["too much", "excessive", "excesivo", "demasiado"],
  REGIONAL_MUCH_VERY: ["very", "much", "mucho", "muy"],
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function safeFilename(value: string): string {
  return Buffer.from(value.normalize("NFC"), "utf8").toString("base64url");
}

function bucket(value: string, length: number): string {
  const chars = Array.from(value.normalize("NFC")).slice(0, length).join("");
  return chars.replace(/[^\p{L}\p{N}]/gu, "_");
}

function pageUrl(base: string, word: string, extension: "jsonl" | "html" = "jsonl"): string {
  const normalized = word.normalize("NFC");
  return `${base}/meaning/${encodeURIComponent(bucket(normalized, 1))}/${encodeURIComponent(bucket(normalized, 2))}/${encodeURIComponent(normalized)}.${extension}`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function fetchText(url: string): Promise<string | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error(`DICTIONARY_SOURCE_FETCH_FAILED ${url}: ${String(lastError)}`);
}

async function loadKaikki(base: string, edition: "en" | "es", word: string): Promise<readonly KaikkiEntry[]> {
  const cachePath = join(CACHE_DIR, edition, `${safeFilename(word)}.jsonl`);
  let text: string | null = null;
  if (!refresh) {
    try {
      text = await readFile(cachePath, "utf8");
    } catch {
      // Cache miss is normal.
    }
  }
  if (text === null) {
    text = await fetchText(pageUrl(base, word));
    if (text !== null) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, text, "utf8");
    }
  }
  if (text === null || text.trim() === "") return [];
  const entries: KaikkiEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const value = JSON.parse(line) as KaikkiEntry;
      if (value.lang_code === "es" || edition === "es") entries.push(value);
    } catch (error) {
      throw new Error(`DICTIONARY_SOURCE_INVALID_JSONL ${edition}:${word}: ${String(error)}`);
    }
  }
  return entries;
}

function desiredSourcePos(lexeme: CurriculumLexeme, sense: CurriculumSense): readonly string[] {
  const byEngine = sense.enginePos ?? lexeme.enginePos;
  if (byEngine !== null && ENGINE_POS_TO_SOURCE[byEngine] !== undefined) return ENGINE_POS_TO_SOURCE[byEngine];
  const byCategory = sense.lexicalCategory ?? lexeme.lexicalCategory;
  if (byCategory !== null && CATEGORY_TO_SOURCE[byCategory] !== undefined) return CATEGORY_TO_SOURCE[byCategory];
  const bracket = lexeme.lexemeKey.match(/\[([A-Z_]+)\]$/)?.[1];
  if (bracket !== undefined && ENGINE_POS_TO_SOURCE[bracket] !== undefined) return ENGINE_POS_TO_SOURCE[bracket];
  if (lexeme.type === "MULTIWORD") return ENGINE_POS_TO_SOURCE.MWU;
  return [];
}

function isFormOfSense(sense: KaikkiSense): boolean {
  return [...(sense.tags ?? []), ...(sense.raw_tags ?? [])].some((tag) => /form-of|inflection|plural|feminine|masculine|participle/i.test(tag));
}

function lexicalScopeTerms(sense: CurriculumSense): readonly string[] {
  const scope = sense.sourceAssertionScopeKey ?? sense.scope ?? sense.senseKey;
  const direct = SCOPE_HINTS[scope];
  if (direct !== undefined) return direct.map(normalize);
  return scope
    .split(/[_\s-]+/)
    .map(normalize)
    .filter((token) => token.length >= 3 && !SCOPE_STOPWORDS.has(token));
}

function glossText(sense: KaikkiSense): string {
  return [...(sense.glosses ?? []), ...(sense.raw_glosses ?? [])].join(" ");
}

function scopeScore(curriculumSense: CurriculumSense, sourceSense: KaikkiSense): number {
  const terms = lexicalScopeTerms(curriculumSense);
  if (terms.length === 0 || curriculumSense.senseKey === "A1_CURRICULUM_CORE") return 0;
  const haystack = normalize(glossText(sourceSense));
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 7 : 0), 0);
}

function sourceSenseCandidates(
  entries: readonly KaikkiEntry[],
  lexeme: CurriculumLexeme,
  sense: CurriculumSense,
): readonly Candidate[] {
  const desired = desiredSourcePos(lexeme, sense);
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const pos = entry.pos ?? "";
    const posIndex = desired.indexOf(pos);
    const posScore = desired.length === 0 ? 0 : posIndex === -1 ? -12 : 20 - posIndex;
    for (const sourceSense of entry.senses ?? []) {
      if (isFormOfSense(sourceSense)) continue;
      const tags = [...(sourceSense.tags ?? []), ...(sourceSense.raw_tags ?? [])].join(" ");
      const penalty = /obsolete|archaic|dated|rare|vulgar|historical/i.test(tags) ? 8 : 0;
      const index = Number(sourceSense.sense_index ?? "999");
      const orderScore = Number.isFinite(index) ? Math.max(0, 8 - Math.min(index, 8)) : 0;
      candidates.push({
        entry,
        sense: sourceSense,
        score: posScore + orderScore + scopeScore(sense, sourceSense) - penalty,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function topCandidate(
  entries: readonly KaikkiEntry[],
  lexeme: CurriculumLexeme,
  sense: CurriculumSense,
): Candidate | undefined {
  return sourceSenseCandidates(entries, lexeme, sense)[0];
}

function cleanGloss(value: string): string {
  return value
    .replace(/^\([^)]*\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function translationFrom(candidate: Candidate | undefined): string | undefined {
  const glosses = candidate?.sense.glosses?.map(cleanGloss).filter(Boolean) ?? [];
  if (glosses.length === 0) return undefined;
  return unique(glosses).slice(0, 2).join("; ");
}

function englishTranslationFromSpanishEntry(entry: KaikkiEntry | undefined): string | undefined {
  const values = (entry?.translations ?? [])
    .filter((translation) => translation.lang_code === "en" || normalize(translation.lang ?? "") === "ingles")
    .flatMap((translation) => translation.word === undefined ? [] : [translation.word.trim()])
    .filter(Boolean);
  return unique(values).slice(0, 3).join(" / ") || undefined;
}

function definitionFrom(candidate: Candidate | undefined): string | undefined {
  const definition = candidate?.sense.glosses?.map((value) => value.trim()).find(Boolean);
  return definition;
}

function examplesFrom(...candidates: readonly (Candidate | undefined)[]): readonly { text: string; translation?: string }[] {
  const seen = new Set<string>();
  const examples: { text: string; translation?: string }[] = [];
  for (const candidate of candidates) {
    for (const example of candidate?.sense.examples ?? []) {
      const text = example.text?.replace(/\s+/g, " ").trim();
      if (text === undefined || text === "" || seen.has(text)) continue;
      const words = text.split(/\s+/).length;
      // Prefer compact learner-usable examples. Long quotations stay in the source, not the A1 panel.
      if (words > 18 || example.type === "quotation") continue;
      const translation = (example.translation ?? example.english)?.replace(/\s+/g, " ").trim();
      examples.push({ text, ...(translation ? { translation } : {}) });
      seen.add(text);
      if (examples.length >= 5) return examples;
    }
  }
  return examples;
}

function relatedFrom(candidate: Candidate | undefined): readonly string[] {
  if (candidate === undefined) return [];
  const relations = [
    ...(candidate.sense.related ?? []),
    ...(candidate.sense.synonyms ?? []),
    ...(candidate.entry.related ?? []),
    ...(candidate.entry.synonyms ?? []),
  ];
  return unique(relations.flatMap((relation) => relation.word?.trim() ? [relation.word.trim()] : [])).slice(0, 8);
}

function posLabel(candidate: Candidate | undefined, lexeme: CurriculumLexeme, sense: CurriculumSense): string | undefined {
  const sourcePos = candidate?.entry.pos;
  if (sourcePos !== undefined && POS_LABELS[sourcePos] !== undefined) return POS_LABELS[sourcePos];
  const desired = desiredSourcePos(lexeme, sense)[0];
  if (desired !== undefined && POS_LABELS[desired] !== undefined) return POS_LABELS[desired];
  return lexeme.type === "MULTIWORD" ? "Expresión" : undefined;
}

async function loadFrequency(): Promise<ReadonlyMap<string, readonly FrequencyRow[]>> {
  const cachePath = join(CACHE_DIR, "frequency.csv");
  let text: string | null = null;
  if (!refresh) {
    try { text = await readFile(cachePath, "utf8"); } catch { /* cache miss */ }
  }
  if (text === null) {
    text = await fetchText(FREQUENCY_URL);
    if (text === null) return new Map();
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, text, "utf8");
  }
  const map = new Map<string, FrequencyRow[]>();
  const lines = text.split(/\r?\n/).slice(1);
  let rank = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const match = line.match(/^(\d+),([^,]+),([^,]*),/);
    if (match === null) continue;
    rank += 1;
    const [, count, spanish, pos] = match;
    const key = normalize(spanish);
    const bucket = map.get(key) ?? [];
    bucket.push({ rank, count: Number(count), pos });
    map.set(key, bucket);
  }
  return map;
}

function frequencyLabel(rows: readonly FrequencyRow[] | undefined): string | undefined {
  const row = rows?.[0];
  if (row === undefined) return undefined;
  const band = row.rank <= 100 ? "Muy alta" : row.rank <= 1000 ? "Alta" : row.rank <= 5000 ? "Media" : "Baja";
  return `${band} — rango aproximado #${row.rank.toLocaleString("en-US")}`;
}

function sourceRefs(item: string, hasEn: boolean, hasEs: boolean, hasFrequency: boolean): DictionarySourceRef[] {
  const refs: DictionarySourceRef[] = [];
  if (hasEn) refs.push({
    kind: "KAIKKI_WIKTEXTRACT",
    label: "Kaikki / English Wiktionary (Spanish entry)",
    reference: pageUrl(EN_KAIKKI, item, "html"),
  });
  if (hasEs) refs.push({
    kind: "KAIKKI_WIKTEXTRACT",
    label: "Kaikki / Wikcionario (Español)",
    reference: pageUrl(ES_KAIKKI, item, "html"),
  });
  if (hasFrequency) refs.push({
    kind: "DOOZAN_SPANISH_DATA",
    label: "doozan/spanish_data frequency.csv",
    reference: "https://github.com/doozan/spanish_data/blob/master/frequency.csv",
  });
  return refs;
}

async function importDictionary(): Promise<void> {
  const senses = await readJson<readonly CurriculumSense[]>(SENSES_PATH);
  const lexemes = await readJson<readonly CurriculumLexeme[]>(LEXEMES_PATH);
  const lexemeById = new Map(lexemes.map((lexeme) => [lexeme.id, lexeme] as const));
  const a1Senses = senses.filter((sense) => sense.isA1);
  const a1SenseCountByLexeme = new Map<string, number>();
  for (const sense of a1Senses) a1SenseCountByLexeme.set(sense.lexemeId, (a1SenseCountByLexeme.get(sense.lexemeId) ?? 0) + 1);
  const frequency = await loadFrequency();

  const enByItem = new Map<string, readonly KaikkiEntry[]>();
  const esByItem = new Map<string, readonly KaikkiEntry[]>();
  const enrichments: DictionaryEnrichment[] = [];
  const missingCore: { senseId: string; item: string; missing: string[] }[] = [];
  const multiSenseReview: { senseId: string; item: string; senseKey: string; sourceGloss?: string }[] = [];

  let processed = 0;
  for (const sense of a1Senses) {
    processed += 1;
    const lexeme = lexemeById.get(sense.lexemeId);
    if (lexeme === undefined) throw new Error(`DICTIONARY_LEXEME_NOT_FOUND: ${sense.lexemeId}`);
    const item = lexeme.lemma;

    let enEntries = enByItem.get(item);
    if (enEntries === undefined) {
      enEntries = await loadKaikki(EN_KAIKKI, "en", item);
      enByItem.set(item, enEntries);
    }
    let esEntries = esByItem.get(item);
    if (esEntries === undefined) {
      esEntries = await loadKaikki(ES_KAIKKI, "es", item);
      esByItem.set(item, esEntries);
    }

    const enCandidate = topCandidate(enEntries, lexeme, sense);
    const esCandidate = topCandidate(esEntries, lexeme, sense);
    const translation = translationFrom(enCandidate)
      ?? englishTranslationFromSpanishEntry(esCandidate?.entry)
      ?? englishTranslationFromSpanishEntry(esEntries[0]);
    const shortUsage = definitionFrom(esCandidate);
    const label = posLabel(esCandidate ?? enCandidate, lexeme, sense);
    const examples = examplesFrom(enCandidate, esCandidate);
    const relatedWords = relatedFrom(esCandidate ?? enCandidate);
    const frequencyRows = frequency.get(normalize(item));
    const frequencyText = frequencyLabel(frequencyRows);
    const sources = sourceRefs(item, enEntries.length > 0, esEntries.length > 0, frequencyRows !== undefined);

    const enrichment: DictionaryEnrichment = {
      senseId: sense.id,
      ...(translation === undefined ? {} : { translation }),
      ...(label === undefined ? {} : { partOfSpeechLabel: label }),
      ...(shortUsage === undefined ? {} : { shortUsage }),
      ...(examples.length === 0 ? {} : { examples }),
      ...(relatedWords.length === 0 ? {} : { relatedWords }),
      ...(frequencyText === undefined ? {} : { frequency: frequencyText }),
      sources,
    };
    enrichments.push(enrichment);

    const missing = [
      ...(translation === undefined ? ["translation"] : []),
      ...(label === undefined ? ["partOfSpeechLabel"] : []),
      ...(shortUsage === undefined ? ["shortUsage"] : []),
    ];
    if (missing.length > 0) missingCore.push({ senseId: sense.id, item, missing });
    if ((a1SenseCountByLexeme.get(sense.lexemeId) ?? 0) > 1) {
      multiSenseReview.push({ senseId: sense.id, item, senseKey: sense.senseKey, sourceGloss: glossText(esCandidate?.sense ?? enCandidate?.sense ?? {}) || undefined });
    }

    if (processed % 50 === 0 || processed === a1Senses.length) {
      console.log(`dictionary: ${processed}/${a1Senses.length}`);
    }
  }

  enrichments.sort((a, b) => a.senseId.localeCompare(b.senseId, "en"));
  const withTranslation = enrichments.filter((entry) => entry.translation !== undefined).length;
  const withShortUsage = enrichments.filter((entry) => entry.shortUsage !== undefined).length;
  const withExamples = enrichments.filter((entry) => (entry.examples?.length ?? 0) > 0).length;
  const withPos = enrichments.filter((entry) => entry.partOfSpeechLabel !== undefined).length;

  const audit = {
    curriculumReleaseId: "A1-CURRICULUM-v1.51",
    targetA1SenseCount: a1Senses.length,
    generatedEntryCount: enrichments.length,
    coreCompleteCount: enrichments.length - missingCore.length,
    withTranslation,
    withPartOfSpeech: withPos,
    withShortUsage,
    withExamples,
    missingCore,
    multiSenseReview,
  };

  if (checkOnly) {
    const existing = await readJson<readonly DictionaryEnrichment[]>(OUTPUT_PATH);
    const existingIds = new Set(existing.map((entry) => entry.senseId));
    const missingIds = a1Senses.filter((sense) => !existingIds.has(sense.id)).map((sense) => sense.id);
    const unknownIds = existing.filter((entry) => !a1Senses.some((sense) => sense.id === entry.senseId)).map((entry) => entry.senseId);
    if (missingIds.length > 0 || unknownIds.length > 0) {
      throw new Error(`DICTIONARY_COVERAGE_FAILED missing=${missingIds.length} unknown=${unknownIds.length}`);
    }
    if (strict && missingCore.length > 0) {
      throw new Error(`DICTIONARY_CORE_FIELDS_INCOMPLETE: ${missingCore.length}`);
    }
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(enrichments, null, 2)}\n`, "utf8");
  await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(MANIFEST_PATH, `${JSON.stringify({
    releaseId: "A1-DICTIONARY-v0.1",
    curriculumReleaseId: "A1-CURRICULUM-v1.51",
    generatedAt: new Date().toISOString(),
    sources: [
      {
        id: "kaikki-enwiktionary-spanish",
        url: EN_KAIKKI,
        role: "English glosses and bilingual examples",
        license: "CC BY-SA via Wiktionary/Kaikki; see docs/dictionary-sources.md",
      },
      {
        id: "kaikki-eswiktionary-espanol",
        url: ES_KAIKKI,
        role: "Spanish definitions, POS and lexical relations",
        license: "CC BY-SA via Wikcionario/Kaikki; see docs/dictionary-sources.md",
      },
      {
        id: "doozan-spanish-data-frequency",
        url: FREQUENCY_URL,
        role: "frequency band/rank",
        license: "CC BY-SA 3.0; see docs/dictionary-sources.md",
      },
    ],
    publishedEnrichmentCount: enrichments.length,
    coreCompleteCount: enrichments.length - missingCore.length,
  }, null, 2)}\n`, "utf8");

  if (strict && missingCore.length > 0) {
    throw new Error(`DICTIONARY_CORE_FIELDS_INCOMPLETE: ${missingCore.length}; inspect ${AUDIT_PATH}`);
  }
  console.log(JSON.stringify(audit, null, 2));
}

await importDictionary();
