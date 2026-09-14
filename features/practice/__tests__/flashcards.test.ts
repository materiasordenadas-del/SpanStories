import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  InMemoryPracticeItemRepository,
  PRACTICE_MODES,
  buildFlashcard,
  buildFlashcardDeck,
  checkFlashcardAnswer,
  collectPracticeOccurrences,
  createPracticeItem,
  currentFlashcard,
  currentFlashcardAttempt,
  nextFlashcard,
  practiceTargetOf,
  readerWordPractice,
  revealFlashcardAnswer,
  startFlashcardSession,
  submitFlashcardAnswer,
  summarizeFlashcardSession,
  summarizePractice,
  type PracticeItem,
} from "../index.ts";
import type { LexicalOccurrence } from "../../story-engine/index.ts";
import { getStoryOneReaderViewModel } from "../../story-reader/story-one.ts";
import { SAVED_AT, lexicalOccurrence, originOf, practiceOccurrence } from "./fixtures.ts";

const hola1 = lexicalOccurrence({ id: "occ-hola-1", surface: "Hola", lexemeId: "LEX-A1-000287", senseId: "SENSE-A1-000292", status: "RESOLVED" });
const hola2 = lexicalOccurrence({ id: "occ-hola-2", surface: "Hola", lexemeId: "LEX-A1-000287", senseId: "SENSE-A1-000292", status: "RESOLVED" });
const soy = lexicalOccurrence({ id: "occ-soy", surface: "soy", lexemeId: "LEX-A1-000511", senseId: "SENSE-A1-000520", status: "RESOLVED" });
const el1 = lexicalOccurrence({ id: "occ-el-1", surface: "El", lexemeId: "LEX-A1-000206", senseId: null, status: "UNRESOLVED" });
const el2 = lexicalOccurrence({ id: "occ-el-2", surface: "el", lexemeId: "LEX-A1-000206", senseId: null, status: "UNRESOLVED" });

const occurrences = [
  practiceOccurrence(hola1, { lemma: "hola", translation: "hello / hi", partOfSpeechLabel: "Interjección", cefrLevel: "A1" }),
  practiceOccurrence(hola2, { lemma: "hola", cefrLevel: "A1" }),
  practiceOccurrence(soy, { lemma: "ser", cefrLevel: "A1" }),
  practiceOccurrence(el1, { lemma: "el", partOfSpeechLabel: "Artículo" }),
  practiceOccurrence(el2, { lemma: "el", translation: "the", partOfSpeechLabel: "Artículo", image: { src: "/test/el.png", alt: "Un artículo" } }),
];

function itemFrom(occurrence: LexicalOccurrence): PracticeItem {
  const target = practiceTargetOf(occurrence);
  assert.ok(target);
  return createPracticeItem({ target, savedAt: SAVED_AT, savedFrom: originOf(occurrence) });
}

describe("practice / flashcard deck", () => {
  test("eligible PracticeItems make the deck; the rest stay saved but out of it", async () => {
    const repository = new InMemoryPracticeItemRepository();
    for (const occurrence of [hola1, soy, el1]) await repository.save(itemFrom(occurrence));
    const items = await repository.list();
    const deck = buildFlashcardDeck(items, occurrences);
    assert.deepEqual(deck.map((card) => card.answer), ["hola"]);
    assert.deepEqual(summarizePractice(items, occurrences), { savedCount: 3, flashcardEligibleCount: 1 });
    assert.equal(PRACTICE_MODES.find((mode) => mode.id === "flashcards")?.countAvailable(items, occurrences), 1);
    assert.equal((await repository.list()).length, 3, "building a deck never removes saved items");
  });

  test("a card is built only from published content", () => {
    assert.deepEqual(buildFlashcard(itemFrom(hola1), occurrences), {
      key: "SENSE:SENSE-A1-000292",
      prompt: "hello / hi",
      answer: "hola",
      details: ["Interjección", "A1"],
      context: occurrences[0].context,
    });
    assert.equal(buildFlashcard(itemFrom(soy), occurrences), null, "no published translation, no card");
  });

  test("a Sense item can take its translation from another occurrence of the same Sense", () => {
    const card = buildFlashcard(itemFrom(hola2), occurrences);
    assert.equal(card?.prompt, "hello / hi");
    assert.equal(card?.context, occurrences[1].context, "the context stays where the word was saved");
  });

  test("a Lexeme item never borrows a translation from another occurrence", () => {
    assert.equal(buildFlashcard(itemFrom(el1), occurrences), null);
    const card = buildFlashcard(itemFrom(el2), occurrences);
    assert.equal(card?.prompt, "the");
    assert.deepEqual(card?.image, { src: "/test/el.png", alt: "Un artículo" }, "an image appears only when one is published");
  });

  test("the deck keeps the order in which words were saved", () => {
    assert.deepEqual(buildFlashcardDeck([itemFrom(el2), itemFrom(hola1)], occurrences).map((card) => card.answer), ["el", "hola"]);
  });
});

