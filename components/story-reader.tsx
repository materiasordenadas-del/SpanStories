"use client";

import { useEffect, useMemo, useState } from "react";
import { A1_STORY_1 } from "@/content/a1/module-1/island-1/story-1";
import {
  createStateDeclaredEvent,
  createWordOpenedEvent,
  getEventsForLexeme,
  loadLearnerEvents,
  projectLearnerLexemeStates,
  projectStoryProgress,
  saveLearnerEvents,
  type LearnerEvent,
} from "@/lib/learner-event-prototype";
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

function formatEventTime(occurredAt: string): string {
  const date = new Date(occurredAt);

  if (Number.isNaN(date.getTime())) {
    return occurredAt;
  }

  return date.toLocaleString("es", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getEventLabel(event: LearnerEvent): string {
  if (event.type === "WORD_OPENED") {
    return "Unidad abierta";
  }

  return `Estado → ${event.value}`;
}

export function StoryReader() {
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(
    null,
  );
  const [events, setEvents] = useState<LearnerEvent[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(loadLearnerEvents(window.localStorage));
    setStorageReady(true);

    function handleStorageChange(storageEvent: StorageEvent) {
      if (storageEvent.storageArea !== window.localStorage) {
        return;
      }

      setEvents(loadLearnerEvents(window.localStorage));
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    try {
      saveLearnerEvents(window.localStorage, events);
      setStorageError(null);
    } catch {
      setStorageError(
        "No se pudo guardar el historial en este navegador. Los cambios siguen activos durante esta sesión.",
      );
    }
  }, [events, storageReady]);

  const learnerProjection = useMemo(
    () => projectLearnerLexemeStates(events),
    [events],
  );
  const storyProgress = useMemo(
    () => projectStoryProgress(events, story.id),
    [events],
  );

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

  const selectedLexemeEvents = useMemo(
    () =>
      selectedLexeme
        ? getEventsForLexeme(events, selectedLexeme.id)
        : ([] as LearnerEvent[]),
    [events, selectedLexeme],
  );
  const recentSelectedLexemeEvents = useMemo(
    () => [...selectedLexemeEvents].reverse().slice(0, 5),
    [selectedLexemeEvents],
  );

  const currentLearnerState = selectedLexeme
    ? learnerProjection.states[selectedLexeme.id]
    : undefined;

  function selectOccurrence(occurrenceId: string) {
    const occurrence = occurrenceById.get(occurrenceId);

    if (!occurrence) {
      return;
    }

    if (selectedOccurrenceId !== occurrenceId) {
      setEvents((current) => [
        ...current,
        createWordOpenedEvent({
          storyId: occurrence.storyId,
          occurrenceId: occurrence.id,
          recordedLexemeId: occurrence.lexemeId,
          recordedSenseId: occurrence.senseId,
        }),
      ]);
    }

    setSelectedOccurrenceId(occurrenceId);
  }

  function declareState(state: LearnerDeclaredState) {
    if (!selectedLexeme || !selectedOccurrence) {
      return;
    }

    if (currentLearnerState === state) {
      return;
    }

    setEvents((current) => [
      ...current,
      createStateDeclaredEvent(
        {
          storyId: selectedOccurrence.storyId,
          occurrenceId: selectedOccurrence.id,
          recordedLexemeId: selectedLexeme.id,
          recordedSenseId: selectedOccurrence.senseId,
        },
        state,
      ),
    ]);
  }

  return (
    <div>
      <section className={styles.progress} aria-label="Progreso local de la historia">
        <div>
          <strong>
            {storyProgress.encounteredLexemeCount}/{story.lexemes.length}
          </strong>
          <span>unidades abiertas</span>
        </div>
        <div>
          <strong>{storyProgress.declaredLexemeCount}</strong>
          <span>con estado</span>
        </div>
        <div>
          <strong>{storyProgress.learningCount}</strong>
          <span>aprendiendo</span>
        </div>
        <div>
          <strong>{storyProgress.knownCount}</strong>
          <span>conocidas</span>
        </div>
      </section>

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
                      onClick={() => selectOccurrence(occurrence.id)}
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
                  Estado actual: {currentLearnerState ?? "Sin declarar"}. {" "}
                  {storageReady
                    ? "El historial se conserva localmente en este navegador."
                    : "Cargando historial local…"}
                </p>
                {storageError ? (
                  <p className={styles.storageError} role="status">
                    {storageError}
                  </p>
                ) : null}
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
                        onClick={() => selectOccurrence(occurrence.id)}
                        type="button"
                      >
                        {getSentenceText(occurrence.sentenceId)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.historyBlock}>
                <p className={styles.panelLabel}>
                  Historial de esta unidad · {selectedLexemeEvents.length} eventos
                </p>
                {recentSelectedLexemeEvents.length > 0 ? (
                  <ol className={styles.historyList}>
                    {recentSelectedLexemeEvents.map((event) => (
                      <li key={event.id}>
                        <span>{getEventLabel(event)}</span>
                        <time dateTime={event.occurredAt}>
                          {formatEventTime(event.occurredAt)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.historyEmpty}>Aún no hay eventos registrados.</p>
                )}
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
                hacia un Lexeme y un Sense. El encuentro se registrará como un
                evento histórico local.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
