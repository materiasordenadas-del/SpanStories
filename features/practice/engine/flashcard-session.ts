import type { Flashcard } from "../domain/flashcard.ts";

/**
 * One pass through a flashcard deck with written recall.
 *
 *   ANSWERING --submit / reveal--> FEEDBACK --next--> ANSWERING … --next--> FINISHED
 *
 * Pure and immutable: every step returns a new session, and a step that does
 * not apply to the current status returns the same session unchanged. No
 * scheduling, scores or mastery live here.
 */

export type FlashcardOutcome = "CORRECT" | "INCORRECT" | "REVEALED";

export type FlashcardAttempt = {
  readonly cardKey: Flashcard["key"];
  readonly outcome: FlashcardOutcome;
  /** What the learner wrote; null when they chose «No lo sé». */
  readonly response: string | null;
  /** The response differs from the answer only in accents or ñ. The outcome is still INCORRECT. */
  readonly accentsOnly: boolean;
};

export type FlashcardSession = {
  readonly deck: readonly Flashcard[];
  /** Position of the current card; equals `deck.length` once FINISHED. */
  readonly index: number;
  readonly status: "ANSWERING" | "FEEDBACK" | "FINISHED";
  readonly attempts: readonly FlashcardAttempt[];
};

const EDGE_PUNCTUATION = /^[\s¡¿"'«“‘(]+|[\s!?.,;:"'»”’)…]+$/gu;

function normalizeAnswer(text: string): string {
  return text.normalize("NFC").replace(EDGE_PUNCTUATION, "").replace(/\s+/gu, " ").toLocaleLowerCase("es");
}

function withoutMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Case, surrounding spaces and punctuation («¡Hola!») do not matter; accents and ñ do. */
export function checkFlashcardAnswer(expected: string, response: string): { readonly correct: boolean; readonly accentsOnly: boolean } {
  const want = normalizeAnswer(expected);
  const got = normalizeAnswer(response);
  const correct = got !== "" && got === want;
  return { correct, accentsOnly: !correct && got !== "" && withoutMarks(got) === withoutMarks(want) };
}

export function startFlashcardSession(deck: readonly Flashcard[]): FlashcardSession {
  return { deck, index: 0, status: deck.length === 0 ? "FINISHED" : "ANSWERING", attempts: [] };
}

export function currentFlashcard(session: FlashcardSession): Flashcard | undefined {
  return session.status === "FINISHED" ? undefined : session.deck[session.index];
}

export function currentFlashcardAttempt(session: FlashcardSession): FlashcardAttempt | undefined {
  return session.status === "FEEDBACK" ? session.attempts[session.index] : undefined;
}

function recordAttempt(session: FlashcardSession, attempt: Omit<FlashcardAttempt, "cardKey">): FlashcardSession {
  const card = currentFlashcard(session);
  if (session.status !== "ANSWERING" || card === undefined) return session;
  return { ...session, status: "FEEDBACK", attempts: [...session.attempts, { cardKey: card.key, ...attempt }] };
}

/** Checks a written answer. A blank answer is ignored rather than counted as a mistake. */
export function submitFlashcardAnswer(session: FlashcardSession, response: string): FlashcardSession {
  const card = currentFlashcard(session);
  if (session.status !== "ANSWERING" || card === undefined || normalizeAnswer(response) === "") return session;
  const { correct, accentsOnly } = checkFlashcardAnswer(card.answer, response);
  return recordAttempt(session, { outcome: correct ? "CORRECT" : "INCORRECT", response: response.trim(), accentsOnly });
}

/** «No lo sé»: shows the answer without asking for one. */
export function revealFlashcardAnswer(session: FlashcardSession): FlashcardSession {
  return recordAttempt(session, { outcome: "REVEALED", response: null, accentsOnly: false });
}

export function nextFlashcard(session: FlashcardSession): FlashcardSession {
  if (session.status !== "FEEDBACK") return session;
  const index = session.index + 1;
  return { ...session, index, status: index < session.deck.length ? "ANSWERING" : "FINISHED" };
}

export type FlashcardSessionSummary = {
  readonly total: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly revealed: number;
};

export function summarizeFlashcardSession(session: FlashcardSession): FlashcardSessionSummary {
  const count = (outcome: FlashcardOutcome) => session.attempts.filter((attempt) => attempt.outcome === outcome).length;
  return { total: session.attempts.length, correct: count("CORRECT"), incorrect: count("INCORRECT"), revealed: count("REVEALED") };
}
