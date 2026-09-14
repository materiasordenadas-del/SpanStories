import { practiceItemKey, type PracticeItem } from "./item.ts";
import type { PracticeOccurrence } from "./occurrence.ts";
import { practiceTargetKey } from "./target.ts";

/**
 * Conjugation practice: A1 verbs in the present indicative, practised as a
 * sentence with a blank — «Ellos ___ (venir) a clase en bici.».
 *
 * The catalog is the A1 verb list with one complement per verb that works for
 * every person. Verbs that only fit some persons (gustar, costar, llover,
 * nevar) carry their own frame per person instead.
 */

export type ConjugationPerson = 0 | 1 | 2 | 3 | 4 | 5;
export const CONJUGATION_PERSON_IDS: readonly ConjugationPerson[] = [0, 1, 2, 3, 4, 5];

export type ConjugationPersonInfo = { readonly label: string; readonly defaultOn: boolean; readonly tag?: string };

export const CONJUGATION_PERSONS: readonly ConjugationPersonInfo[] = [
  { label: "yo", defaultOn: true },
  { label: "tú", defaultOn: true },
  { label: "él / ella / usted", defaultOn: true },
  { label: "nosotros / nosotras", defaultOn: true },
  { label: "vosotros / vosotras", defaultOn: false, tag: "España" },
  { label: "ellos / ellas / ustedes", defaultOn: true },
];

type RegularGroup = "ar" | "er" | "ir";
export type VerbGroup = RegularGroup | "irr";
export type VerbCategory = VerbGroup | "refl";

export const VERB_GROUPS: readonly { readonly id: VerbGroup; readonly label: string }[] = [
  { id: "ar", label: "Regulares en -ar" },
  { id: "er", label: "Regulares en -er" },
  { id: "ir", label: "Regulares en -ir" },
  { id: "irr", label: "Irregulares y con cambio de raíz" },
];

export type ConjugationVerb = {
  readonly infinitive: string;
  readonly category: VerbCategory;
  /** Why the verb conjugates as it does, shown after answering. */
  readonly note: string;
  /** Extra instruction while answering, e.g. to write the pronoun too. */
  readonly hint?: string;
  /** Person labels for verbs not used with subject pronouns (gustar, weather verbs); null = no form. */
  readonly labels?: readonly (string | null)[];
  /** One entry per person: the accepted forms, or null when the person has no form. */
  readonly forms: readonly (readonly string[] | null)[];
};

const ENDINGS: Readonly<Record<RegularGroup, readonly string[]>> = {
  ar: ["o", "as", "a", "amos", "áis", "an"],
  er: ["o", "es", "e", "emos", "éis", "en"],
  ir: ["o", "es", "e", "imos", "ís", "en"],
};

function regularForms(infinitive: string): string[] {
  const stem = infinitive.slice(0, -2);
  return ENDINGS[infinitive.slice(-2) as RegularGroup].map((ending) => stem + ending);
}

const REGULAR: Readonly<Record<RegularGroup, string>> = {
  ar: "alquilar andar bailar cambiar cantar cenar comprar desayunar entrar escuchar estudiar firmar hablar llegar llevar nadar pagar practicar terminar trabajar viajar",
  er: "aprender beber comer comprender correr creer leer vender",
  ir: "abrir escribir vivir",
};

const REFLEXIVE = "bañarse dedicarse ducharse lavarse levantarse llamarse";
const REFLEXIVE_PRONOUNS = ["me", "te", "se", "nos", "os", "se"];

const IMPERSONAL_LABELS = [null, null, "impersonal", null, null, null];
const GUSTAR_LABELS = ["a mí", "a ti", "a él / ella / usted", "a nosotros / nosotras", "a vosotros / vosotras", "a ellos / ellas / ustedes"];

