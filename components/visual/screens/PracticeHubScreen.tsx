"use client";

import Link from "next/link";
import { PRACTICE_MODES, usePracticeItems, type PracticeModeId, type PracticeOccurrence } from "@/lib/adapters/practice";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";
import practice from "./practice.module.css";

type ModeCopy = {
  readonly name: string;
  readonly description: string;
  /** Palabras guardadas que este modo todavía no puede usar. */
  readonly waiting: (count: number) => string;
};

/** Texto de cada modo registrado en features/practice. Un modo nuevo sin texto aquí no compila. */
const MODE_COPY: Readonly<Record<PracticeModeId, ModeCopy>> = {
  flashcards: {
    name: "Flashcards",
    description: "Ves la traducción y escribes la palabra en español.",
    waiting: (count) => count === 1
      ? "1 palabra guardada aún no tiene traducción publicada, así que todavía no entra aquí."
      : `${count} palabras guardadas aún no tienen traducción publicada, así que todavía no entran aquí.`,
  },
};

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
            const waiting = items.length - available;
            return <li className={practice.mode} key={mode.id}>
              <h3>{copy.name}</h3>
              <p className={practice.description}>{copy.description}</p>
              <p aria-busy={!ready} className={practice.count}>{ready ? `${available} ${available === 1 ? "palabra disponible" : "palabras disponibles"}` : " "}</p>
              {ready && waiting > 0 ? <p className={practice.note}>{copy.waiting(waiting)}</p> : null}
              {ready && items.length === 0 ? <p className={practice.note}>Guarda palabras desde su ficha mientras lees y aparecerán aquí.</p> : null}
              {available > 0
                ? <Link className={`${styles.button} ${styles.primary} ${practice.action}`} href={`/progreso/practica/${mode.slug}`}>Practicar</Link>
                : ready && items.length === 0 ? <Link className={`${styles.button} ${styles.secondary} ${practice.action}`} href="/islas">Ir a las islas</Link> : null}
            </li>;
          })}
        </ul>
      </section>
    </main>
    <footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
