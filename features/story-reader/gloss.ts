import type {
  StoryReaderGlossUnit,
  StoryReaderGlossWord,
  StoryReaderQuickGloss,
  StoryReaderSentence,
  StoryReaderTextSegment,
  StoryReaderViewModel,
} from "./model.ts";

/**
 * Traducción rápida del lector: cada palabra y cada expresión de una frase con la
 * traducción de esa aparición. Nunca inventa: sin fuente, la palabra queda MISSING.
 *
 * Prioridad de cada palabra:
 *   1 · traducción publicada de la aparición (referencia editorial de la ocurrencia o traducción de la ficha)
 *   2 · fuente editorial de traducción rápida de la historia: aparición concreta, palabra dentro de su expresión, palabra
 *   3 · nombre propio
 */
export type QuickGlossSource = {
  /** Traducción de una aparición concreta: frase (índice desde 0) y forma escrita, única en esa frase. */
  readonly occurrences: readonly { readonly sentence: number; readonly surface: string; readonly text: string }[];
  /** Expresiones de palabras seguidas: sus formas, la traducción entera y la de cada palabra dentro de ella. */
  readonly expressions: readonly { readonly forms: readonly string[]; readonly text: string; readonly words: readonly string[] }[];
  /** Traducción de la palabra por su forma en minúsculas. */
  readonly words: Readonly<Record<string, string>>;
  readonly names: readonly string[];
};

type WordSegment = Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>;

const lower = (text: string) => text.toLocaleLowerCase("es");
const segmentId = (segment: WordSegment) => segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;

export function buildGlossUnits(input: {
  readonly sentenceId: string;
  readonly sentenceIndex: number;
  readonly segments: readonly StoryReaderTextSegment[];
  readonly source: QuickGlossSource | undefined;
  readonly publishedTranslation: (segment: WordSegment) => string | undefined;
}): readonly StoryReaderGlossUnit[] {
  const { sentenceId, sentenceIndex, segments, source, publishedTranslation } = input;
  const words = segments.flatMap((segment, segmentIndex) => segment.kind === "TEXT" ? [] : [{ segment, segmentIndex, key: lower(segment.text) }]);

  // Dos palabras seguidas se pueden unir solo si entre ellas no hay más que espacio: la puntuación corta.
  const joinsNext = (index: number) => {
    const current = words[index];
    const next = words[index + 1];
    if (current === undefined || next === undefined) return false;
    const between = segments.slice(current.segmentIndex + 1, next.segmentIndex);
    return between.length > 0 && between.every((segment) => segment.kind === "TEXT" && /^\s+$/u.test(segment.text));
  };

  const wordGloss = (segment: WordSegment, key: string, inExpression: string | undefined): StoryReaderQuickGloss => {
    const translation = publishedTranslation(segment)?.trim()
      || source?.occurrences.find((entry) => entry.sentence === sentenceIndex && lower(entry.surface) === key)?.text
      || inExpression
      || (source !== undefined && Object.hasOwn(source.words, key) ? source.words[key] : undefined);
    if (translation) return { text: translation, kind: "TRANSLATION" };
    if (source?.names.some((name) => lower(name) === key)) return { text: "(name)", kind: "NAME" };
    return { text: "sin traducción", kind: "MISSING" };
  };

  const units: StoryReaderGlossUnit[] = [];
  for (let index = 0; index < words.length;) {
    // La expresión más larga que empiece aquí con todas sus palabras separadas solo por espacio.
    const expression = source?.expressions
      .filter(({ forms }) => forms.length > 1 && forms.every((form, offset) => words[index + offset]?.key === lower(form) && (offset === 0 || joinsNext(index + offset - 1))))
      .sort((a, b) => b.forms.length - a.forms.length)[0];
    const own = words.slice(index, index + (expression?.forms.length ?? 1));
    units.push({
      id: `${sentenceId}#${own[0].segmentIndex}`,
      words: own.map((word, offset): StoryReaderGlossWord => ({
        id: segmentId(word.segment),
        segmentIndex: word.segmentIndex,
        gloss: wordGloss(word.segment, word.key, expression?.words[offset]),
        joinsNext: joinsNext(index + offset),
      })),
      ...(expression === undefined ? {} : { gloss: { text: expression.text, kind: "TRANSLATION" as const } }),
    });
    index += own.length;
  }
  return units;
}

