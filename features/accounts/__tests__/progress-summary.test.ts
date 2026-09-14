import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  activityText,
  finishedCount,
  practiceAccuracy,
  practiceTotals,
  repeatedMistakes,
  type PracticeEvent,
  type ProgressEvent,
} from "../progress-summary.ts";

const practice = (id: string, overrides: Partial<PracticeEvent>): PracticeEvent => ({
  id, kind: "practice", mode: "verbos", total: 0, correct: 0, incorrect: 0, revealed: 0, misses: [], at: null, ...overrides,
});

describe("accounts / progress summary", () => {
  test("adds practice per mode and ignores stories", () => {
    const events: ProgressEvent[] = [
      practice("a", { mode: "tarjetas", total: 5, correct: 3, incorrect: 1, revealed: 1 }),
      { id: "s", kind: "story", story: "05/01", at: null },
      practice("b", { mode: "tarjetas", total: 4, correct: 4 }),
      practice("c", { mode: "verbos", total: 10, correct: 6, incorrect: 4 }),
    ];
    const totals = practiceTotals(events);
    assert.deepEqual(totals.tarjetas, { sessions: 2, correct: 7, incorrect: 1, revealed: 1 });
    assert.deepEqual(totals.verbos, { sessions: 1, correct: 6, incorrect: 4, revealed: 0 });
    assert.equal(practiceAccuracy(events), Math.round((13 / 19) * 100));
  });

  test("no practice means no accuracy, never 0 %", () => {
    assert.equal(practiceAccuracy([{ id: "s", kind: "story", story: "05/01", at: null }]), null);
  });

  test("groups repeated mistakes, most repeated first, keeping the latest answer", () => {
    const miss = (response: string) => ({ prompt: "Ellos ___ en casa. (estar)", response, answer: "están", accentsOnly: response === "estan" });
    const events = [
      practice("new", { misses: [miss("estan"), { prompt: "Yo ___ de México. (ser)", response: "", answer: "soy", accentsOnly: false }] }),
      practice("old", { misses: [miss("estás")] }),
    ];
    const mistakes = repeatedMistakes(events);
    assert.equal(mistakes.length, 2);
    assert.equal(mistakes[0].times, 2);
    assert.equal(mistakes[0].response, "estan");
    assert.equal(mistakes[0].accentsOnly, true);
    assert.equal(mistakes[1].answer, "soy");
  });

  test("describes activity in plain Spanish", () => {
    const title = (key: string) => (key === "05/01" ? "Primer día en la escuela" : undefined);
    assert.equal(activityText({ id: "s", kind: "story", story: "05/01", at: null }, title), "Terminó de leer «Primer día en la escuela»");
    assert.equal(activityText({ id: "x", kind: "story", story: "09/09", at: null }, title), "Terminó de leer una historia");
    assert.equal(activityText(practice("v", { total: 12, correct: 10, incorrect: 2 }), title), "Practicó verbos: 12 frases, 10 aciertos");
    assert.equal(activityText(practice("t", { mode: "tarjetas", total: 1, correct: 1 }), title), "Practicó tarjetas: 1 tarjeta, 1 acierto");
  });

  test("counts only finished stories that are still published", () => {
    assert.equal(finishedCount(["05/01", "05/01", "99/01"], new Set(["05/01", "05/02"])), 1);
  });
});
