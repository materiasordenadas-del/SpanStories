"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { recordPracticeSession } from "@/features/accounts/progress-service";
import { canPlayPracticeSound, playPracticeCue, type PracticeCue } from "@/features/practice/browser-sound";
import { speakSpanish, stopSpanishSpeech } from "@/features/story-reader/browser-speech";
import {
  A1_VERBS,
  CONJUGATION_PERSONS,
  VERB_GROUPS,
  buildConjugationPool,
  conjugationPersonLabel,
  conjugationTable,
  currentConjugationAttempt,
  currentConjugationQuestion,
  findConjugationVerb,
  isVerbTypeOn,
  nextConjugationQuestion,
  revealConjugationAnswer,
  savedConjugationVerbs,
  sentenceWithAnswer,
  startConjugationSession,
  submitConjugationAnswer,
  summarizeConjugationSession,
  usePracticeItems,
  withoutMarks,
  type ConjugationSession,
  type ConjugationSettings,
  type PracticeOccurrence,
  type VerbGroup,
} from "@/lib/adapters/practice";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";
import verbs from "./conjugation.module.css";

const PRACTICE_HREF = "/progreso/practica";
const LENGTHS = [5, 10, 20, 30] as const;
const ACCENT_KEYS = ["á", "é", "í", "ó", "ú", "ü", "ñ"] as const;
const SOUND_KEY = "spanstories.practice.sound";
const RESULT_HEADING_ID = "verbos-resultado";
const SPARK_COLORS = ["#2c6a45", "#4f9a6b", "#8cc79f"];

export type VerbSource = "todos" | "historias" | "elegir";

type Draft = {
  readonly groups: Readonly<Record<VerbGroup, boolean>>;
  readonly reflexive: boolean;
  readonly persons: readonly boolean[];
  readonly source: VerbSource;
  readonly chosen: ReadonlySet<string>;
  readonly length: number;
};

function initialDraft(source: VerbSource): Draft {
  return {
    groups: { ar: true, er: true, ir: true, irr: true },
    reflexive: false,
    persons: CONJUGATION_PERSONS.map((person) => person.defaultOn),
    source,
    chosen: new Set(A1_VERBS.map((verb) => verb.infinitive)),
    length: 10,
  };
}

