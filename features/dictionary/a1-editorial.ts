import type { SenseId } from "../curriculum/index.ts";
import type { DictionarySenseEnrichment } from "./domain.ts";

const senseId = (value: string) => value as SenseId;
type EditorialFields = Omit<DictionarySenseEnrichment, "senseId" | "sources">;

const EDITORIAL_SOURCE = {
  kind: "SPANSTORIES_EDITORIAL" as const,
  label: "SpanStories A1 dictionary editorial layer",
  reference: "A1-DICTIONARY-v1",
};

const editorial = (id: string, fields: EditorialFields): DictionarySenseEnrichment => ({
  senseId: senseId(id),
  ...fields,
  sources: [EDITORIAL_SOURCE],
});

/**
 * Editorial overlay for learner-facing content that open lexical datasets do
 * not provide reliably enough for a specific canonical A1 Sense.
 *
 * Entries are keyed ONLY by published SenseId. The runtime merges these fields
 * over imported data, so a targeted correction never discards valid imported
 * examples, frequency or lexical relations.
 */
export const A1_EDITORIAL_ENRICHMENTS: readonly DictionarySenseEnrichment[] = [
  // Open-source gap completions found by the A1 dictionary audit.
  editorial("SENSE-A1-000002", {
    translation: "to the right",
    shortUsage: "Indica una dirección o ubicación hacia el lado derecho.",
  }),
  editorial("SENSE-A1-000003", {
    translation: "to the left",
    shortUsage: "Indica una dirección o ubicación hacia el lado izquierdo.",
  }),
  editorial("SENSE-A1-000004", {
    translation: "at noon",
    shortUsage: "Se usa para situar una acción alrededor de las doce del mediodía.",
  }),
  editorial("SENSE-A1-000005", {
    translation: "on foot",
    shortUsage: "Indica que una persona se desplaza caminando.",
  }),
  editorial("SENSE-A1-000006", {
    translation: "sometimes",
    shortUsage: "Expresa que algo ocurre en algunas ocasiones, pero no siempre.",
  }),
  editorial("SENSE-A1-000018", {
    translation: "sparkling water",
    shortUsage: "Agua que contiene gas; se usa al pedir o describir una bebida.",
  }),
  editorial("SENSE-A1-000019", { translation: "mineral water" }),
  editorial("SENSE-A1-000020", {
    translation: "still water",
    shortUsage: "Agua sin gas; se usa al pedir o describir una bebida.",
  }),
  editorial("SENSE-A1-000023", {
    translation: "today",
    shortUsage: "Variante popular y rural de México equivalente a «hoy»; en A1 se trabaja de forma receptiva.",
  }),
  editorial("SENSE-A1-000025", { translation: "air conditioning" }),
  editorial("SENSE-A1-000028", { translation: "cheerful / happy" }),
  editorial("SENSE-A1-000035", {
    translation: "homemaker / housewife",
    shortUsage: "Persona que se dedica principalmente al trabajo doméstico y al cuidado del hogar.",
  }),
  editorial("SENSE-A1-000041", { translation: "glasses / eyeglasses" }),
  editorial("SENSE-A1-000044", { translation: "parking lot / car park" }),
  editorial("SENSE-A1-000077", { translation: "sandwich" }),
  editorial("SENSE-A1-000083", { translation: "Buddhist" }),
  editorial("SENSE-A1-000084", { translation: "Buddhist" }),
  editorial("SENSE-A1-000088", { translation: "coffee with milk" }),
  editorial("SENSE-A1-000089", {
    translation: "espresso with a little milk",
    shortUsage: "Café espresso servido con una pequeña cantidad de leche.",
  }),
  editorial("SENSE-A1-000090", {
    translation: "espresso / black coffee",
    shortUsage: "Café servido sin leche; en España suele referirse a un espresso.",
  }),
  editorial("SENSE-A1-000092", {
    translation: "central heating",
    shortUsage: "Sistema de calefacción que da servicio a todo un edificio o a varias viviendas desde una instalación común.",
  }),
  editorial("SENSE-A1-000093", {
    translation: "individual heating",
    shortUsage: "Sistema de calefacción controlado de forma independiente para una vivienda.",
  }),
  editorial("SENSE-A1-000101", {
    translation: "camping / campsite",
    partOfSpeechLabel: "Sustantivo",
    shortUsage: "Lugar preparado para acampar; «campin» es una adaptación al español de «camping».",
  }),
  editorial("SENSE-A1-000109", { translation: "ID card / membership card" }),
  editorial("SENSE-A1-000110", {
    translation: "driver's license / driving licence",
    shortUsage: "Documento oficial que autoriza a una persona a conducir.",
  }),
  editorial("SENSE-A1-000111", {
    translation: "identity card / ID card",
    shortUsage: "Documento oficial que identifica a una persona.",
  }),
  editorial("SENSE-A1-000121", { translation: "dinner" }),
  editorial("SENSE-A1-000137", { translation: "circus" }),
  editorial("SENSE-A1-000144", {
    translation: "postal code / ZIP code",
    shortUsage: "Código de números o letras que identifica una zona para el reparto del correo.",
  }),
  editorial("SENSE-A1-000156", { translation: "announcement / statement" }),
  editorial("SENSE-A1-000158", { translation: "concert" }),
  editorial("SENSE-A1-000167", { translation: "credit" }),
  editorial("SENSE-A1-000177", { translation: "bill / check / account" }),
  editorial("SENSE-A1-000180", { translation: "to work as / to be engaged in" }),
  editorial("SENSE-A1-000195", { translation: "director / manager" }),
  editorial("SENSE-A1-000200", { translation: "Mr. / Don" }),
  editorial("SENSE-A1-000202", { translation: "bedroom" }),
  editorial("SENSE-A1-000205", {
    translation: "DVD",
    partOfSpeechLabel: "Sustantivo",
  }),
  editorial("SENSE-A1-000212", {
    translation: "the weekend",
    shortUsage: "Se refiere normalmente al sábado y al domingo como periodo de descanso o tiempo libre.",
  }),
  editorial("SENSE-A1-000233", {
    shortUsage: "Practicar el deporte de deslizarse sobre la nieve con esquís.",
  }),
  editorial("SENSE-A1-000236", { translation: "postage stamp / stamp" }),
  editorial("SENSE-A1-000237", { translation: "shelf / shelving unit" }),
  editorial("SENSE-A1-000244", { translation: "euro" }),
  editorial("SENSE-A1-000255", {
    translation: "date of birth",
    shortUsage: "Fecha en la que nació una persona, normalmente indicada con día, mes y año.",
  }),
  editorial("SENSE-A1-000256", {
    shortUsage: "Expresión usada para felicitar a alguien por un logro, cumpleaños u otra ocasión positiva.",
  }),
  editorial("SENSE-A1-000269", { translation: "glasses / eyeglasses" }),
  editorial("SENSE-A1-000278", { translation: "bus" }),
  editorial("SENSE-A1-000281", {
    translation: "underscore",
    shortUsage: "Signo escrito «_», usado por ejemplo en nombres de usuario, direcciones y códigos.",
  }),
  editorial("SENSE-A1-000310", { translation: "interior / inside" }),
  editorial("SENSE-A1-000330", { translation: "to wash oneself / to wash up" }),
  editorial("SENSE-A1-000345", {
    translation: "place of birth",
    shortUsage: "Ciudad, región o país donde nació una persona.",
  }),
  editorial("SENSE-A1-000371", { translation: "waiter / server" }),
  editorial("SENSE-A1-000418", {
    shortUsage: "Expresión informal tomada del inglés y usada para mostrar aceptación, acuerdo o confirmación.",
  }),
  editorial("SENSE-A1-000436", { translation: "parking lot / car park" }),
  editorial("SENSE-A1-000456", {
    translation: "in the morning",
    shortUsage: "Sitúa una acción durante la parte del día que va desde que amanece hasta el mediodía.",
  }),
  editorial("SENSE-A1-000457", {
    shortUsage: "Sitúa una acción durante la noche.",
  }),
  editorial("SENSE-A1-000458", {
    translation: "in the afternoon / evening",
    shortUsage: "Sitúa una acción durante la parte del día posterior al mediodía y anterior a la noche.",
  }),
  editorial("SENSE-A1-000472", {
    translation: "first course / starter",
    shortUsage: "Primer plato de una comida servida en varios platos.",
  }),
  editorial("SENSE-A1-000481", { translation: "port / harbor" }),
  editorial("SENSE-A1-000495", { translation: "religion" }),
  editorial("SENSE-A1-000506", {
    translation: "living room",
    shortUsage: "Habitación de la casa usada para sentarse, conversar, descansar o recibir visitas.",
  }),
  editorial("SENSE-A1-000509", { translation: "living room / lounge" }),
  editorial("SENSE-A1-000514", {
    translation: "second course / main course",
    shortUsage: "Plato que se sirve después del primer plato; suele ser la parte principal de la comida.",
  }),
  editorial("SENSE-A1-000546", {
    translation: "credit card",
    shortUsage: "Tarjeta utilizada para pagar compras usando una línea de crédito.",
  }),
  editorial("SENSE-A1-000552", {
    translation: "landline / landline phone",
    shortUsage: "Teléfono conectado a una línea fija, en contraste con un teléfono móvil.",
  }),
  editorial("SENSE-A1-000553", {
    translation: "mobile phone / cell phone",
    shortUsage: "Teléfono portátil que funciona mediante una red móvil.",
  }),
  editorial("SENSE-A1-000565", {
    translation: "straight ahead",
    shortUsage: "Indica que hay que continuar en la misma dirección sin girar.",
  }),
  editorial("SENSE-A1-000575", { translation: "a / an / one" }),
  editorial("SENSE-A1-000576", {
    shortUsage: "Expresa una cantidad pequeña o un grado limitado: «Hablo un poco de español».",
  }),
  editorial("SENSE-A1-000591", { translation: "video" }),
  editorial("SENSE-A1-000596", { translation: "white wine" }),
  editorial("SENSE-A1-000597", { translation: "red wine" }),
  editorial("SENSE-A1-000603", { translation: "return / turn / lap" }),
  editorial("SENSE-A1-000604", { translation: "your (plural, informal; Spain)" }),
  editorial("SENSE-A1-000605", { translation: "website / web" }),

  // Canonical Sense-level disambiguation. These entries deliberately override
  // source glosses that were identical across distinct A1 Senses.
  editorial("SENSE-A1-000086", {
    translation: "coffee",
    shortUsage: "Bebida preparada con café; aquí «café» nombra la bebida, no el establecimiento.",
    examples: [
      { text: "Quiero un café, por favor.", translation: "I'd like a coffee, please." },
      { text: "Tomo café por la mañana.", translation: "I drink coffee in the morning." },
      { text: "El café está caliente.", translation: "The coffee is hot." },
    ],
  }),
  editorial("SENSE-A1-000087", {
    translation: "café / coffee shop",
    shortUsage: "Establecimiento donde se sirven café y otras bebidas; aquí «café» nombra el local.",
    examples: [
      { text: "Nos vemos en el café.", translation: "See you at the café." },
      { text: "Hay un café cerca de la escuela.", translation: "There is a café near the school." },
      { text: "El café cierra a las ocho.", translation: "The café closes at eight." },
    ],
  }),
  editorial("SENSE-A1-000385", {
    translation: "woman",
    shortUsage: "Persona adulta de sexo femenino.",
    examples: [
      { text: "Esa mujer es mi profesora.", translation: "That woman is my teacher." },
      { text: "Hay una mujer en la puerta.", translation: "There is a woman at the door." },
      { text: "La mujer lleva una chaqueta azul.", translation: "The woman is wearing a blue jacket." },
    ],
  }),
  editorial("SENSE-A1-000386", {
    translation: "wife / female partner",
    shortUsage: "En este sentido, «mujer» se refiere a la esposa o pareja femenina de alguien.",
    examples: [
      { text: "Ana es la mujer de Pablo.", translation: "Ana is Pablo's wife." },
      { text: "Vive con su mujer.", translation: "He lives with his wife." },
      { text: "Su mujer trabaja en un hospital.", translation: "His wife works in a hospital." },
    ],
  }),
  editorial("SENSE-A1-000422", {
    translation: "father / dad",
    shortUsage: "Progenitor masculino de una persona.",
    examples: [
      { text: "Mi padre se llama Luis.", translation: "My father's name is Luis." },
      { text: "Su padre trabaja en una escuela.", translation: "His father works at a school." },
      { text: "Ella vive con su padre.", translation: "She lives with her father." },
    ],
  }),
  editorial("SENSE-A1-000423", {
    translation: "parents",
    shortUsage: "En plural, «padres» puede referirse conjuntamente al padre y a la madre.",
    examples: [
      { text: "Mis padres viven en Bogotá.", translation: "My parents live in Bogotá." },
      { text: "Sus padres están casados.", translation: "His parents are married." },
      { text: "Voy al restaurante con mis padres.", translation: "I'm going to the restaurant with my parents." },
    ],
  }),

  // Existing rich reference that defines the current learner-facing visual contract.
  editorial("SENSE-A1-000292", {
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
  }),
] as const;

export const A1_EDITORIAL_ENRICHMENT_BY_SENSE = new Map(
  A1_EDITORIAL_ENRICHMENTS.map((entry) => [entry.senseId, entry] as const),
);
