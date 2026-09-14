import type { QuickGlossSource } from "./gloss.ts";

/**
 * Fuente editorial de la traducción rápida, por historia del lector ("isla/historia").
 * No es una fuente léxica publicada: alimenta solo las etiquetas de traducción rápida,
 * nunca la ficha de la palabra ni las tarjetas de práctica. Una traducción publicada
 * de la aparición siempre tiene prioridad sobre esta fuente.
 */
export const QUICK_GLOSS_SOURCES: Readonly<Record<string, QuickGlossSource>> = {
  "01/01": {
    occurrences: [
      { sentence: 5, surface: "señor", text: "sir" },
      { sentence: 12, surface: "bien", text: "okay" },
      { sentence: 15, surface: "de", text: "from" },
      { sentence: 20, surface: "bien", text: "right" },
    ],
    expressions: [
      { forms: ["buenos", "días"], text: "good morning", words: ["good", "days"] },
      { forms: ["cómo", "estás"], text: "how are you", words: ["how", "are you"] },
      { forms: ["otra", "vez"], text: "again", words: ["another", "time"] },
      { forms: ["de", "dónde"], text: "where … from", words: ["from", "where"] },
      { forms: ["al", "final", "de"], text: "at the end of", words: ["at the", "end", "of"] },
      { forms: ["hasta", "mañana"], text: "see you tomorrow", words: ["until", "tomorrow"] },
      { forms: ["esta", "vez"], text: "this time", words: ["this", "time"] },
    ],
    words: {
      hola: "hi", dice: "says", el: "the", señor: "Mr.", bien: "fine", gracias: "thanks", mira: "looks at", una: "a",
      lista: "list", quién: "who", es: "is", eh: "um", perdón: "sorry", yo: "I", soy: "am", sí: "yes", mi: "my",
      apellido: "last name", la: "the", sonríe: "smiles", no: "no", encantado: "nice to meet you", eres: "are you",
      canadá: "Canada", de: "of", clase: "class", profesor: "teacher", responde: "answers", está: "is",
    },
    names: ["Samuel", "Gómez", "López", "Jhonson", "Toronto"],
  },
};
