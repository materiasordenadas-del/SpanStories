"use client";

import { useState } from "react";
import { A1_STORY_1 } from "@/content/a1/module-1/island-1/story-1";
import type { LearnerDeclaredState } from "@/lib/lexical-prototype";

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
    <div className="story-reader">
      <section className="story-reading-column" aria-labelledby="story-title">
        <div className="story-reader-heading">
          <p className="eyebrow">Story 1 · A1</p>
          <h3 id="story-title">{story.title}</h3>
          <p>{story.summary}</p>
          <p className="story-instruction">
            Selecciona las palabras subrayadas o la expresión “se dio cuenta”.
          </p>
        </div>

        <div className="story-text" lang="es">
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
                    className={`lexical-occurrence${isSelected ? " selected" : ""}`}
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

      <aside className="card lexical-panel" aria-live="polite">
        {selectedOccurrence && selectedLexeme && selectedSense ? (
          <>
            <div className="lexical-panel-header">
              <div>
                <p className="eyebrow">Unidad léxica</p>
                <h3>{selectedLexeme.canonicalForm}</h3>
                <p className="lexical-meta">
                  {selectedLexeme.partOfSpeech} · {selectedLexeme.lexicalType}
                </p>
              </div>
              <span className="surface-badge">{selectedOccurrence.surface}</span>
            </div>

            <div className="lexical-definition">
              <strong>{selectedSense.glossEn}</strong>
              <p>{selectedSense.definitionEs}</p>
            </div>

            <div className="learner-state-block">
              <p className="panel-label">¿Qué tan bien conoces esta unidad?</p>
              <div className="learner-state-options">
                {STATE_OPTIONS.map((option) => (
                  <button
                    aria-pressed={currentLearnerState === option.value}
                    className={`learner-state-button state-${option.value.toLowerCase()}`}
                    key={option.value}
                    onClick={() => declareState(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="state-caption">
                Estado actual: {currentLearnerState ?? "Sin declarar"}. En Fase 3
                se conserva solo durante esta sesión.
              </p>
            </div>

            <div className="context-block">
              <p className="panel-label">En este encuentro</p>
              <p>{getSentenceText(selectedOccurrence.sentenceId)}</p>
            </div>

            <div className="context-block">
              <p className="panel-label">
                Encuentros de “{selectedLexeme.canonicalForm}” en esta historia · {relatedOccurrences.length}
              </p>
              <ul className="context-list">
                {relatedOccurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <button
                      className="context-link"
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
              <div className="occurrence-parts">
                <p className="panel-label">Partes de la occurrence</p>
                <div className="part-list">
                  {selectedOccurrence.parts.map((part) => (
                    <span className="part-chip" key={part.id}>
                      {part.text} · {part.role}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="lexical-empty-state">
            <p className="eyebrow">Panel léxico</p>
            <h3>Selecciona una unidad</h3>
            <p>
              La forma visible abrirá su occurrence contextual, que después se
              resuelve hacia un Lexeme y un Sense.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