/** [infinitive, forms ("-" = none, "|" = alternatives), note, extra] */
const IRREGULAR: readonly (readonly [string, string, string, Pick<ConjugationVerb, "hint" | "labels">?])[] = [
  ["cerrar", "cierro,cierras,cierra,cerramos,cerráis,cierran", "Cambio de raíz e → ie"],
  ["conducir", "conduzco,conduces,conduce,conducimos,conducís,conducen", "Irregular en yo: conduzco"],
  ["conocer", "conozco,conoces,conoce,conocemos,conocéis,conocen", "Irregular en yo: conozco"],
  ["costar", "cuesto,cuestas,cuesta,costamos,costáis,cuestan", "Cambio de raíz o → ue"],
  ["empezar", "empiezo,empiezas,empieza,empezamos,empezáis,empiezan", "Cambio de raíz e → ie"],
  ["entender", "entiendo,entiendes,entiende,entendemos,entendéis,entienden", "Cambio de raíz e → ie"],
  ["esquiar", "esquío,esquías,esquía,esquiamos,esquiáis,esquían", "Lleva tilde en la í"],
  ["estar", "estoy,estás,está,estamos,estáis,están", "Irregular"],
  ["gustar", "me gusta|me gustan,te gusta|te gustan,le gusta|le gustan,nos gusta|nos gustan,os gusta|os gustan,les gusta|les gustan", "Se usa con me, te, le, nos, os, les",
    { hint: "Escribe el pronombre y el verbo: me gusta, te gusta…", labels: GUSTAR_LABELS }],
  ["haber", "he,has,ha,hemos,habéis,han", "Irregular. Forma impersonal: hay"],
  ["hacer", "hago,haces,hace,hacemos,hacéis,hacen", "Irregular en yo: hago"],
  ["ir", "voy,vas,va,vamos,vais,van", "Irregular"],
  ["jugar", "juego,juegas,juega,jugamos,jugáis,juegan", "Cambio de raíz u → ue"],
  ["llover", "-,-,llueve,-,-,-", "Impersonal, cambio o → ue", { hint: "Habla del tiempo: solo tiene una forma.", labels: IMPERSONAL_LABELS }],
  ["merendar", "meriendo,meriendas,merienda,merendamos,merendáis,meriendan", "Cambio de raíz e → ie"],
  ["nevar", "-,-,nieva,-,-,-", "Impersonal, cambio e → ie", { hint: "Habla del tiempo: solo tiene una forma.", labels: IMPERSONAL_LABELS }],
  ["poder", "puedo,puedes,puede,podemos,podéis,pueden", "Cambio de raíz o → ue"],
  ["preferir", "prefiero,prefieres,prefiere,preferimos,preferís,prefieren", "Cambio de raíz e → ie"],
  ["querer", "quiero,quieres,quiere,queremos,queréis,quieren", "Cambio de raíz e → ie"],
  ["repetir", "repito,repites,repite,repetimos,repetís,repiten", "Cambio de raíz e → i"],
  ["saber", "sé,sabes,sabe,sabemos,sabéis,saben", "Irregular en yo: sé"],
  ["salir", "salgo,sales,sale,salimos,salís,salen", "Irregular en yo: salgo"],
  ["ser", "soy,eres,es,somos,sois,son", "Irregular"],
  ["tener", "tengo,tienes,tiene,tenemos,tenéis,tienen", "Irregular"],
  ["venir", "vengo,vienes,viene,venimos,venís,vienen", "Irregular"],
  ["ver", "veo,ves,ve,vemos,veis,ven", "Irregular en yo: veo"],
  ["volver", "vuelvo,vuelves,vuelve,volvemos,volvéis,vuelven", "Cambio de raíz o → ue"],
];

