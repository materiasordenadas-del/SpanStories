"use client";

import Link from "next/link";
import { A1_VERBS, PRACTICE_MODES, usePracticeItems, type PracticeModeId, type PracticeOccurrence } from "@/lib/adapters/practice";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";
import practice from "./practice.module.css";

type ModeCopy = {
  readonly name: string;
  readonly description: string;
};

/** Texto de cada modo registrado en features/practice. Un modo nuevo sin texto aquí no compila. */
const MODE_COPY: Readonly<Record<PracticeModeId, ModeCopy>> = {
  flashcards: {
    name: "Flashcards",
    description: "Ves la traducción y escribes la palabra en español.",
  },
  conjugacion: {
    name: "Conjugación de verbos",
    description: "Escribe la forma correcta de cada verbo. Elige con qué verbos quieres practicar.",
  },
};

/** Palabras guardadas que las flashcards todavía no pueden usar. */
const flashcardsWaiting = (count: number) => count === 1
  ? "1 palabra guardada aún no tiene traducción publicada, así que todavía no entra aquí."
  : `${count} palabras guardadas aún no tienen traducción publicada, así que todavía no entran aquí.`;

export function PracticeHubScreen({ occurrences }: { occurrences: readonly PracticeOccurrence[] }) {
  const { ready, items } = usePracticeItems();

  return <div className={`${styles.page} standalone-layer`} data-standalone="practice"><BaselineNav />
    <main className={practice.main}>
      <Link className={styles.backLink} href="/progreso">← Volver a Progreso</Link>
      <header>
        <h1 className={practice.title}>Práctica.</h1>
        <p className={practice.lead}>Repasa las palabras que guardaste mientras lees.</p>
      </header>

      <section aria-labelledby="tipos-de-practica" className={practice.modes}>
        <h2 className={practice.modesTitle} id="tipos-de-practica">Tipos de práctica</h2>
        <ul className={practice.modeList}>
          {PRACTICE_MODES.map((mode) => {
            const copy = MODE_COPY[mode.id];
            const available = mode.countAvailable(items, occurrences);
            const href = `/progreso/practica/${mode.slug}`;

            if (mode.id === "conjugacion") {
              return <li className={practice.mode} key={mode.id}>
                <h3>{copy.name}</h3>
                <p className={practice.description}>{copy.description}</p>
                <ul className={practice.sources}>
                  <li className={practice.sourceRow}>
                    <span className={practice.sourceName}>Verbos de tus historias</span>
                    <span aria-busy={!ready} className={practice.sourceMeta}>{!ready
                      ? " "
                      : available === 0
                        ? "Guarda verbos desde su ficha mientras lees y aparecerán aquí."
                        : `${available} ${available === 1 ? "verbo que guardaste" : "verbos que guardaste"} leyendo`}</span>
                    {ready && available > 0
                      ? <Link aria-label="Practicar verbos de tus historias" className={`${styles.button} ${styles.primary}`} href={`${href}?origen=historias`}>Practicar</Link>
                      : null}
                  </li>
                  <li className={practice.sourceRow}>
                    <span className={practice.sourceName}>Verbos A1</span>
                    <span className={practice.sourceMeta}>{A1_VERBS.length} verbos del nivel en presente de indicativo</span>
                    <Link aria-label="Practicar verbos A1" className={`${styles.button} ${styles.primary}`} href={href}>Practicar</Link>
                  </li>
                </ul>
              </li>;
            }

            const waiting = items.length - available;
            return <li className={practice.mode} key={mode.id}>
              <h3>{copy.name}</h3>
              <p className={practice.description}>{copy.description}</p>
              <p aria-busy={!ready} className={practice.count}>{ready ? `${available} ${available === 1 ? "palabra disponible" : "palabras disponibles"}` : " "}</p>
              {ready && waiting > 0 ? <p className={practice.note}>{flashcardsWaiting(waiting)}</p> : null}
              {ready && items.length === 0 ? <p className={practice.note}>Guarda palabras desde su ficha mientras lees y aparecerán aquí.</p> : null}
              {available > 0
                ? <Link className={`${styles.button} ${styles.primary} ${practice.action}`} href={href}>Practicar</Link>
                : ready && items.length === 0 ? <Link className={`${styles.button} ${styles.secondary} ${practice.action}`} href="/niveles">Ir a las islas</Link> : null}
            </li>;
          })}
        </ul>
      </section>
    </main>
    <footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
