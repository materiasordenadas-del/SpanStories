import {
  buildConjugationPool,
  buildConjugationQuestion,
  checkConjugationAnswer,
  findConjugationVerb,
  type ConjugationPair,
  type ConjugationQuestion,
  type ConjugationSettings,
} from "../domain/conjugation.ts";

/**
 * A conjugation drill as an immutable state machine:
 *
 *   ANSWERING --submit/reveal--> FEEDBACK --next--> ANSWERING … FINISHED
 *
 * Every transition returns a new session; a blank answer returns the same one.
 */

export type ConjugationOutcome = "CORRECT" | "INCORRECT" | "REVEALED";

export type ConjugationAttempt = {
  readonly question: ConjugationQuestion;
  readonly outcome: ConjugationOutcome;
  /** What the learner wrote, trimmed. Empty for «No lo sé». */
  readonly response: string;
  /** Wrong only in accents or ñ. */
  readonly accentsOnly: boolean;
};

export type ConjugationSession = {
  readonly questions: readonly ConjugationQuestion[];
  readonly index: number;
  /** One per answered question, in order. */
  readonly attempts: readonly ConjugationAttempt[];
  /** Correct answers in a row. */
  readonly streak: number;
  readonly status: "ANSWERING" | "FEEDBACK" | "FINISHED";
};

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/**
 * Draws `settings.length` questions from the pool: every pair is used once
 * before any repeats, and the same verb never comes twice in a row when the
 * pool can avoid it. Null when the settings leave nothing to practise.
 */
export function startConjugationSession(settings: ConjugationSettings, random: () => number = Math.random): ConjugationSession | null {
  const { pairs } = buildConjugationPool(settings);
  if (pairs.length === 0) return null;
  const length = Math.max(1, Math.floor(settings.length));
  const questions: ConjugationQuestion[] = [];
  let bag: ConjugationPair[] = [];
  while (questions.length < length) {
    if (bag.length === 0) bag = shuffle([...pairs], random);
    let pair = bag.pop() as ConjugationPair;
    const previous = questions[questions.length - 1];
    if (previous !== undefined && previous.infinitive === pair.infinitive) {
      const other = bag.findIndex((candidate) => candidate.infinitive !== pair.infinitive);
      if (other !== -1) [pair, bag[other]] = [bag[other], pair];
    }
    const verb = findConjugationVerb(pair.infinitive);
    const question = verb === undefined ? null : buildConjugationQuestion(verb, pair.person, random);
    if (question !== null) questions.push(question);
  }
  return { questions, index: 0, attempts: [], streak: 0, status: "ANSWERING" };
}

export function currentConjugationQuestion(session: ConjugationSession): ConjugationQuestion | undefined {
  return session.status === "FINISHED" ? undefined : session.questions[session.index];
}

/** The attempt for the current question once it has one. */
export function currentConjugationAttempt(session: ConjugationSession): ConjugationAttempt | undefined {
  return session.status === "FEEDBACK" ? session.attempts[session.index] : undefined;
}

function answered(session: ConjugationSession, attempt: ConjugationAttempt): ConjugationSession {
  return {
    ...session,
    attempts: [...session.attempts, attempt],
    streak: attempt.outcome === "CORRECT" ? session.streak + 1 : 0,
    status: "FEEDBACK",
  };
}

export function submitConjugationAnswer(session: ConjugationSession, response: string): ConjugationSession {
  const question = currentConjugationQuestion(session);
  if (session.status !== "ANSWERING" || question === undefined || response.trim() === "") return session;
  const { correct, accentsOnly } = checkConjugationAnswer(question, response);
  return answered(session, { question, outcome: correct ? "CORRECT" : "INCORRECT", response: response.trim(), accentsOnly });
}

/** «No lo sé»: shows the answer and counts as not known. */
export function revealConjugationAnswer(session: ConjugationSession): ConjugationSession {
  const question = currentConjugationQuestion(session);
  if (session.status !== "ANSWERING" || question === undefined) return session;
  return answered(session, { question, outcome: "REVEALED", response: "", accentsOnly: false });
}

export function nextConjugationQuestion(session: ConjugationSession): ConjugationSession {
  if (session.status !== "FEEDBACK") return session;
  const index = session.index + 1;
  return index < session.questions.length
    ? { ...session, index, status: "ANSWERING" }
    : { ...session, index: session.questions.length, status: "FINISHED" };
}

export type ConjugationSessionSummary = {
  readonly total: number;
  readonly correct: number;
  /** Incorrect and revealed attempts, in the order they happened. */
  readonly misses: readonly ConjugationAttempt[];
};

export function summarizeConjugationSession(session: ConjugationSession): ConjugationSessionSummary {
  const misses = session.attempts.filter((attempt) => attempt.outcome !== "CORRECT");
  return { total: session.questions.length, correct: session.attempts.length - misses.length, misses };
}
