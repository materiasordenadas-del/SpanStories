import { test } from "node:test";
import assert from "node:assert/strict";
import { makeKnowledgeExercise, normalizePracticeAnswer, isKnowledgeAnswerCorrect } from "../engine/knowledge-practice.ts";
import { lexicalOccurrence, practiceOccurrence, originOf, SAVED_AT } from "./fixtures.ts";
import { createPracticeItem } from "../domain/item.ts";
import { projectKnowledge } from "../../learner-progress/engine/knowledge-projection.ts";
import { practiceTargetKey } from "../domain/target.ts";
import { learnerPracticeStorageKey } from "../repository/learner-storage-key.ts";
import { LocalStoragePracticeItemRepository } from "../repository/local-storage-practice-item-repository.ts";
import { FakeStorage } from "./fixtures.ts";

const source = lexicalOccurrence({ id: "occ-k1", surface: "hermanos", lexemeId: "LEX-A1-000001", senseId: "SENSE-A1-000001", status: "RESOLVED" });
const occurrence = practiceOccurrence(source, { lemma: "hermano", translation: "brother" });
const item = createPracticeItem({ target: occurrence.target, savedFrom: originOf(source), savedAt: SAVED_AT });
const projection = projectKnowledge([], "ana", practiceTargetKey(item.target), true, SAVED_AT.toISOString());
const distractors = ["madre", "padre", "abuela"].map((lemma, i) => practiceOccurrence(lexicalOccurrence({ id: `occ-k${i + 2}`, surface: lemma,
  lexemeId: `LEX-A1-00000${i + 2}`, senseId: `SENSE-A1-00000${i + 2}`, status: "RESOLVED" }), { lemma, translation: ["mother", "father", "grandmother"][i] }));

test("recognition has distinct choices, including editorial options for a small published pool", () => {
  const exercise = makeKnowledgeExercise(item, [occurrence, ...distractors], projection, [], "recognition")!;
  assert.equal(exercise.evidence, "RECOGNITION");
  assert.equal(new Set(exercise.choices).size, 4);
  assert.ok(exercise.choices.includes("brother"));
  assert.equal(makeKnowledgeExercise(item, [occurrence], projection, [], "recognition")!.evidence, "RECOGNITION");
});
test("cloze hides the real occurrence and asks for its inflected form", () => {
  const exercise = makeKnowledgeExercise(item, [occurrence], projection, [], "cloze")!;
  assert.equal(exercise.type, "cloze");
  assert.equal(exercise.answer, "hermanos");
  assert.ok(!exercise.prompt.includes("hermanos"));
  assert.equal(exercise.occurrence.occurrenceId, source.id);
});
test("receptive recall asks for meaning and productive recall asks for Spanish form", () => {
  assert.equal(makeKnowledgeExercise(item, [{ ...occurrence, productive: false }], projection, [], "recall")!.evidence, "MEANING_RECALL");
  assert.equal(makeKnowledgeExercise(item, [occurrence], projection, [], "recall")!.answer, "hermano");
  const synonyms = makeKnowledgeExercise(item, [{ ...occurrence, translation: "brother / sibling", productive: false }], projection, [], "recall")!;
  assert.ok(isKnowledgeAnswerCorrect(synonyms, "brother"));
  assert.ok(isKnowledgeAnswerCorrect(synonyms, "sibling"));
});
test("a sibling sense and unpublished content cannot supply an answer", () => {
  assert.equal(makeKnowledgeExercise(item, distractors, projection, [], "recall"), null);
  assert.equal(makeKnowledgeExercise(item, [{ ...occurrence, translation: undefined }], projection, [], "recall"), null);
});
test("checking preserves accents and ñ while allowing case, whitespace and Unicode normalization", () => {
  assert.equal(normalizePracticeAnswer("  AÑO  "), normalizePracticeAnswer("an\u0303o"));
  assert.notEqual(normalizePracticeAnswer("año"), normalizePracticeAnswer("ano"));
  assert.notEqual(normalizePracticeAnswer("está"), normalizePracticeAnswer("esta"));
});

test("two student accounts and the guest retain separate saved vocabularies after reload", async () => {
  const storage = new FakeStorage();
  const repo = (owner: string) => new LocalStoragePracticeItemRepository(storage, learnerPracticeStorageKey(owner));
  await repo("guest").save(item);
  assert.equal((await repo("user:ana").list()).length, 0);
  await repo("user:ana").save(item);
  assert.equal((await repo("user:bob").list()).length, 0);
  await repo("user:ana").remove(item.target);
  assert.equal((await repo("guest").list()).length, 1);
  assert.equal((await repo("user:ana").list()).length, 0);
});