function settingsOf(draft: Draft, storyVerbs: readonly string[]): ConjugationSettings {
  const verbList = draft.source === "todos" ? null : draft.source === "historias" ? storyVerbs : [...draft.chosen];
  return { groups: draft.groups, reflexive: draft.reflexive, persons: draft.persons, verbs: verbList, length: draft.length };
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Resultado de la sesión para la cuenta del estudiante (lo ve su profesor). */
function recordConjugationSession(session: ConjugationSession, source: VerbSource) {
  const summary = summarizeConjugationSession(session);
  recordPracticeSession({
    mode: "verbos",
    source,
    total: summary.total,
    correct: summary.correct,
    incorrect: summary.misses.filter((miss) => miss.outcome === "INCORRECT").length,
    revealed: summary.misses.filter((miss) => miss.outcome === "REVEALED").length,
    misses: summary.misses.map((miss) => ({
      prompt: `${miss.question.before} ___ ${miss.question.after} (${miss.question.infinitive})`,
      response: miss.response,
      answer: miss.question.accepted.join(" o "),
      accentsOnly: miss.accentsOnly,
    })),
  });
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSoundPreference(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Sin almacenamiento el ajuste dura lo que dure la práctica.
  }
}

/* ── iconos ── */

function BackIcon() {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function SoundIcon({ on }: { on: boolean }) {
  return <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24">
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
    {on
      ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      : <path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />}
  </svg>;
}

/* ── ajustes ── */

function Check({ checked, label, after, onChange, locked = false }: { checked: boolean; label: string; after?: ReactNode; onChange?: (checked: boolean) => void; locked?: boolean }) {
  return <label className={`${verbs.check} ${locked ? verbs.isLocked : ""}`}>
    <input checked={checked} disabled={locked} onChange={(event) => onChange?.(event.target.checked)} type="checkbox" />
    <span>{label}</span>
    {after}
  </label>;
}

function Picker({ id, label, value, empty, open, onToggle, onClose, children }: {
  id: string; label: string; value: string; empty: string; open: boolean; onToggle: () => void; onClose: () => void; children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  return <div className={verbs.picker} data-picker onKeyDown={(event) => {
    if (event.key === "Escape" && open) { onClose(); buttonRef.current?.focus(); }
  }}>
    <button aria-controls={id} aria-expanded={open} className={verbs.pickerButton} onClick={onToggle} ref={buttonRef} type="button">
      <span className={verbs.pickerLabel}>{label}</span>
      <span className={`${verbs.pickerValue} ${value === "" ? verbs.isEmpty : ""}`}>{value === "" ? empty : value}</span>
      <span aria-hidden="true" className={verbs.chevron} />
    </button>
    <div className={verbs.pickerPanel} hidden={!open} id={id}>{children}</div>
  </div>;
}

function SettingsView({ draft, onChange, storyVerbs, ready, onStart }: {
  draft: Draft;
  onChange: (update: (draft: Draft) => Draft) => void;
  storyVerbs: readonly string[];
  ready: boolean;
  onStart: () => void;
}) {
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (openPicker === null) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest("[data-picker]"))) setOpenPicker(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [openPicker]);

  const toggle = (id: string) => setOpenPicker((current) => current === id ? null : id);
  const typesOn = A1_VERBS.filter((verb) => isVerbTypeOn(draft, verb));
  const typeLabels = [...VERB_GROUPS.filter((group) => draft.groups[group.id]).map((group) => group.label), ...(draft.reflexive ? ["reflexivos"] : [])];
  const personLabels = CONJUGATION_PERSONS.filter((_, index) => draft.persons[index]).map((person) => person.label.replace(/ \/ /g, "/"));
  const chosenCount = typesOn.filter((verb) => draft.chosen.has(verb.infinitive)).length;
  const storyCount = typesOn.filter((verb) => storyVerbs.includes(verb.infinitive)).length;
  const pool = buildConjugationPool(settingsOf(draft, storyVerbs));

  const search = withoutMarks(query);
  const visible = typesOn.filter((verb) => search === "" || withoutMarks(verb.infinitive).includes(search));
  const setChosen = (infinitives: readonly string[], on: boolean) => onChange((current) => {
    const chosen = new Set(current.chosen);
    for (const infinitive of infinitives) if (on) chosen.add(infinitive); else chosen.delete(infinitive);
    return { ...current, chosen };
  });

  let error = "";
  if (typeLabels.length === 0) error = "Elige al menos un tipo de verbo.";
  else if (personLabels.length === 0) error = "Elige al menos un pronombre.";
  else if (draft.source === "historias" && ready && storyVerbs.length === 0) error = "Todavía no has guardado verbos. Guárdalos desde su ficha mientras lees.";
  else if (draft.source === "elegir" && chosenCount === 0) error = "Marca al menos un verbo.";
  else if (ready && pool.pairs.length === 0) error = "Ningún verbo elegido tiene frases con estos tipos y pronombres.";
  const waiting = draft.source === "historias" && !ready;

  return <main className={verbs.settingsMain}>
    <Link aria-label="Volver a Práctica" className={verbs.iconBack} href={PRACTICE_HREF}><BackIcon /></Link>
    <header className={verbs.settingsHead}>
      <h1 className={verbs.settingsTitle}>Verbos A1.</h1>
    </header>

    <div className={verbs.settings}>
      <section aria-labelledby="verbos-preferencias">
        <h2 className={verbs.sectionLabel} id="verbos-preferencias">Preferencias</h2>
        <div className={verbs.pickers}>
          <Picker empty="" id="panel-tiempos" label="Tiempos" onClose={() => setOpenPicker(null)} onToggle={() => toggle("tiempos")} open={openPicker === "tiempos"} value="Presente de indicativo">
            <fieldset>
              <legend>Tiempos del nivel A1</legend>
              <div className={verbs.checkList}><Check checked label="Presente de indicativo" locked /></div>
            </fieldset>
          </Picker>

          <Picker empty="Elige al menos un tipo de verbo" id="panel-tipos" label="Tipos de verbo" onClose={() => setOpenPicker(null)} onToggle={() => toggle("tipos")} open={openPicker === "tipos"} value={typeLabels.join(", ")}>
            <fieldset>
              <legend>Tipos de verbo</legend>
              <div className={verbs.checkList}>
                {VERB_GROUPS.map((group) => <Check
                  after={<span className={verbs.checkCount}>{A1_VERBS.filter((verb) => verb.category === group.id).length}</span>}
                  checked={draft.groups[group.id]}
                  key={group.id}
                  label={group.label}
                  onChange={(on) => onChange((current) => ({ ...current, groups: { ...current.groups, [group.id]: on } }))}
                />)}
                <hr className={verbs.checkRule} />
                <Check
                  after={<span className={verbs.checkCount}>{A1_VERBS.filter((verb) => verb.category === "refl").length}</span>}
                  checked={draft.reflexive}
                  label="Incluir verbos reflexivos"
                  onChange={(on) => onChange((current) => ({ ...current, reflexive: on }))}
                />
              </div>
            </fieldset>
          </Picker>

          <Picker empty="Elige al menos un pronombre" id="panel-pronombres" label="Pronombres" onClose={() => setOpenPicker(null)} onToggle={() => toggle("pronombres")} open={openPicker === "pronombres"} value={personLabels.join(", ")}>
            <fieldset>
              <legend>Pronombres</legend>
              <div className={verbs.checkList}>
                {CONJUGATION_PERSONS.map((person, index) => <Check
                  after={person.tag === undefined ? undefined : <span className={verbs.tag}>{person.tag}</span>}
                  checked={draft.persons[index]}
                  key={person.label}
                  label={person.label}
                  onChange={(on) => onChange((current) => ({ ...current, persons: current.persons.map((value, i) => i === index ? on : value) }))}
                />)}
              </div>
            </fieldset>
          </Picker>
        </div>
      </section>

      <section aria-labelledby="verbos-origen">
        <h2 className={verbs.sectionLabel} id="verbos-origen"><label htmlFor="verbos-fuente">Verbos</label></h2>
        <div className={verbs.fieldRow}>
          <select className={`${verbs.select} ${verbs.sourceSelect}`} id="verbos-fuente" onChange={(event) => onChange((current) => ({ ...current, source: event.target.value as VerbSource }))} value={draft.source}>
            <option value="todos">Todos los verbos A1</option>
            <option value="historias">Verbos de tus historias</option>
            <option value="elegir">Elegir verbos</option>
          </select>
        </div>
        <p className={verbs.fieldNote}>
          {draft.source === "historias"
            ? ready ? <><strong>{storyCount}</strong> de {storyVerbs.length} {storyVerbs.length === 1 ? "verbo que guardaste entra" : "verbos que guardaste entran"} en la práctica</> : " "
            : <><strong>{draft.source === "todos" ? typesOn.length : chosenCount}</strong> de {A1_VERBS.length} verbos entran en la práctica</>}
        </p>
        {draft.source === "elegir" ? <div className={verbs.chooser}>
          <div className={verbs.chooserTools}>
            <input aria-label="Buscar verbo" autoComplete="off" className={verbs.search} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar verbo" spellCheck={false} type="search" value={query} />
            <button className={verbs.textButton} onClick={() => setChosen(visible.map((verb) => verb.infinitive), true)} type="button">Marcar todos</button>
            <button className={verbs.textButton} onClick={() => setChosen(visible.map((verb) => verb.infinitive), false)} type="button">Quitar todos</button>
          </div>
          <div className={verbs.chooserScroll}>
            {visible.length === 0
              ? <p className={verbs.chooserEmpty}>Ningún verbo coincide. Revisa la búsqueda o los tipos de verbo.</p>
              : [...VERB_GROUPS, { id: "refl" as const, label: "Reflexivos" }].map((group) => {
                const inGroup = visible.filter((verb) => verb.category === group.id);
                return inGroup.length === 0 ? null : <div className={verbs.chooserGroup} key={group.id}>
                  <h3>{group.label}</h3>
                  <ul className={verbs.verbGrid}>
                    {inGroup.map((verb) => <li key={verb.infinitive}>
                      <Check checked={draft.chosen.has(verb.infinitive)} label={verb.infinitive} onChange={(on) => setChosen([verb.infinitive], on)} />
                    </li>)}
                  </ul>
                </div>;
              })}
          </div>
        </div> : null}
      </section>

      <section aria-labelledby="verbos-longitud">
        <h2 className={verbs.sectionLabel} id="verbos-longitud"><label htmlFor="verbos-preguntas">Longitud</label></h2>
        <div className={verbs.fieldRow}>
          <select className={`${verbs.select} ${verbs.lengthSelect}`} id="verbos-preguntas" onChange={(event) => onChange((current) => ({ ...current, length: Number(event.target.value) }))} value={draft.length}>
            {LENGTHS.map((length) => <option key={length} value={length}>{length}</option>)}
          </select>
          <span className={verbs.fieldUnit}>preguntas</span>
        </div>
      </section>
    </div>

    <div className={verbs.startBar}>
      <div className={verbs.startInner}>
        <button className={`${styles.button} ${styles.primary} ${verbs.startButton}`} disabled={error !== "" || waiting} onClick={onStart} type="button">Empezar práctica</button>
        <p className={`${verbs.startSummary} ${error === "" ? "" : verbs.isError}`} role="status">
          {error !== "" ? error : waiting ? " " : `${draft.length} preguntas con ${pool.verbCount} ${pool.verbCount === 1 ? "verbo" : "verbos"}`}
        </p>
      </div>
    </div>
  </main>;
}

/* ── práctica ── */

type Spark = { readonly x: number; readonly y: number; readonly color: string; readonly delay: number };

function Drill({ initial, source, onExit, onAgain }: { initial: ConjugationSession; source: VerbSource; onExit: () => void; onAgain: () => void }) {
  const [session, setSession] = useState(initial);
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState("");
  const [sparks, setSparks] = useState<readonly Spark[]>([]);
  const [table, setTable] = useState<"hover" | "click" | null>(null);
  const [soundOn, setSoundOn] = useState(readSoundPreference);
  const [soundAvailable] = useState(canPlayPracticeSound);
  const soundRef = useRef(soundOn);
  const locked = useRef(false);
  const timers = useRef<number[]>([]);
  const hoverTimer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const blankRef = useRef<HTMLSpanElement>(null);
  const streakRef = useRef<HTMLSpanElement>(null);
  const clueRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const question = currentConjugationQuestion(session);
  const attempt = currentConjugationAttempt(session);
  const verb = question === undefined ? undefined : findConjugationVerb(question.infinitive);
  const total = session.questions.length;
  const done = session.status === "FINISHED" ? total : session.index + (session.status === "FEEDBACK" ? 1 : 0);

  const later = (action: () => void, ms: number) => { timers.current.push(window.setTimeout(action, ms)); };
  const clearTimers = () => { timers.current.forEach(window.clearTimeout); timers.current = []; };
  const cue = (name: PracticeCue, streak?: number) => { if (soundRef.current) playPracticeCue(name, { streak }); };
  const say = (text: string) => { if (soundRef.current) speakSpanish(text); };

  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout);
    window.clearTimeout(hoverTimer.current);
    stopSpanishSpeech();
  }, []);

  // El foco acompaña la única tarea: escribir, pasar a la siguiente o leer el resultado.
  useEffect(() => {
    if (session.status === "ANSWERING") inputRef.current?.focus();
    else if (session.status === "FINISHED") document.getElementById(RESULT_HEADING_ID)?.focus();
  }, [session.status, session.index]);

  /* tabla del verbo: se coloca encima de la pista, o debajo si no cabe */
  useLayoutEffect(() => {
    const pop = popRef.current;
    const clue = clueRef.current;
    if (table === null || pop === null || clue === null) return;
    const rect = clue.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - pop.offsetWidth / 2), window.innerWidth - pop.offsetWidth - 12);
    const above = rect.top - pop.offsetHeight - 10;
    pop.style.left = `${left}px`;
    pop.style.top = `${above < 12 ? rect.bottom + 10 : above}px`;
  }, [table]);

  useEffect(() => {
    if (table === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setTable(null); clueRef.current?.focus(); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popRef.current?.contains(target) && !clueRef.current?.contains(target)) setTable(null);
    };
    const onResize = () => setTable(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [table]);

  const openTable = (by: "hover" | "click") => {
    if (session.status !== "FEEDBACK") return;
    window.clearTimeout(hoverTimer.current);
    setTable(by);
  };
  const closeSoon = () => {
    if (table !== "hover") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setTable(null), 180);
  };

  const nudge = () => {
    if (prefersReducedMotion()) return;
    blankRef.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }], { duration: 320, easing: "ease" });
  };
  const bump = () => {
    if (prefersReducedMotion()) return;
    streakRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 450, easing: "ease" });
  };
  const burst = () => {
    if (prefersReducedMotion()) return;
    setSparks(Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 30 + Math.random() * 34;
      return { x: Math.cos(angle) * distance * 1.7, y: Math.sin(angle) * distance, color: SPARK_COLORS[i % SPARK_COLORS.length], delay: Math.round(Math.random() * 70) };
    }));
    later(() => setSparks([]), 900);
  };

  const answer = (answered: ConjugationSession) => {
    const result = currentConjugationAttempt(answered);
    if (result === undefined) return;
    const spoken = sentenceWithAnswer(result.question);
    setSession(answered);
    setNote("");
    if (result.outcome === "CORRECT") {
      cue("correct", answered.streak);
      bump();
      burst();
      locked.current = true;
      later(() => { locked.current = false; }, 350);
      later(() => setSettled(true), 1000);
      later(() => say(spoken), 420);
    } else if (result.outcome === "INCORRECT") {
      cue("incorrect");
      nudge();
      locked.current = true;
      later(() => { setRevealed(true); locked.current = false; say(spoken); }, 750);
    } else {
      setRevealed(true);
      say(spoken);
    }
    checkRef.current?.focus();
  };

  const next = () => {
    clearTimers();
    window.clearTimeout(hoverTimer.current);
    stopSpanishSpeech();
    locked.current = false;
    const moved = nextConjugationQuestion(session);
    setSession(moved);
    setResponse("");
    setRevealed(false);
    setSettled(false);
    setNote("");
    setSparks([]);
    setTable(null);
    if (moved.status === "FINISHED") cue("finish");
    if (moved !== session && moved.status === "FINISHED") recordConjugationSession(moved, source);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current) return;
    if (session.status === "FEEDBACK") { next(); return; }
    if (session.status !== "ANSWERING") return;
    if (response.trim() === "") {
      setNote("Escribe la forma del verbo o pulsa «No lo sé».");
      nudge();
      inputRef.current?.focus();
      return;
    }
    answer(submitConjugationAnswer(session, response));
  };

  const insertLetter = (letter: string) => {
    const input = inputRef.current;
    if (input === null || session.status !== "ANSWERING") return;
    const start = input.selectionStart ?? response.length;
    const end = input.selectionEnd ?? start;
    setResponse(response.slice(0, start) + letter + response.slice(end));
    setNote("");
    window.requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + 1, start + 1); });
  };

  const toggleSound = () => {
    const on = !soundOn;
    soundRef.current = on;
    setSoundOn(on);
    saveSoundPreference(on);
    if (!on) stopSpanishSpeech();
  };

  const topBar = <div className={verbs.stageBar}>
    <button aria-label="Salir de la práctica" className={`${verbs.iconButton} ${verbs.stageClose}`} onClick={onExit} type="button"><CloseIcon /></button>
    <div aria-label="Preguntas respondidas" aria-valuemax={total} aria-valuemin={0} aria-valuenow={done} aria-valuetext={`${done} de ${total} preguntas`} className={verbs.track} role="progressbar">
      <div className={verbs.trackFill} style={{ width: `${(done / total) * 100}%` }} />
      <span aria-hidden="true" className={`${verbs.trackGoal} ${done === total ? verbs.isDone : ""}`}>
        <svg focusable="false" width="11" height="11" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5L19.5 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" /></svg>
      </span>
    </div>
    <div className={verbs.stageTools}>
      <span aria-label={`Racha: ${session.streak} ${session.streak === 1 ? "correcta seguida" : "correctas seguidas"}`} className={verbs.streak} ref={streakRef} role="img" title="Correctas seguidas">
        <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24"><path d="M13.2 2 5 13.4h6.1L10.4 22l8.6-11.6h-6.2L13.2 2Z" fill="currentColor" /></svg>
        <span aria-hidden="true">{session.streak}</span>
      </span>
      {soundAvailable
        ? <button aria-label="Sonido: efectos y lectura de las frases" aria-pressed={soundOn} className={`${verbs.iconButton} ${verbs.stageSound}`} onClick={toggleSound} title={soundOn ? "Silenciar" : "Activar sonido"} type="button"><SoundIcon on={soundOn} /></button>
        : null}
    </div>
  </div>;

  if (session.status === "FINISHED") {
    const summary = summarizeConjugationSession(session);
    return <>
      {topBar}
      <section aria-labelledby={RESULT_HEADING_ID} className={verbs.results}>
        <h1 className={verbs.resultScore} id={RESULT_HEADING_ID} tabIndex={-1}>{summary.correct} <span>de {summary.total}</span></h1>
        <p className={verbs.resultLead}>{summary.misses.length > 0
          ? "Estas son las formas que fallaste. Repásalas y vuelve a intentarlo."
          : "Todas correctas. Prueba con más preguntas o con otros pronombres."}</p>
        {summary.misses.length > 0 ? <ol className={verbs.missList}>
          <li aria-hidden="true" className={verbs.missHead}><span>Frase</span><span>Escribiste</span><span>Respuesta</span></li>
          {summary.misses.map((miss, index) => <li key={index}>
            <span className={verbs.missWho} lang="es">{miss.question.before} … ({miss.question.infinitive})</span>
            <span className={`${verbs.missGiven} ${miss.response === "" ? verbs.isBlank : ""}`} lang="es">{miss.response === "" ? "sin respuesta" : miss.response}</span>
            <span className={verbs.missRight} lang="es">{miss.question.accepted.join(" o ")}</span>
          </li>)}
        </ol> : null}
        <div className={verbs.resultActions}>
          <button className={`${styles.button} ${styles.primary}`} onClick={onAgain} type="button">Practicar otra vez</button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={onExit} type="button">Cambiar ajustes</button>
          <Link className={verbs.resultLink} href={PRACTICE_HREF}>Volver a Práctica</Link>
        </div>
      </section>
    </>;
  }

  if (question === undefined || verb === undefined) return topBar;

  const isLast = session.index + 1 === total;
  const nextLabel = isLast ? "Ver resultado" : "Continuar";
  const outcome = attempt?.outcome;
  const showReveal = outcome === "REVEALED" || (outcome === "INCORRECT" && revealed);
  const clozeState = outcome === undefined ? "" : `${verbs.isAnswered} ${outcome === "CORRECT" ? verbs.isRight : verbs.isWrong}`;
  let checkLabel = "Comprobar";
  let checkState = "";
  if (outcome === "CORRECT") { checkLabel = settled ? nextLabel : "¡Correcto!"; checkState = verbs.isRight; }
  else if (outcome === "INCORRECT") { checkLabel = revealed ? nextLabel : "Incorrecto"; checkState = revealed ? "" : verbs.isWrong; }
  else if (outcome === "REVEALED") checkLabel = nextLabel;
  const longest = Math.max(...question.accepted.map((form) => form.length)) + 1;
  const status = attempt === undefined
    ? ""
    : attempt.outcome === "CORRECT"
      ? `Correcto. ${sentenceWithAnswer(question, attempt.response)}`
      : showReveal ? `${attempt.outcome === "INCORRECT" ? "Incorrecto. " : ""}La respuesta es ${question.accepted.join(" o ")}.` : "Incorrecto.";
  const verbTable = table === null ? null : conjugationTable(verb);

  return <>
    {topBar}
    <form autoComplete="off" className={`${verbs.cloze} ${clozeState}`} noValidate onSubmit={submit}>
      <p className={verbs.clozeTense}>Presente</p>
      <p className={verbs.sentence} lang="es">
        {question.before}{" "}
        <span className={verbs.blank} ref={blankRef}>
          <input
            aria-label={`Completa: ${question.before} … (${question.infinitive}) ${question.after}`}
            autoCapitalize="off"
            autoCorrect="off"
            enterKeyHint="go"
            onChange={(event) => { setResponse(event.target.value); setNote(""); }}
            readOnly={session.status !== "ANSWERING"}
            ref={inputRef}
            spellCheck={false}
            style={{ "--len": Math.max(longest, response.length + 1) } as CSSProperties}
            type="text"
            value={response}
          />
          {sparks.map((spark, index) => <span aria-hidden="true" className={verbs.spark} key={index} style={{ "--x": `${spark.x}px`, "--y": `${spark.y}px`, "--c": spark.color, animationDelay: `${spark.delay}ms` } as CSSProperties} />)}
        </span>{" "}
        <button
          aria-controls="verbos-tabla"
          aria-expanded={table !== null}
          aria-haspopup="dialog"
          className={verbs.clue}
          disabled={session.status !== "FEEDBACK"}
          onClick={() => table === null || table === "hover" ? openTable("click") : setTable(null)}
          onPointerEnter={(event) => { if (event.pointerType === "mouse" && table === null) openTable("hover"); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") closeSoon(); }}
          ref={clueRef}
          title={session.status === "FEEDBACK" ? `Ver el presente de ${question.infinitive}` : undefined}
          type="button"
        >({question.infinitive})</button>
        {` ${question.after}`}
      </p>
      {verb.hint === undefined ? null : <p className={verbs.clozeHint}>{verb.hint}</p>}
      {showReveal ? <p className={verbs.reveal}>
        <span lang="es">{question.accepted.join(" o ")}</span>
        <button aria-label="Escuchar la respuesta" className={verbs.iconButton} onClick={() => speakSpanish(question.accepted[0])} type="button">
          <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
        </button>
      </p> : null}
      <p className={verbs.revealNote}>{showReveal && attempt !== undefined ? attempt.accentsOnly ? "Casi. Revisa las tildes o la ñ." : `${verb.note}.` : note}</p>
      <button className={`${verbs.checkButton} ${checkState}`} ref={checkRef} type="submit">{checkLabel}</button>
      <div className={verbs.helpers}>
        <div aria-label="Letras especiales" className={verbs.accentKeys} role="group">
          {ACCENT_KEYS.map((letter) => <button key={letter} onClick={() => insertLetter(letter)} onMouseDown={(event) => event.preventDefault()} tabIndex={session.status === "ANSWERING" ? 0 : -1} type="button">{letter}</button>)}
        </div>
        <button className={verbs.dontKnow} onClick={() => { if (session.status === "ANSWERING") answer(revealConjugationAnswer(session)); }} tabIndex={session.status === "ANSWERING" ? 0 : -1} type="button">No lo sé</button>
      </div>
      <p className={verbs.srOnly} role="status">{status}</p>
    </form>

    {verbTable === null ? null : <div
      aria-labelledby="verbos-tabla-titulo"
      className={verbs.tablePop}
      id="verbos-tabla"
      onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") closeSoon(); }}
      ref={popRef}
      role="dialog"
    >
      <p className={verbs.tableTitle} id="verbos-tabla-titulo">Presente de {verb.infinitive}</p>
      <p className={verbs.tableNote}>{verb.note}.{verbTable.hasIrregular ? <> Lo que no sigue la regla va <mark>marcado</mark>.</> : null}</p>
      <table className={verbs.tableForms}>
        <tbody>
          {verbTable.rows.map((row) => <tr className={row.person === question.person ? verbs.isCurrent : undefined} key={row.person}>
            <th scope="row">{conjugationPersonLabel(verb, row.person)}</th>
            <td lang="es">{row.alternatives.map((parts, index) => <span key={index}>
              {index > 0 ? " / " : null}
              {parts.map((part, i) => part.irregular ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}
            </span>)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
  </>;
}

/* ── pantalla ── */

export function ConjugationScreen({ occurrences, initialSource }: { occurrences: readonly PracticeOccurrence[]; initialSource: VerbSource }) {
  const { ready, items } = usePracticeItems();
  const storyVerbs = useMemo(() => savedConjugationVerbs(items, occurrences), [items, occurrences]);
  const [draft, setDraft] = useState(() => initialDraft(initialSource));
  const [run, setRun] = useState<{ readonly id: number; readonly session: ConjugationSession } | null>(null);

  const start = () => {
    const session = startConjugationSession(settingsOf(draft, storyVerbs));
    if (session === null) return;
    setRun((current) => ({ id: (current?.id ?? 0) + 1, session }));
    window.scrollTo(0, 0);
  };
  const exit = () => {
    setRun(null);
    window.scrollTo(0, 0);
  };

  if (run !== null) {
    return <div className={`${styles.page} ${verbs.screen} ${verbs.isDrill}`}>
      <Drill initial={run.session} key={run.id} source={draft.source} onAgain={start} onExit={exit} />
    </div>;
  }
  return <div className={`${styles.page} ${verbs.screen}`}>
    <BaselineNav />
    <SettingsView draft={draft} onChange={setDraft} onStart={start} ready={ready} storyVerbs={storyVerbs} />
  </div>;
}
