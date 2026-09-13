import type { StoryReaderViewModel } from "../../story-reader/model.ts";
import type { PracticeOccurrence, ReaderWordPractice } from "../domain/occurrence.ts";
import { practiceTargetOf } from "../domain/target.ts";

/**
 * Practice reads lexical identity from the published occurrences the reader
 * already carries (`eventContext`), not from what the panel displays: the
 * panel's surface and lemma are text, and text is never identity.
 */
function occurrenceOf(model: StoryReaderViewModel, wordId: string) {
  return model.eventContext?.occurrences.find((occurrence) => occurrence.id === wordId);
}

/** What saving the selected reader word would save, or null when it has no Lexeme. */
export function readerWordPractice(model: StoryReaderViewModel, wordId: string): ReaderWordPractice | null {
  if (model.lexicalEntries[wordId] === undefined) return null;
  const occurrence = occurrenceOf(model, wordId);
  const target = practiceTargetOf(occurrence);
  if (occurrence === undefined || target === null) return null;
  return { target, savedFrom: { storyVersionId: occurrence.storyVersionId, occurrenceId: occurrence.id } };
}

/** Every lexical occurrence of a published story, with the content Practice may use. */
export function collectPracticeOccurrences(model: StoryReaderViewModel): readonly PracticeOccurrence[] {
  return Object.values(model.lexicalEntries).flatMap((entry): PracticeOccurrence[] => {
    const occurrence = occurrenceOf(model, entry.occurrenceId);
    const target = practiceTargetOf(occurrence);
    if (occurrence === undefined || target === null) return [];
    // Same precedence as the word panel: the story's editorial reference, then the published panel fields.
    const translation = entry.reference?.translation ?? entry.panel.translation;
    const partOfSpeechLabel = entry.reference?.partOfSpeechLabel ?? entry.panel.partOfSpeechLabel;
    const { cefrLevel, currentContext } = entry.panel;
    return [{
      target,
      storyVersionId: occurrence.storyVersionId,
      occurrenceId: occurrence.id,
      lemma: entry.lemma,
      ...(translation === undefined ? {} : { translation }),
      ...(partOfSpeechLabel === undefined ? {} : { partOfSpeechLabel }),
      ...(cefrLevel === undefined ? {} : { cefrLevel }),
      context: { text: currentContext.text, parts: currentContext.parts },
    }];
  });
}
