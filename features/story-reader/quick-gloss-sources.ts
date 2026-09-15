import type { QuickGlossSource } from "./gloss.ts";

const COMMON_WORDS: Readonly<Record<string, string>> = {
  a: "to", ah: "oh", al: "at the", apellido: "last name", apellidos: "last names", ahora: "now", años: "years",
  aquí: "here", bien: "well", canadá: "Canada", canadiense: "Canadian", carné: "ID card", chao: "bye", chico: "boy",
  clase: "class", cómo: "how", con: "with", colombiano: "Colombian", colombia: "Colombia", cuál: "what", cuatro: "four",
  de: "of", despacio: "slowly", detiene: "stops", dice: "says", diez: "ten", dos: "two", dónde: "where",
  edad: "age", eh: "um", el: "the", encantado: "nice to meet you", en: "in", entender: "understand", escucha: "hears",
  entiendes: "do you understand", entiendo: "I understand", empieza: "starts", eres: "are you", es: "is", español: "Spanish",
  está: "is", estás: "are you", final: "end", gracias: "thanks", habla: "speaks", hablas: "do you speak",
  hablar: "speak", hablo: "I speak", hasta: "until", hay: "there is", hola: "hi", la: "the", llamo: "am called", lento: "slowly",
  lista: "list", lo: "him", mañana: "tomorrow", mapa: "map", me: "myself", mi: "my", mira: "looks at",
  muy: "very", no: "no", nombre: "name", nueve: "nine", número: "number", ocho: "eight", otra: "another",
  perdón: "sorry", poco: "a little", por: "for", profesor: "teacher", puedes: "can you", puedo: "I can", pregunta: "asks", qué: "what", quién: "who",
  quince: "fifteen", rápido: "quickly", repite: "repeats", repetir: "repeat", responde: "answers", ríe: "laughs",
  se: "himself", seis: "six", señor: "Mr.", sí: "yes", silencio: "silence", sonríe: "smiles", sonríen: "smile", soy: "am",
  teléfono: "phone", termina: "ends", tengo: "I have", tiene: "has", tienes: "do you have", tres: "three",
  tu: "your", tú: "you", un: "one", uno: "one", vez: "time", y: "and", yo: "I",
};

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
      ...COMMON_WORDS,
      hola: "hi", dice: "says", el: "the", señor: "Mr.", bien: "fine", gracias: "thanks", mira: "looks at", una: "a",
      lista: "list", quién: "who", es: "is", eh: "um", perdón: "sorry", yo: "I", soy: "am", sí: "yes", mi: "my",
      apellido: "last name", la: "the", sonríe: "smiles", no: "no", encantado: "nice to meet you", eres: "are you",
      canadá: "Canada", de: "of", clase: "class", profesor: "teacher", responde: "answers", está: "is",
    },
    names: ["Samuel", "Gómez", "López", "Jhonson", "Toronto"],
  },
  "01/02": {
    occurrences: [
      { sentence: 21, surface: "soy", text: "I'm" },
      { sentence: 35, surface: "Tengo", text: "I'm" },
      { sentence: 36, surface: "tengo", text: "I'm" },
    ],
    expressions: [
      { forms: ["qué", "tal"], text: "how's it going", words: ["how", "is it going"] },
      { forms: ["de", "dónde"], text: "where … from", words: ["from", "where"] },
      { forms: ["un", "poco"], text: "a little", words: ["a", "little"] },
      { forms: ["muy", "bien"], text: "very good", words: ["very", "good"] },
      { forms: ["qué", "edad", "tienes"], text: "how old are you", words: ["what", "age", "do you have"] },
      { forms: ["hasta", "mañana"], text: "see you tomorrow", words: ["until", "tomorrow"] },
    ],
    words: { ...COMMON_WORDS, tal: "such", catorce: "fourteen" },
    names: ["Samuel", "Mateo"],
  },
  "01/03": {
    occurrences: [],
    expressions: [
      { forms: ["me", "llamo"], text: "my name is", words: ["myself", "I call"] },
      { forms: ["cuál", "es"], text: "what is", words: ["what", "is"] },
      { forms: ["otra", "vez"], text: "again", words: ["another", "time"] },
      { forms: ["muy", "rápido"], text: "very fast", words: ["very", "fast"] },
    ],
    words: { ...COMMON_WORDS, garcía: "García", mateo: "Mateo", rojas: "Rojas", jhonson: "Jhonson", también: "too" },
    names: ["Samuel", "Mateo", "Rojas", "García", "Jhonson"],
  },
  "01/04": {
    occurrences: [
      { sentence: 16, surface: "puedo", text: "I can" },
    ],
    expressions: [
      { forms: ["no", "entiendo"], text: "I don't understand", words: ["not", "I understand"] },
      { forms: ["por", "favor"], text: "please", words: ["for", "favor"] },
      { forms: ["muy", "bien"], text: "very good", words: ["very", "good"] },
      { forms: ["muy", "rápido"], text: "very fast", words: ["very", "fast"] },
    ],
    words: { ...COMMON_WORDS, cinco: "five", favor: "favor" },
    names: ["Samuel", "Mateo"],
  },
};
