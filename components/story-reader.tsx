"use client";

import { useState } from "react";
import { A1_STORY_1 } from "@/content/a1/module-1/island-1/story-1";
import type { LearnerDeclaredState } from "@/lib/lexical-prototype";
import styles from "./story-reader.module.css";

const story = A1_STORY_1;

const occurrenceById = new Map(
  story.occurrences.map((occurrence) => [occurrence.id, occurrence]),
);
const lexemeById = new Map(story.lexemes.map((lexeme) => [lexeme.id, lexeme]));
const senseById = new Map(story.senses.map((sense) => [sense.id, sense]));
const sentenceById = new Map(
  story.sentences.map((sentence) => [sentence.id, sentence]),
);

const STATE_OPTIONS: readonly {
  value: LearnerDeclaredState;
  label: string;
}[] = [
  { value: "NEW", label: "Nueva" },
  { value: "LEARNING", label: "Aprendiendo" },
  { value: "KNOWN", label: "La conozco" },
];

function getSentenceText(sentenceId: string): string {
  const sentence = sentenceById.get(sentenceId);
  return sentence?.segments.map((segment) => segment.text).join("") ?? "";
}

export function StoryReader() {
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(
    null,
  );
  const [learnerStates, setLearnerStates] = useState<
    Record<string, LearnerDeclaredState>
  >({});

  const selectedOccurrence = selectedOccurrenceId
    ? occurrenceById.get(selectedOccurrenceId)
    : undefined;
  const selectedLexeme = selectedOccurrence
    ? lexemeById.get(selectedOccurrence.lexemeId)
    : undefined;
  const selectedSense = selectedOccurrence
    ? senseById.get(selectedOccurrence.senseId)
    : undefined;

  const relatedOccurrences = selectedLexeme
    ? story.occurrences.filter(
        (occurrence) => occurrence.lexemeId === selectedLexeme.id,
      )
    : [];

  const currentLearnerState = selectedLexeme
    ? learnerStates[selectedLexeme.id]
    : undefined;

  function declareState(state: LearnerDeclaredState) {
    if (!selectedLexeme) {
      return;
    }

    setLearnerStates((current) => ({
      ...current,
      [selectedLexeme.id]: state,
    }));
  }

  return (
    <div className={styles.storyReader}>
      <section className={styles.readingColumn} aria-labelledby="story-title">
        <div className={styles.heading}>
          <p className="eyebrow">Story 1 · A1</p>
          <h3 id="story-title">{story.title}</h3>
          <p>{story.summary}</p>
          <p className={styles.instruction}>
            Selecciona las palabras subrayadas o la expresión “se dio cuenta”.
          </p>
        </div>

        <div className={styles.storyText} lang="es">
          {story.sentences.map((sentence) => (
            <p key={sentence.id}>
              {sentence.segments.map((segment, index) => {
                if (!segment.occurrenceId) {
                  return <span key={`${sentence.id}-${index}`}>{segment.text}</span>;
                }

                const occurrence = occurrenceById.get(segment.occurrenceId);

                if (!occurrence) {
                  return <span key={`${sentence.id}-${index}`}>{segment.text}</span>;
                }

                const isSelected = selectedOccurrenceId === occurrence.id;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`${styles.occurrence}${isSelected ? ` ${styles.selected}` : ""}`}
                    key={occurrence.id}
                    onClick={() => setSelectedOccurrenceId(occurrence.id)}
                    type="button"
                  >
                    {segment.text}
                  </button>
                );
              })}
            </p>
          ))}
        </div>
      </section>

      <aside className={`card ${styles.panel}`} aria-live="polite">
        {selectedOccurrence && selectedLexeme && selectedSense ? (
          <>
            <div className={styles.panelHeader}>
              <div>
                <p className="eyebrow">Unidad léxica</p>
                <h3>{selectedLexeme.canonicalForm}</h3>
                <p className={styles.meta}>
                  {selectedLexeme.partOfSpeech} · {selectedLexeme.lexicalType}
                </p>
              </div>
              <span className={styles.surfaceBadge}>
                {selectedOccurrence.surface}
              </span>
            </div>

            <div className={styles.definition}>
              <strong>{selectedSense.glossEn}</strong>
              <p>{selectedSense.definitionEs}</p>
            </div>

            <div className={styles.stateBlock}>
              <p className={styles.panelLabel}>
                ¿Qué tan bien conoces esta unidad?
              </p>
              <div className={styles.stateOptions}>
                {STATE_OPTIONS.map((option) => (
                  <button
                    aria-pressed={currentLearnerState === option.value}
                    className={styles.stateButton}
                    data-state={option.value}
                    key={option.value}
                    onClick={() => declareState(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className={styles.stateCaption}>
                Estado actual: {currentLearnerState ?? "Sin declarar"}. En Fase 3
                se conserva solo durante esta sesión.
              </p>
            </div>

            <div className={styles.contextBlock}>
              <p className={styles.panelLabel}>En este encuentro</p>
              <p>{getSentenceText(selectedOccurrence.sentenceId)}</p>
            </div>

            <div className={styles.contextBlock}>
              <p className={styles.panelLabel}>
                Encuentros de “{selectedLexeme.canonicalForm}” en esta historia ·{" "}
                {relatedOccurrences.length}
              </p>
              <ul className={styles.contextList}>
                {relatedOccurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <button
                      className={styles.contextLink}
                      onClick={() => setSelectedOccurrenceId(occurrence.id)}
                      type="button"
                    >
                      {getSentenceText(occurrence.sentenceId)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {selectedLexeme.lexicalType === "MULTIWORD" ? (
              <div className={styles.parts}>
                <p className={styles.panelLabel}>Partes de la occurrence</p>
                <div className={styles.partList}>
                  {selectedOccurrence.parts.map((part) => (
                    <span className={styles.partChip} key={part.id}>
                      {part.text} · {part.role}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.emptyState}>
            <p className="eyebrow">Panel léxico</p>
            <h3>Selecciona una unidad</h3>
            <p>
              La forma visible abre su occurrence contextual, que se resuelve
              hacia un Lexeme y un Sense.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
