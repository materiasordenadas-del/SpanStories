import type { KnowledgeEvent, LearnerLexicalKnowledgeProjection, PracticeEvidenceType } from "../../learner-progress/domain/knowledge.ts";
import type { PracticeItem } from "../domain/item.ts";
import type { PracticeOccurrence } from "../domain/occurrence.ts";
import { practiceTargetKey } from "../domain/target.ts";

export type KnowledgeExercise = Readonly<{
  targetKey: string;
  type: "recognition" | "cloze" | "recall";
  evidence: PracticeEvidenceType;
  prompt: string;
  answer: string;
  acceptedAnswers?: readonly string[];
  choices: readonly string[];
  occurrence: PracticeOccurrence;
}>;
export const normalizePracticeAnswer = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("es").replace(/\s+/g, " ");
// Editorial answer options only: these strings never create targets or learner evidence.
const EDITORIAL_DISTRACTORS = ["yesterday", "a house", "to sleep", "a book", "quickly", "under the table"];
export const isKnowledgeAnswerCorrect = (exercise: KnowledgeExercise, answer: string) =>
  [exercise.answer, ...(exercise.acceptedAnswers ?? [])].some(a => normalizePracticeAnswer(a) === normalizePracticeAnswer(answer));

/** Select a real published context; only resolved senses may cross occurrences. */
export function makeKnowledgeExercise(item: PracticeItem, occurrences: readonly PracticeOccurrence[], projection: LearnerLexicalKnowledgeProjection, events: readonly KnowledgeEvent[], requested?: KnowledgeExercise["type"]): KnowledgeExercise | null {
  const key = practiceTargetKey(item.target);
  const candidates = occurrences.filter(o => practiceTargetKey(o.target) === key && o.translation?.trim()
    && (item.target.type === "SENSE" || (o.storyVersionId === item.savedFrom?.storyVersionId && o.occurrenceId === item.savedFrom?.occurrenceId)));
  if (!candidates.length) return null;
  const history = events.filter(e => e.learnerId === projection.learnerId && e.targetKey === key);
  const used = history.filter(e => e.kind === "PRACTICE");
  const encountered = new Set(history.map(e => e.storyVersionId));
  candidates.sort((a, b) => {
    const count = (o: PracticeOccurrence) => used.filter(e => e.storyVersionId === o.storyVersionId).length;
    return count(a) - count(b) || Number(encountered.has(b.storyVersionId)) - Number(encountered.has(a.storyVersionId));
  });
  const occurrence = candidates[0];
  const state = projection.computedState;
  const type = requested ?? (state === "NEW" || state === "UNSEEN" ? "recognition" : state === "RECOGNIZED" ? "cloze" : "recall");
  const translation = occurrence.translation!.trim();
  if (type === "recognition") {
    const synonyms = translation.split(/\s*\/\s*/).map(normalizePracticeAnswer);
    const distractors = [...new Set([...occurrences.filter(o => practiceTargetKey(o.target) !== key && o.lemma !== occurrence.lemma)
      .map(o => o.translation?.trim()), ...EDITORIAL_DISTRACTORS]
      .filter((t): t is string => !!t && normalizePracticeAnswer(t) !== normalizePracticeAnswer(translation)
        && !t.split(/\s*\/\s*/).some(part => synonyms.includes(normalizePracticeAnswer(part)))))].slice(0, 3);
    if (distractors.length >= 2) {
      const choices = [translation, ...distractors];
      // Rotate the answer, independently of semantic content, instead of always placing it first.
      const offset = (used.length + Array.from(key).reduce((sum, c) => sum + c.charCodeAt(0), 0)) % choices.length;
      return { targetKey: key, type, evidence: "RECOGNITION", prompt: occurrence.lemma, answer: translation,
        choices: [...choices.slice(offset), ...choices.slice(0, offset)], occurrence };
    }
    // No misleading single-choice exercise when the published pool is small.
  }
  if (type === "cloze") {
    const marked = occurrence.context.parts.filter(p => p.highlighted);
    if (marked.length === 1 && marked[0].text.trim()) return { targetKey: key, type, evidence: "FORM_RECALL",
      prompt: occurrence.context.parts.map(p => p.highlighted ? "______" : p.text).join(""), answer: marked[0].text.trim(), choices: [], occurrence };
  }
  const receptive = occurrence.productive === false;
  return { targetKey: key, type: "recall", evidence: receptive ? "MEANING_RECALL" : "FORM_RECALL",
    prompt: receptive ? occurrence.lemma : translation, answer: receptive ? translation : occurrence.lemma,
    acceptedAnswers: receptive ? translation.split(/\s*\/\s*/).filter(Boolean) : [], choices: [], occurrence };
}