function buildCatalog(): readonly ConjugationVerb[] {
  const verbs: ConjugationVerb[] = [];
  for (const group of ["ar", "er", "ir"] as const) {
    for (const infinitive of REGULAR[group].split(" ")) {
      verbs.push({ infinitive, category: group, note: `Regular en -${group}`, forms: regularForms(infinitive).map((form) => [form]) });
    }
  }
  for (const infinitive of REFLEXIVE.split(" ")) {
    verbs.push({
      infinitive,
      category: "refl",
      note: "Reflexivo, regular en -ar",
      hint: "Escribe también el pronombre: me, te, se, nos, os o se.",
      forms: regularForms(infinitive.slice(0, -2)).map((form, person) => [`${REFLEXIVE_PRONOUNS[person]} ${form}`]),
    });
  }
  for (const [infinitive, forms, note, extra] of IRREGULAR) {
    verbs.push({
      infinitive,
      category: "irr",
      note,
      ...extra,
      forms: forms.split(",").map((form) => form === "-" ? null : form.split("|")),
    });
  }
  return verbs.sort((a, b) => a.infinitive.localeCompare(b.infinitive, "es"));
}

/** The A1 verbs in the present indicative, in alphabetical order. */
export const A1_VERBS: readonly ConjugationVerb[] = buildCatalog();

const BY_INFINITIVE = new Map(A1_VERBS.map((verb) => [verb.infinitive, verb]));

export function findConjugationVerb(infinitive: string): ConjugationVerb | undefined {
  return BY_INFINITIVE.get(infinitive);
}

export function conjugationPersonLabel(verb: ConjugationVerb, person: ConjugationPerson): string {
  return verb.labels?.[person] ?? CONJUGATION_PERSONS[person].label;
}

/* ── sentences ── */

const SUBJECTS: readonly (readonly string[])[] = [["Yo"], ["Tú"], ["Él", "Ella", "Usted"], ["Nosotros", "Nosotras"], ["Vosotros", "Vosotras"], ["Ellos", "Ellas", "Ustedes"]];

/** A complement that works after every person of the verb. */
const COMPLEMENTS: Readonly<Record<string, string>> = {
  abrir: "la ventana", alquilar: "un piso en el centro", andar: "por el parque", aprender: "palabras nuevas",
  bailar: "salsa los sábados", bañarse: "en el mar", beber: "agua con la comida", cambiar: "dinero en el banco",
  cantar: "en el coche", cenar: "a las nueve", cerrar: "la puerta", comer: "fruta todos los días",
  comprar: "pan por la mañana", comprender: "la pregunta", conducir: "con cuidado", conocer: "a Marta",
  correr: "por la playa", creer: "en la suerte", dedicarse: "a la música", desayunar: "café con leche",
  ducharse: "por la mañana", empezar: "a trabajar a las nueve", entender: "el ejercicio", entrar: "en la biblioteca",
  escribir: "un correo", escuchar: "música en casa", esquiar: "en invierno", estar: "en casa",
  estudiar: "español por la tarde", firmar: "el contrato", haber: "terminado la tarea", hablar: "con la profesora",
  hacer: "la cena", ir: "al cine los viernes", jugar: "al fútbol", lavarse: "las manos",
  leer: "el periódico", levantarse: "temprano", llamarse: "García", llegar: "tarde a clase",
  llevar: "una mochila azul", merendar: "fruta a las cinco", nadar: "en la piscina", pagar: "con tarjeta",
  poder: "venir mañana", practicar: "deporte los domingos", preferir: "el té", querer: "un café",
  repetir: "la frase", saber: "nadar", salir: "de casa a las ocho", ser: "de México",
  tener: "dos hermanos", terminar: "el trabajo a las cinco", trabajar: "en una oficina", vender: "ropa en el mercado",
  venir: "a clase en bici", ver: "la televisión", viajar: "en tren", vivir: "en Bogotá", volver: "a casa en autobús",
};

/** Text before and after the blank; `pick` narrows the accepted alternatives to one. */
type Frame = { readonly before: string; readonly after: string; readonly pick?: number };

