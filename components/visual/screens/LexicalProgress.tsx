"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { practiceTargetKey } from "@/features/practice/domain/target";
import type { ReaderWordPractice } from "@/features/practice/domain/occurrence";
import { KNOWLEDGE_LABELS, KNOWLEDGE_STATES, projectKnowledge, recordKnowledge, useKnowledge } from "@/lib/adapters/lexical-knowledge";
import type { KnowledgeState } from "@/features/learner-progress/domain/knowledge";
import css from "./knowledge.module.css";

export function LexicalProgress({ word, revealed }: { word: ReaderWordPractice; revealed: boolean }) {
  const { owner, events, ready, error } = useKnowledge();
  const key = practiceTargetKey(word.target);
  const recorded = useRef("");
  useEffect(() => {
    if (!ready) return;
    const identity = `${owner}:${key}:${word.savedFrom.occurrenceId}:${revealed}`;
    if (recorded.current === identity) return;
    recorded.current = identity;
    const base = { targetKey: key, storyVersionId: word.savedFrom.storyVersionId, occurrenceId: word.savedFrom.occurrenceId };
    recordKnowledge({ ...base, kind: "OCCURRENCE_OPENED" }, owner);
    if (revealed) recordKnowledge({ ...base, kind: "MEANING_REVEALED" }, owner);
  }, [owner, key, ready, word.savedFrom.storyVersionId, word.savedFrom.occurrenceId, revealed]);
  const productive = events.filter(e => e.targetKey === key && e.targetProductive !== undefined).at(-1)?.targetProductive ?? true;
  const p = projectKnowledge(events, owner, key, productive, new Date().toISOString());
  return <section className={css.panel} aria-label="Tu progreso léxico">
    <strong>Tu progreso: {ready ? KNOWLEDGE_LABELS[p.computedState] : "…"}</strong>
    <ol className={css.steps}>{KNOWLEDGE_STATES.map(state => <li key={state} aria-current={p.computedState === state ? "step" : undefined}>{KNOWLEDGE_LABELS[state]}</li>)}</ol>
    {p.declaredState && <p>Tu autoevaluación: {KNOWLEDGE_LABELS[p.declaredState]}</p>}
    <label className={css.manual}>Cambiar estado manualmente <select aria-label="Cambiar estado manualmente" value={p.declaredState ?? ""} disabled={!ready} onChange={e => recordKnowledge({ kind: "STATE_DECLARED", targetKey: key, storyVersionId: word.savedFrom.storyVersionId, occurrenceId: word.savedFrom.occurrenceId, declaredState: e.target.value as KnowledgeState }, owner)}>
      <option value="" disabled>Sin autoevaluación</option>{KNOWLEDGE_STATES.map(s => <option key={s} value={s}>{KNOWLEDGE_LABELS[s]}</option>)}
    </select></label>
    <Link href="/progreso/practica">Ver vocabulario y practicar →</Link>
    {error && <p role="alert">{error}</p>}
  </section>;
}
