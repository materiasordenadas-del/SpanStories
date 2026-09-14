import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  A1_VERBS,
  CONJUGATION_PERSON_IDS,
  PRACTICE_MODES,
  buildConjugationPool,
  buildConjugationQuestion,
  checkConjugationAnswer,
  conjugationTable,
  createPracticeItem,
  currentConjugationAttempt,
  currentConjugationQuestion,
  findConjugationVerb,
  hasConjugationSentence,
  nextConjugationQuestion,
  practiceTargetOf,
  revealConjugationAnswer,
  savedConjugationVerbs,
  startConjugationSession,
  submitConjugationAnswer,
  summarizeConjugationSession,
  type ConjugationSettings,
  type ConjugationSession,
} from "../index.ts";
import { SAVED_AT, lexicalOccurrence, originOf, practiceOccurrence } from "./fixtures.ts";

const DEFAULTS: ConjugationSettings = {
  groups: { ar: true, er: true, ir: true, irr: true },
  reflexive: false,
  persons: [true, true, true, true, false, true],
  verbs: null,
  length: 10,
};

/** Deterministic random numbers so sessions can be asserted. */
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function verb(infinitive: string) {
  const found = findConjugationVerb(infinitive);
  assert.ok(found, infinitive);
  return found;
}

describe("practice / conjugation catalog", () => {
  test("65 A1 verbs, six persons each, and every verb has at least one sentence", () => {
    assert.equal(A1_VERBS.length, 65);
    for (const entry of A1_VERBS) {
      assert.equal(entry.forms.length, 6, entry.infinitive);
      assert.ok(CONJUGATION_PERSON_IDS.some((person) => hasConjugationSentence(entry, person)), `${entry.infinitive} has no sentence`);
    }
  });

  test("weather verbs only exist in the third person", () => {
    assert.deepEqual(CONJUGATION_PERSON_IDS.filter((person) => hasConjugationSentence(verb("llover"), person)), [2]);
  });

  test("a sentence frame can narrow gustar to the form that agrees", () => {
    const question = buildConjugationQuestion(verb("gustar"), 1);
    assert.deepEqual(question, { infinitive: "gustar", person: 1, before: "A ti", after: "los perros.", accepted: ["te gustan"] });
  });
});

describe("practice / conjugation pool", () => {
  test("defaults leave out vosotros and reflexive verbs", () => {
    const { pairs } = buildConjugationPool(DEFAULTS);
    assert.ok(pairs.every((pair) => pair.person !== 4));
    assert.ok(!pairs.some((pair) => pair.infinitive === "llamarse"));
  });

  test("a verb list limits the pool to those verbs", () => {
    const pool = buildConjugationPool({ ...DEFAULTS, verbs: ["ser", "hablar"] });
    assert.equal(pool.verbCount, 2);
    assert.equal(pool.pairs.length, 10);
  });

  test("types still apply to a chosen list", () => {
    assert.equal(buildConjugationPool({ ...DEFAULTS, verbs: ["llamarse"] }).pairs.length, 0);
    assert.equal(buildConjugationPool({ ...DEFAULTS, reflexive: true, verbs: ["llamarse"] }).verbCount, 1);
  });
});

describe("practice / conjugation answers", () => {
  const question = buildConjugationQuestion(verb("tener"), 0, () => 0);
  assert.ok(question);

  test("case and extra spaces do not matter", () => {
    assert.deepEqual(checkConjugationAnswer(question, "  Tengo "), { correct: true, accentsOnly: false });
  });

  test("a form wrong only in its accents is flagged as almost", () => {
    const esquiar = buildConjugationQuestion(verb("esquiar"), 0, () => 0);
    assert.ok(esquiar);
    assert.deepEqual(checkConjugationAnswer(esquiar, "esquio"), { correct: false, accentsOnly: true });
    assert.deepEqual(checkConjugationAnswer(question, "teno"), { correct: false, accentsOnly: false });
  });

  test("the table marks the letters that break the regular pattern", () => {
    const { rows, hasIrregular } = conjugationTable(verb("tener"));
    assert.ok(hasIrregular);
    assert.deepEqual(rows[0].alternatives[0], [{ text: "ten", irregular: false }, { text: "g", irregular: true }, { text: "o", irregular: false }]);
    assert.equal(conjugationTable(verb("hablar")).hasIrregular, false);
  });
});