/** Verbs that only fit some persons, each with its own sentence. */
const PERSON_FRAMES: Readonly<Record<string, Partial<Record<ConjugationPerson, Frame>>>> = {
  costar: { 2: { before: "El billete", after: "diez euros" }, 5: { before: "Los zapatos", after: "cincuenta euros" } },
  gustar: {
    0: { before: "A mí", after: "el chocolate", pick: 0 },
    1: { before: "A ti", after: "los perros", pick: 1 },
    2: { before: "A ella", after: "bailar", pick: 0 },
    3: { before: "A nosotros", after: "las películas de miedo", pick: 1 },
    4: { before: "A vosotras", after: "el café", pick: 0 },
    5: { before: "A ellos", after: "los museos", pick: 1 },
  },
  llover: { 2: { before: "En abril", after: "mucho" } },
  nevar: { 2: { before: "En invierno", after: "en la montaña" } },
};

/** True when the verb has a form and a sentence for this person. */
export function hasConjugationSentence(verb: ConjugationVerb, person: ConjugationPerson): boolean {
  if (verb.forms[person] === null) return false;
  const frames = PERSON_FRAMES[verb.infinitive];
  return frames === undefined ? COMPLEMENTS[verb.infinitive] !== undefined : frames[person] !== undefined;
}

export type ConjugationQuestion = {
  readonly infinitive: string;
  readonly person: ConjugationPerson;
  /** Text before the blank, subject included. */
  readonly before: string;
  /** Text after the blank, final punctuation included. */
  readonly after: string;
  /** Forms that complete the sentence; the first one is the model answer. */
  readonly accepted: readonly string[];
};

export function buildConjugationQuestion(verb: ConjugationVerb, person: ConjugationPerson, random: () => number = Math.random): ConjugationQuestion | null {
  const forms = verb.forms[person];
  if (forms === null || !hasConjugationSentence(verb, person)) return null;
  const frame = PERSON_FRAMES[verb.infinitive]?.[person];
  if (frame !== undefined) {
    return { infinitive: verb.infinitive, person, before: frame.before, after: `${frame.after}.`, accepted: frame.pick === undefined ? forms : [forms[frame.pick]] };
  }
  const subjects = SUBJECTS[person];
  const subject = subjects[Math.min(subjects.length - 1, Math.floor(random() * subjects.length))];
  return { infinitive: verb.infinitive, person, before: subject, after: `${COMPLEMENTS[verb.infinitive]}.`, accepted: forms };
}

export function sentenceWithAnswer(question: ConjugationQuestion, form: string = question.accepted[0]): string {
  return `${question.before} ${form} ${question.after}`;
}

/* ── settings and pool ── */

export type ConjugationSettings = {
  readonly groups: Readonly<Record<VerbGroup, boolean>>;
  readonly reflexive: boolean;
  /** One flag per person, in CONJUGATION_PERSONS order. */
  readonly persons: readonly boolean[];
  /** Infinitives the learner limited the practice to; null = every verb of the chosen types. */
  readonly verbs: readonly string[] | null;
  /** Number of questions in a session. */
  readonly length: number;
};

export function isVerbTypeOn(settings: Pick<ConjugationSettings, "groups" | "reflexive">, verb: ConjugationVerb): boolean {
  return verb.category === "refl" ? settings.reflexive : settings.groups[verb.category];
}

export type ConjugationPair = { readonly infinitive: string; readonly person: ConjugationPerson };

/** Every verb and person the settings allow that has a sentence. */
export function buildConjugationPool(settings: ConjugationSettings): { readonly pairs: readonly ConjugationPair[]; readonly verbCount: number } {
  const only = settings.verbs === null ? null : new Set(settings.verbs);
  const pairs: ConjugationPair[] = [];
  const verbs = new Set<string>();
  for (const verb of A1_VERBS) {
    if (!isVerbTypeOn(settings, verb) || (only !== null && !only.has(verb.infinitive))) continue;
    for (const person of CONJUGATION_PERSON_IDS) {
      if (!settings.persons[person] || !hasConjugationSentence(verb, person)) continue;
      pairs.push({ infinitive: verb.infinitive, person });
      verbs.add(verb.infinitive);
    }
  }
  return { pairs, verbCount: verbs.size };
}

