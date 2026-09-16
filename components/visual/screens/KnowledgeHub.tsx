"use client";

import { useEffect, useRef, useState } from "react";
import { usePracticeItems } from "@/lib/adapters/practice";
import { KNOWLEDGE_LABELS, KNOWLEDGE_STATES, projectKnowledge, recordKnowledge, useKnowledge } from "@/lib/adapters/lexical-knowledge";
import { practiceTargetKey } from "@/features/practice/domain/target";
import type { PracticeOccurrence } from "@/features/practice/domain/occurrence";
import type { PracticeItem } from "@/features/practice/domain/item";
import { makeKnowledgeExercise, isKnowledgeAnswerCorrect, type KnowledgeExercise } from "@/features/practice/engine/knowledge-practice";
import type { KnowledgeState } from "@/features/learner-progress/domain/knowledge";
import css from "./knowledge.module.css";
import styles from "./baseline.module.css";

type Review = { owner: string; id: string; exercises: KnowledgeExercise[]; index: number; feedback: "correct" | "incorrect" | "revealed" | null; correct: number };
export function KnowledgeHub({ occurrences }: { occurrences: readonly PracticeOccurrence[] }) {
  const { owner } = useKnowledge();
  return <OwnedKnowledgeHub key={owner} occurrences={occurrences} />;
}

