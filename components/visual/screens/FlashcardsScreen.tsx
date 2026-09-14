"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { recordPracticeSession } from "@/features/accounts/progress-service";
import { speakSpanish } from "@/features/story-reader/browser-speech";
import {
  buildFlashcardDeck,
  currentFlashcard,
  currentFlashcardAttempt,
  nextFlashcard,
  revealFlashcardAnswer,
  startFlashcardSession,
  submitFlashcardAnswer,
  summarizeFlashcardSession,
  usePracticeItems,
  type Flashcard,
  type FlashcardAttempt,
  type FlashcardSession,
  type PracticeOccurrence,
} from "@/lib/adapters/practice";
import styles from "./baseline.module.css";
import cards from "./flashcards.module.css";

const PRACTICE_HREF = "/progreso/practica";
const END_HEADING_ID = "flashcards-fin";

function CloseIcon() {
  return <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function SpeakerIcon() {
  return <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Z" fill="currentColor" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" /></svg>;
}

function feedbackMessage(attempt: FlashcardAttempt): string {
  if (attempt.outcome === "CORRECT") return "Correcto.";
  if (attempt.outcome === "REVEALED") return "Así se escribe en español.";
  return attempt.accentsOnly
    ? `Casi. Escribiste «${attempt.response}»: revisa las tildes o la ñ.`
    : `No es correcto. Escribiste «${attempt.response}».`;
}

function announcement(attempt: FlashcardAttempt, card: Flashcard): string {
  if (attempt.outcome === "CORRECT") return `Correcto: ${card.answer}.`;
  if (attempt.outcome === "REVEALED") return `La respuesta es ${card.answer}.`;
  return `${feedbackMessage(attempt)} La respuesta es ${card.answer}.`;
}

/** Barra fina de avance: cuenta la tarjeta en curso como hecha en cuanto tiene respuesta. */
function TopBar({ session }: { session: FlashcardSession | null }) {
  const total = session?.deck.length ?? 0;
  const done = session === null ? 0 : session.status === "FINISHED" ? total : session.index + (session.status === "FEEDBACK" ? 1 : 0);
  return <header className={cards.topBar}>
    <Link aria-label="Salir de la práctica" className={cards.close} href={PRACTICE_HREF}><CloseIcon /></Link>
    {session !== null && total > 0
      ? <div aria-label="Avance de la práctica" aria-valuemax={total} aria-valuemin={0} aria-valuenow={done} aria-valuetext={`${done} de ${total} tarjetas`} className={cards.progress} role="progressbar"><i style={{ width: `${(done / total) * 100}%` }} /></div>
      : <span />}
    {session !== null && total > 0 && session.status !== "FINISHED" ? <p className={cards.count}>{session.index + 1} de {total}</p> : <span />}
  </header>;
}

function EmptyDeck({ savedCount }: { savedCount: number }) {
  return <section aria-labelledby="flashcards-vacio" className={cards.message}>
    <h1 id="flashcards-vacio">{savedCount === 0 ? "Todavía no hay palabras para practicar." : "Tus palabras guardadas aún no tienen traducción."}</h1>
    <p>{savedCount === 0
      ? "Guarda palabras desde su ficha mientras lees y vuelve aquí para repasarlas."
      : "Las flashcards te piden escribir la palabra a partir de su traducción publicada. Tus palabras siguen guardadas y entrarán en cuanto la tengan."}</p>
    <div className={cards.messageActions}>
      {savedCount === 0 ? <Link className={`${styles.button} ${styles.primary}`} href="/niveles">Ir a las islas</Link> : null}
      <Link className={`${styles.button} ${styles.secondary}`} href={PRACTICE_HREF}>Volver a práctica</Link>
    </div>
  </section>;
}

function SessionEnd({ session, onRestart }: { session: FlashcardSession; onRestart: () => void }) {
  const summary = summarizeFlashcardSession(session);
  return <section aria-labelledby={END_HEADING_ID} className={cards.message}>
    <h1 id={END_HEADING_ID} tabIndex={-1}>Sesión terminada.</h1>
    <p>Repasaste {summary.total} {summary.total === 1 ? "palabra" : "palabras"}.</p>
    <dl className={cards.results}>
      <div><dt>Correctas</dt><dd>{summary.correct}</dd></div>
      <div><dt>Incorrectas</dt><dd>{summary.incorrect}</dd></div>
      <div><dt>Con «No lo sé»</dt><dd>{summary.revealed}</dd></div>
    </dl>
    <div className={cards.messageActions}>
      <button className={`${styles.button} ${styles.primary}`} onClick={onRestart} type="button">Practicar otra vez</button>
      <Link className={`${styles.button} ${styles.secondary}`} href={PRACTICE_HREF}>Volver a práctica</Link>
    </div>
  </section>;
}

/** Resultado de la sesión para la cuenta del estudiante (lo ve su profesor). */
function recordFlashcardSession(session: FlashcardSession) {
  const summary = summarizeFlashcardSession(session);
  const byKey = new Map(session.deck.map((card) => [card.key, card]));
  recordPracticeSession({
    mode: "tarjetas",
    total: summary.total,
    correct: summary.correct,
    incorrect: summary.incorrect,
    revealed: summary.revealed,
    misses: session.attempts.flatMap((attempt) => {
      const card = byKey.get(attempt.cardKey);
      return attempt.outcome === "CORRECT" || card === undefined
        ? []
        : [{ prompt: card.prompt, response: attempt.response ?? "", answer: card.answer, accentsOnly: attempt.accentsOnly }];
    }),
  });
}

export function FlashcardsScreen({ occurrences }: { occurrences: readonly PracticeOccurrence[] }) {
  const { ready, items } = usePracticeItems();
  const deck = useMemo(() => buildFlashcardDeck(items, occurrences), [items, occurrences]);
  // La sesión queda fijada con la primera respuesta: guardar o quitar palabras en otra pestaña no cambia la tarjeta en curso.
  const [started, setStarted] = useState<FlashcardSession | null>(null);
  const [response, setResponse] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const session = started ?? startFlashcardSession(deck);
  const card = currentFlashcard(session);
  const attempt = currentFlashcardAttempt(session);
  const playing = ready && session.deck.length > 0;

  // El foco acompaña la única tarea: escribir, pasar a la siguiente o leer el cierre.
  useEffect(() => {
    if (!playing) return;
    if (session.status === "ANSWERING") inputRef.current?.focus();
    else if (session.status === "FEEDBACK") nextRef.current?.focus();
    else document.getElementById(END_HEADING_ID)?.focus();
  }, [playing, session.status, session.index]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answered = submitFlashcardAnswer(session, response);
    if (answered === session) inputRef.current?.focus();
    else setStarted(answered);
  };
  const next = () => {
    setResponse("");
    const moved = nextFlashcard(session);
    if (moved !== session && moved.status === "FINISHED") recordFlashcardSession(moved);
    setStarted(moved);
  };
  const restart = () => {
    setResponse("");
    setStarted(startFlashcardSession(deck));
  };

  let content = null;
  if (ready && session.deck.length === 0) {
    content = <EmptyDeck savedCount={items.length} />;
  } else if (ready && session.status === "FINISHED") {
    content = <SessionEnd onRestart={restart} session={session} />;
  } else if (ready && card !== undefined) {
    const isLast = session.index + 1 === session.deck.length;
    content = <article aria-labelledby="flashcard-prompt" className={cards.card} data-state={attempt === undefined ? "answering" : "feedback"}>
      <p aria-live="polite" className={styles.visuallyHidden}>{attempt === undefined ? "" : announcement(attempt, card)}</p>
      {card.image === undefined ? null : <img alt={card.image.alt} className={cards.image} src={card.image.src} />}
      {card.details.length > 0 ? <p className={cards.details}>{card.details.join(" · ")}</p> : null}
      <h1 className={cards.prompt} id="flashcard-prompt" lang="en">{card.prompt}</h1>
      {attempt === undefined
        ? <form className={cards.answerForm} onSubmit={submit}>
          <label className={styles.visuallyHidden} htmlFor="flashcard-answer">Escribe en español: {card.prompt}</label>
          <div className={cards.answerRow}>
            <input autoCapitalize="none" autoComplete="off" autoCorrect="off" className={cards.input} enterKeyHint="go" id="flashcard-answer" lang="es" onChange={(event) => setResponse(event.target.value)} placeholder="Escribe en español…" ref={inputRef} spellCheck={false} type="text" value={response} />
            <button className={cards.check} type="submit">Comprobar</button>
          </div>
          <button className={cards.dontKnow} onClick={() => setStarted(revealFlashcardAnswer(session))} type="button">No lo sé</button>
        </form>
        : <div className={cards.feedback}>
          <div className={cards.answerLine}>
            <p className={cards.answer} lang="es">{card.answer}</p>
            <button aria-label={`Escuchar «${card.answer}»`} className={cards.audio} onClick={() => speakSpanish(card.answer)} title="Escuchar" type="button"><SpeakerIcon /></button>
          </div>
          <p className={cards.status} data-outcome={attempt.outcome}>{attempt.outcome === "CORRECT" ? <CheckIcon /> : null}{feedbackMessage(attempt)}</p>
          {card.context === undefined ? null : <figure className={cards.context}>
            <figcaption>En la historia</figcaption>
            <blockquote lang="es">{card.context.parts.map((part, index) => part.highlighted ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</blockquote>
          </figure>}
          <button className={`${styles.button} ${styles.primary} ${cards.next}`} onClick={next} ref={nextRef} type="button">{isLast ? "Terminar" : "Siguiente"}</button>
        </div>}
    </article>;
  }

  return <div className={`${styles.page} ${cards.screen}`}>
    <TopBar session={playing ? session : null} />
    <main aria-busy={!ready} className={cards.stage}>{content}</main>
  </div>;
}