/* ── answers ── */

const normalize = (text: string) => text.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
/** Without accents or tildes: «Casi» means the letters are right and only the marks differ. */
export const withoutMarks = (text: string) => normalize(text).normalize("NFD").replace(/\p{M}/gu, "");

export type ConjugationCheck = { readonly correct: boolean; readonly accentsOnly: boolean };

export function checkConjugationAnswer(question: ConjugationQuestion, response: string): ConjugationCheck {
  const given = normalize(response);
  if (given === "") return { correct: false, accentsOnly: false };
  const correct = question.accepted.some((form) => normalize(form) === given);
  const accentsOnly = !correct && question.accepted.some((form) => withoutMarks(form) === withoutMarks(given));
  return { correct, accentsOnly };
}

/* ── verb table ── */

export type ConjugationFormPart = { readonly text: string; readonly irregular: boolean };
export type ConjugationTableRow = {
  readonly person: ConjugationPerson;
  readonly label: string;
  readonly alternatives: readonly (readonly ConjugationFormPart[])[];
};

/** Splits a form so the letters that break the regular pattern can be marked. */
function formParts(verb: ConjugationVerb, person: ConjugationPerson, form: string): ConjugationFormPart[] {
  const words = form.split(" ");
  const word = words.pop() ?? "";
  const lead = words.length > 0 ? [{ text: `${words.join(" ")} `, irregular: false }] : [];
  const base = verb.infinitive.replace(/se$/, "");
  const group = base.slice(-2);
  if (verb.category !== "irr" || verb.infinitive === "gustar" || !(group in ENDINGS)) return [...lead, { text: word, irregular: false }];

  const regular = base.slice(0, -2) + ENDINGS[group as RegularGroup][person];
  let head = 0;
  while (head < word.length && head < regular.length && word[head] === regular[head]) head += 1;
  let tail = 0;
  while (tail < word.length - head && tail < regular.length - head && word[word.length - 1 - tail] === regular[regular.length - 1 - tail]) tail += 1;
  if (head + tail >= word.length) return [...lead, { text: word, irregular: false }];
  return [
    ...lead,
    { text: word.slice(0, head), irregular: false },
    { text: word.slice(head, word.length - tail), irregular: true },
    { text: word.slice(word.length - tail), irregular: false },
  ].filter((part) => part.text !== "");
}

export function conjugationTable(verb: ConjugationVerb): { readonly rows: readonly ConjugationTableRow[]; readonly hasIrregular: boolean } {
  const rows = CONJUGATION_PERSON_IDS.flatMap((person): ConjugationTableRow[] => {
    const forms = verb.forms[person];
    if (forms === null) return [];
    return [{ person, label: conjugationPersonLabel(verb, person), alternatives: forms.map((form) => formParts(verb, person, form)) }];
  });
  const hasIrregular = rows.some((row) => row.alternatives.some((parts) => parts.some((part) => part.irregular)));
  return { rows, hasIrregular };
}

/* ── verbs from the learner's stories ── */

/**
 * A1 verbs among the saved words, in catalog order. A saved item counts when
 * one of its published occurrences has a lemma in the catalog; the lemma is
 * only used to find the verb, never as the item's identity.
 */
export function savedConjugationVerbs(items: readonly PracticeItem[], occurrences: readonly PracticeOccurrence[]): readonly string[] {
  const saved = new Set(items.map(practiceItemKey));
  const lemmas = new Set(occurrences.filter((occurrence) => saved.has(practiceTargetKey(occurrence.target))).map((occurrence) => occurrence.lemma.trim()));
  return A1_VERBS.filter((verb) => lemmas.has(verb.infinitive)).map((verb) => verb.infinitive);
}