function OwnedKnowledgeHub({ occurrences }: { occurrences: readonly PracticeOccurrence[] }) {
  const { items, ready: itemsReady } = usePracticeItems();
  const { owner, events, ready, error } = useKnowledge();
  const [filter, setFilter] = useState("saved");
  const [mode, setMode] = useState<"auto" | KnowledgeExercise["type"]>("auto");
  const [review, setReview] = useState<Review | null>(null);
  const [response, setResponse] = useState("");
  const [now, setNow] = useState(() => new Date().toISOString());
  const answerRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 60_000); return () => clearInterval(timer); }, []);
  // Existing saves belong only to their current storage owner; replay imports preserve their date.
  useEffect(() => {
    if (!ready || !itemsReady) return;
    for (const item of items) {
      const key = practiceTargetKey(item.target);
      if (!events.some(e => e.targetKey === key && e.kind === "SAVED")) recordKnowledge({ kind: "SAVED", targetKey: key,
        eventId: `saved-import:${key}:${item.savedAt}`, occurredAt: item.savedAt, storyVersionId: item.savedFrom?.storyVersionId ?? null,
        occurrenceId: item.savedFrom?.occurrenceId ?? null, source: "LEGACY_MIGRATION" }, owner);
    }
  }, [items, itemsReady, events, ready, owner]);
  useEffect(() => {
    if (review?.feedback) nextRef.current?.focus();
    else answerRef.current?.focus();
  }, [review?.index, review?.feedback]);
  const rows = items.map(item => {
    const key = practiceTargetKey(item.target);
    const occurrence = occurrences.find(o => practiceTargetKey(o.target) === key);
    return { item, key, occurrence, projection: projectKnowledge(events, owner, key, occurrence?.productive ?? true, now) };
  });
  const due = rows.filter(row => row.projection.nextReviewAt !== null && row.projection.nextReviewAt <= now);
  const visible = rows.filter(row => filter === "saved" || (filter === "due" ? due.includes(row) : row.projection.computedState === filter));
  const start = (selected: typeof rows) => {
    const grouped = [...selected].sort((a, b) => {
      const early = (s: string) => s === "NEW" || s === "UNSEEN";
      return Number(early(b.projection.computedState)) - Number(early(a.projection.computedState))
        || (early(a.projection.computedState) ? (a.item.savedFrom?.storyVersionId ?? "").localeCompare(b.item.savedFrom?.storyVersionId ?? "")
          : (a.projection.nextReviewAt ?? "z").localeCompare(b.projection.nextReviewAt ?? "z"));
    });
    const exercises = grouped.flatMap(row => makeKnowledgeExercise(row.item, occurrences, row.projection, events, mode === "auto" ? undefined : mode) ?? []);
    submitted.current = false;
    setResponse("");
    setReview({ owner, id: crypto.randomUUID(), exercises, index: 0, feedback: null, correct: 0 });
  };
  const exercise = review?.exercises[review.index];
  const answer = (outcome: "correct" | "incorrect" | "revealed") => {
    if (!review || !exercise || review.feedback || submitted.current) return;
    submitted.current = true;
    const base = { targetKey: exercise.targetKey, storyVersionId: exercise.occurrence.storyVersionId, occurrenceId: exercise.occurrence.occurrenceId };
    const persisted = recordKnowledge({ ...base, kind: "PRACTICE", evidence: exercise.evidence, outcome,
      practiceSessionId: review.id, attemptId: `${review.id}:${review.index}`, targetProductive: exercise.occurrence.productive ?? true }, owner);
    if (!persisted) { submitted.current = false; return; }
    if (outcome === "incorrect") recordKnowledge({ ...base, kind: "MEANING_REVEALED" }, owner);
    setReview({ ...review, feedback: outcome, correct: review.correct + Number(outcome === "correct") });
    setNow(new Date().toISOString());
  };
  const mark = (value: string) => answer(isKnowledgeAnswerCorrect(exercise!, value) ? "correct" : "incorrect");
  return <section className={css.hub} aria-labelledby="mi-vocabulario">
    <h2 id="mi-vocabulario">Mi vocabulario</h2>
    <p className={css.meta}>Progreso individual en este navegador · {owner === "guest" ? "Sesión de invitado" : "Tu cuenta"}. Guardar una palabra no significa conocerla.</p>
    {error && <p role="alert">{error}</p>}
    {!(ready && itemsReady) ? <p>Cargando tu vocabulario…</p> : review ? <div className={css.exercise}>
      {exercise ? <>
        <p>Palabra {review.index + 1} de {review.exercises.length} · {exercise.type === "recognition" ? "Reconoce el significado" : exercise.type === "cloze" ? "Completa la frase de la historia" : exercise.evidence === "MEANING_RECALL" ? "Recuerda el significado en inglés" : "Recuerda la palabra en español"}</p>
        <p className={css.prompt}>{exercise.prompt}</p>
        {review.feedback ? <div className={css.feedback} role="status"><strong>{review.feedback === "correct" ? "Correcto." : review.feedback === "revealed" ? "Repasemos la respuesta." : "Revisa la respuesta."}</strong><p>{exercise.answer}</p><p>{exercise.occurrence.context.text}</p></div>
          : exercise.choices.length ? <div className={css.choices}>{exercise.choices.map(choice => <button className={css.choice} key={choice} onClick={() => mark(choice)}>{choice}</button>)}</div>
            : <form onSubmit={e => { e.preventDefault(); if (response.trim()) mark(response); }}><label>Tu respuesta <input autoComplete="off" spellCheck={false} ref={answerRef} value={response} onChange={e => setResponse(e.target.value)} /></label><button className={`${styles.button} ${styles.primary}`} disabled={!response.trim()}>Comprobar</button></form>}
        <div className={css.toolbar}>{review.feedback ? <button ref={nextRef} className={`${styles.button} ${styles.primary}`} onClick={() => { submitted.current = false; setResponse(""); setReview({ ...review, index: review.index + 1, feedback: null }); }}>Siguiente</button> : <>
          <button className={css.choice} onClick={() => answer("revealed")}>No lo sé · ver respuesta</button>
          <button className={css.choice} onClick={() => {
            if (recordKnowledge({ kind: "PRACTICE", targetKey: exercise.targetKey, storyVersionId: exercise.occurrence.storyVersionId, occurrenceId: exercise.occurrence.occurrenceId,
              evidence: exercise.evidence, outcome: "skipped", practiceSessionId: review.id, attemptId: `${review.id}:${review.index}` }, owner)) {
              setResponse(""); setReview({ ...review, index: review.index + 1 });
            }
          }}>Saltar</button></>}
          <button className={css.choice} onClick={() => setReview(null)}>Volver a vocabulario</button></div>
      </> : <><p>{review.exercises.length ? `Sesión terminada. ${review.correct} respuestas correctas de ${review.exercises.length}.` : "Estas palabras todavía no tienen contenido publicado suficiente para practicar. Siguen guardadas."}</p><button className={css.choice} onClick={() => setReview(null)}>Volver a vocabulario</button></>}
    </div> : <>
      <p><strong>{due.length}</strong> {due.length === 1 ? "palabra pendiente de repaso" : "palabras pendientes de repaso"} · {items.length} guardadas</p>
      <div className={css.toolbar}>
        <button className={`${styles.button} ${styles.primary}`} disabled={!due.length} onClick={() => start(due)}>Repasar pendientes</button>
        <button className={css.choice} disabled={!visible.length} onClick={() => start(visible)}>Practicar ahora</button>
        <label>Ejercicio <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="auto">Según tu progreso</option><option value="recognition">Reconocimiento</option><option value="cloze">Completar frase</option><option value="recall">Recuerdo</option></select></label>
      </div>
      <label>Mostrar <select value={filter} onChange={e => setFilter(e.target.value)}><option value="saved">Todas las guardadas</option><option value="due">Pendientes de repaso</option>{KNOWLEDGE_STATES.map(s => <option key={s} value={s}>{KNOWLEDGE_LABELS[s]} ({rows.filter(r => r.projection.computedState === s).length})</option>)}</select></label>
      <ul className={css.list}>{visible.map(row => <li key={row.key} className={css.row}><div><strong>{row.occurrence?.lemma ?? (row.item.target.type === "UNRESOLVED_SURFACE" ? row.item.target.surface : "Palabra sin contenido publicado")}</strong>{row.occurrence?.translation && <span> · {row.occurrence.translation}</span>}<div className={css.meta}>{KNOWLEDGE_LABELS[row.projection.computedState]} · {row.projection.contextDiversity} contextos{row.projection.nextReviewAt ? ` · Repaso: ${new Date(row.projection.nextReviewAt).toLocaleDateString("es")}` : " · Sin repaso intensivo"}</div>{row.projection.declaredState && <div className={css.meta}>Autoevaluación: {KNOWLEDGE_LABELS[row.projection.declaredState]}</div>}</div>
        <label className={css.meta}>Autoevaluación <select aria-label={`Autoevaluación de ${row.occurrence?.lemma ?? "palabra"}`} value={row.projection.declaredState ?? ""} onChange={e => declare(row.item, e.target.value as KnowledgeState, owner)}><option value="" disabled>Sin declarar</option>{KNOWLEDGE_STATES.map(s => <option key={s} value={s}>{KNOWLEDGE_LABELS[s]}</option>)}</select></label></li>)}</ul>
      {!visible.length && <p>Guarda palabras desde las historias o cambia el filtro.</p>}
    </>}
  </section>;
}

function declare(item: PracticeItem, declaredState: KnowledgeState, owner: string) {
  recordKnowledge({ kind: "STATE_DECLARED", targetKey: practiceTargetKey(item.target), storyVersionId: item.savedFrom?.storyVersionId ?? null, occurrenceId: item.savedFrom?.occurrenceId ?? null, declaredState }, owner);
}