describe("practice / flashcard session", () => {
  const deck = buildFlashcardDeck([itemFrom(hola1), itemFrom(el2)], occurrences);

  test("a correct answer ignores case and surrounding punctuation", () => {
    const session = submitFlashcardAnswer(startFlashcardSession(deck), "  ¡Hola! ");
    assert.equal(session.status, "FEEDBACK");
    assert.deepEqual(currentFlashcardAttempt(session), { cardKey: "SENSE:SENSE-A1-000292", outcome: "CORRECT", response: "¡Hola!", accentsOnly: false });
  });

  test("an incorrect answer is recorded and the card still holds the right answer", () => {
    const session = submitFlashcardAnswer(startFlashcardSession(deck), "adiós");
    assert.equal(currentFlashcardAttempt(session)?.outcome, "INCORRECT");
    assert.equal(currentFlashcardAttempt(session)?.response, "adiós");
    assert.equal(currentFlashcard(session)?.answer, "hola");
  });

  test("accents and ñ matter, but a near miss is flagged", () => {
    assert.deepEqual(checkFlashcardAnswer("señor", "senor"), { correct: false, accentsOnly: true });
    assert.deepEqual(checkFlashcardAnswer("está", "Está."), { correct: true, accentsOnly: false });
    assert.deepEqual(checkFlashcardAnswer("está", "estar"), { correct: false, accentsOnly: false });
  });

  test("a blank answer is ignored", () => {
    const session = startFlashcardSession(deck);
    assert.equal(submitFlashcardAnswer(session, "   "), session);
  });

  test("«No lo sé» reveals the answer", () => {
    const session = revealFlashcardAnswer(startFlashcardSession(deck));
    assert.equal(session.status, "FEEDBACK");
    assert.deepEqual(currentFlashcardAttempt(session), { cardKey: "SENSE:SENSE-A1-000292", outcome: "REVEALED", response: null, accentsOnly: false });
    assert.equal(submitFlashcardAnswer(session, "hola"), session, "a revealed card cannot be answered again");
  });

  test("«Siguiente» moves to the next card", () => {
    const answering = startFlashcardSession(deck);
    assert.equal(nextFlashcard(answering), answering, "there is no next before answering");
    const next = nextFlashcard(submitFlashcardAnswer(answering, "hola"));
    assert.equal(next.status, "ANSWERING");
    assert.equal(currentFlashcard(next)?.answer, "el");
    assert.equal(currentFlashcardAttempt(next), undefined);
  });

  test("the session ends after the last card", () => {
    const first = nextFlashcard(submitFlashcardAnswer(startFlashcardSession(deck), "hola"));
    const finished = nextFlashcard(revealFlashcardAnswer(first));
    assert.equal(finished.status, "FINISHED");
    assert.equal(currentFlashcard(finished), undefined);
    assert.deepEqual(summarizeFlashcardSession(finished), { total: 2, correct: 1, incorrect: 0, revealed: 1 });
    assert.equal(submitFlashcardAnswer(finished, "el"), finished);
    assert.equal(startFlashcardSession([]).status, "FINISHED");
  });
});

describe("practice / Historia 1", () => {
  test("both «Hola» save one Sense item, and only published translations reach the deck", async () => {
    const model = await getStoryOneReaderViewModel();
    const repository = new InMemoryPracticeItemRepository();
    const selected = Object.values(model.lexicalEntries).filter((entry) => ["Hola", "soy", "Soy", "es"].includes(entry.surface));
    assert.equal(selected.length, 7, "two «Hola» and five forms of ser");
    for (const entry of selected) {
      const word = readerWordPractice(model, entry.occurrenceId);
      assert.ok(word, `${entry.surface} has a lexical identity`);
      await repository.save(createPracticeItem({ target: word.target, savedAt: SAVED_AT, savedFrom: word.savedFrom }));
    }
    const items = await repository.list();
    assert.deepEqual(items.map((item) => item.target), [
      { type: "SENSE", senseId: "SENSE-A1-000292", lexemeId: "LEX-A1-000287" },
      { type: "SENSE", senseId: "SENSE-A1-000520", lexemeId: "LEX-A1-000511" },
    ]);
    const deck = buildFlashcardDeck(items, collectPracticeOccurrences(model));
    assert.deepEqual(deck.map((card) => [card.prompt, card.answer, card.details]), [["hello / hi", "hola", ["Interjección", "A1"]]]);
    assert.equal(deck[0].image, undefined, "a scene illustration is not used as a word image");
  });

  test("surface tokens without a Lexeme can still be saved, by their exact selection", async () => {
    const model = await getStoryOneReaderViewModel();
    const tokenIds = Object.keys(model.surfaceEntries);
    assert.ok(tokenIds.length > 0);
    for (const id of tokenIds) {
      const word = readerWordPractice(model, id);
      assert.ok(word, `token ${id} should be saveable`);
      assert.equal(word.target.type, "UNRESOLVED_SURFACE");
    }
    const repository = new InMemoryPracticeItemRepository();
    const first = readerWordPractice(model, tokenIds[0]);
    assert.ok(first);
    const saved = await repository.save(createPracticeItem({ target: first.target, savedAt: SAVED_AT, savedFrom: first.savedFrom }));
    assert.equal(await repository.has(first.target), true);
    assert.equal(saved.savedFrom?.occurrenceId, tokenIds[0]);
  });
});