describe("practice / conjugation session", () => {
  test("draws the requested length without repeating a verb back to back", () => {
    const session = startConjugationSession({ ...DEFAULTS, verbs: ["ser", "hablar", "vivir"], length: 20 }, seeded());
    assert.ok(session);
    assert.equal(session.questions.length, 20);
    for (let i = 1; i < session.questions.length; i += 1) {
      assert.notEqual(session.questions[i].infinitive, session.questions[i - 1].infinitive, `question ${i}`);
    }
  });

  test("nothing to practise gives no session", () => {
    assert.equal(startConjugationSession({ ...DEFAULTS, persons: [false, false, false, false, false, false] }), null);
  });

  test("answers move through feedback, keep a streak and summarize the misses", () => {
    let session = startConjugationSession({ ...DEFAULTS, verbs: ["ser"], persons: [true, false, false, false, false, false], length: 3 }, seeded()) as ConjugationSession;
    assert.equal(submitConjugationAnswer(session, "   "), session, "a blank answer changes nothing");

    session = submitConjugationAnswer(session, "soy");
    assert.equal(session.status, "FEEDBACK");
    assert.equal(currentConjugationAttempt(session)?.outcome, "CORRECT");
    assert.equal(session.streak, 1);

    session = submitConjugationAnswer(nextConjugationQuestion(session), "es");
    assert.equal(currentConjugationAttempt(session)?.outcome, "INCORRECT");
    assert.equal(session.streak, 0);

    session = revealConjugationAnswer(nextConjugationQuestion(session));
    assert.equal(currentConjugationAttempt(session)?.outcome, "REVEALED");

    session = nextConjugationQuestion(session);
    assert.equal(session.status, "FINISHED");
    assert.equal(currentConjugationQuestion(session), undefined);
    const summary = summarizeConjugationSession(session);
    assert.equal(summary.total, 3);
    assert.equal(summary.correct, 1);
    assert.deepEqual(summary.misses.map((miss) => miss.response), ["es", ""]);
  });
});

describe("practice / verbs from saved words", () => {
  const soy = lexicalOccurrence({ id: "occ-soy", surface: "soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520", status: "RESOLVED" });
  const hola = lexicalOccurrence({ id: "occ-hola", surface: "Hola", lexemeId: "LEX-A1-000287", senseId: "SENSE-A1-000292", status: "RESOLVED" });
  const tengo = lexicalOccurrence({ id: "occ-tengo", surface: "tengo", lexemeId: "LEX-A1-000600", senseId: null, status: "UNRESOLVED" });
  const occurrences = [
    practiceOccurrence(soy, { lemma: "ser" }),
    practiceOccurrence(hola, { lemma: "hola" }),
    practiceOccurrence(tengo, { lemma: "tener" }),
  ];
  const save = (occurrence: typeof soy) => {
    const target = practiceTargetOf(occurrence);
    assert.ok(target);
    return createPracticeItem({ target, savedAt: SAVED_AT, savedFrom: originOf(occurrence) });
  };

  test("only saved words whose lemma is an A1 verb count, in catalog order", () => {
    const items = [save(soy), save(hola), save(tengo)];
    assert.deepEqual(savedConjugationVerbs(items, occurrences), ["ser", "tener"]);
    assert.equal(PRACTICE_MODES.find((mode) => mode.id === "conjugacion")?.countAvailable(items, occurrences), 2);
    assert.deepEqual(savedConjugationVerbs([save(hola)], occurrences), []);
  });
});
