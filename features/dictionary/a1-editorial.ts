import type { SenseId } from "../curriculum/index.ts";
import type { DictionarySenseEnrichment } from "./domain.ts";

const senseId = (value: string) => value as SenseId;

/**
 * Small editorial overlay for content that SpanStories itself owns.
 *
 * This is intentionally NOT the 602-entry dictionary source. The complete A1
 * dictionary is imported from external open datasets and normalized onto the
 * canonical Sense ids. Editorial entries only override or supplement imported
 * content when a product-specific explanation is useful.
 */
export const A1_EDITORIAL_ENRICHMENTS: readonly DictionarySenseEnrichment[] = [
  {
    senseId: senseId("SENSE-A1-000292"),
    translation: "hello / hi",
    partOfSpeechLabel: "Interjección",
    shortUsage: "Se usa para saludar cuando encuentras o te diriges a alguien. Es una forma común y neutral.",
    examples: [
      { text: "Hola, Ana.", translation: "Hi, Ana." },
      { text: "Hola, buenos días.", translation: "Hello, good morning." },
      { text: "Hola, ¿cómo estás?", translation: "Hi, how are you?" },
      { text: "¡Hola a todos!", translation: "Hi everyone!" },
      { text: "Hola, soy Samuel.", translation: "Hi, I'm Samuel." },
    ],
    usageNotes: [
      "Saludo neutral: sirve en cualquier momento del día.",
      "Se combina con otro saludo: «Hola, buenos días».",
      "Informal, pero también apropiado al iniciar una conversación formal.",
      "No cambia de forma: no tiene género ni número.",
    ],
    frequency: "Muy alta — entre las palabras más frecuentes del repertorio inicial.",
    relatedWords: ["Buenos días", "Adiós", "¿Qué tal?"],
    sources: [
      {
        kind: "SPANSTORIES_EDITORIAL",
        label: "SpanStories learner reference",
        reference: "A1-DICTIONARY-v1 / SENSE-A1-000292",
      },
    ],
  },
] as const;

export const A1_EDITORIAL_ENRICHMENT_BY_SENSE = new Map(
  A1_EDITORIAL_ENRICHMENTS.map((entry) => [entry.senseId, entry] as const),
);