/** Adjunta la traducción rápida a cada frase. La fuente editorial solo llega a las etiquetas, nunca a la ficha. */
export function withQuickGloss(model: StoryReaderViewModel, source?: QuickGlossSource): StoryReaderViewModel {
  const publishedTranslation = (segment: WordSegment) => {
    if (segment.kind === "SURFACE") return model.surfaceEntries[segment.tokenId]?.panel.translation;
    const entry = model.lexicalEntries[segment.occurrenceId];
    return entry?.reference?.translation ?? entry?.panel.translation;
  };
  return {
    ...model,
    sentences: model.sentences.map((sentence, sentenceIndex) => ({
      ...sentence,
      glossUnits: buildGlossUnits({ sentenceId: sentence.id, sentenceIndex, segments: sentence.segments, source, publishedTranslation }),
    })),
  };
}

/** Una etiqueta visible: sobre una palabra, o sobre una expresión entera cuando todas sus palabras están tocadas. */
export type GlossHost = {
  readonly id: string;
  readonly wordIds: readonly string[];
  readonly gloss: StoryReaderQuickGloss;
  /** Palabras tocadas seguidas en la misma frase comparten grupo: sus etiquetas forman una sola barra. */
  readonly run: string;
};

export function glossHosts(sentences: readonly Pick<StoryReaderSentence, "id" | "glossUnits">[], active: ReadonlySet<string>): readonly GlossHost[] {
  const hosts: GlossHost[] = [];
  for (const sentence of sentences) {
    const units = sentence.glossUnits ?? [];
    const runOf = new Map<string, string>();
    let run = 0;
    let previous: StoryReaderGlossWord | null = null;
    for (const word of units.flatMap((unit) => unit.words)) {
      if (!active.has(word.id)) { previous = null; continue; }
      if (previous === null || !previous.joinsNext) run += 1;
      runOf.set(word.id, `${sentence.id}#${run}`);
      previous = word;
    }
    for (const unit of units) {
      const on = unit.words.filter((word) => active.has(word.id));
      if (on.length === 0) continue;
      if (unit.gloss !== undefined && on.length === unit.words.length) {
        hosts.push({ id: unit.id, wordIds: unit.words.map((word) => word.id), gloss: unit.gloss, run: runOf.get(unit.words[0].id) ?? unit.id });
      } else {
        for (const word of on) hosts.push({ id: word.id, wordIds: [word.id], gloss: word.gloss, run: runOf.get(word.id) ?? word.id });
      }
    }
  }
  return hosts;
}

export type ShownGloss = GlossHost & {
  /** Se está retirando: la etiqueta se desvanece y la línea se cierra antes de quitarla. */
  readonly leaving: boolean;
  /** Sustituye a otra etiqueta de sus mismas palabras: aparece sin volver a abrir la línea. */
  readonly instant: boolean;
};

/**
 * Pasa de las etiquetas visibles a las deseadas. Una etiqueta que otra sustituye (palabra ↔ expresión)
 * desaparece al instante; las demás que ya no se desean quedan retirándose hasta que el llamador las quite.
 */
export function reconcileGlosses(previous: ReadonlyMap<string, ShownGloss>, desired: readonly GlossHost[]): ReadonlyMap<string, ShownGloss> {
  const overlaps = (a: GlossHost, b: GlossHost) => a.id !== b.id && a.wordIds.some((id) => b.wordIds.includes(id));
  const next = new Map<string, ShownGloss>();
  for (const host of desired) {
    const current = previous.get(host.id);
    const kept = current !== undefined && !current.leaving && current.gloss.text === host.gloss.text;
    next.set(host.id, { ...host, leaving: false, instant: kept ? current.instant : [...previous.values()].some((old) => !old.leaving && overlaps(old, host)) });
  }
  for (const old of previous.values()) {
    if (next.has(old.id) || desired.some((host) => overlaps(old, host))) continue;
    next.set(old.id, old.leaving ? old : { ...old, leaving: true });
  }
  return next;
}
