"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { A1Island, A1Module } from "@/lib/adapters/a1-catalog";
import { BaselineNav } from "../layouts/BaselineNav";
import { storyHref, storyKey, useReadingMemory } from "../reading-memory";
import { LockIcon } from "./IslandGrid";
import styles from "./baseline.module.css";
import progress from "./progress.module.css";

function CheckIcon() {
  return <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" /></svg>;
}

type IslandState = "done" | "current" | "locked" | "available";

export function ProgressScreen({ modules, storyCount }: { modules: readonly A1Module[]; storyCount: number }) {
  const { finished, lastStory, savedWords } = useReadingMemory();
  const islands = modules.flatMap((entry) => entry.islands);
  const readCount = (island: A1Island) => island.stories.filter((story) => finished.includes(storyKey(story.island, story.story))).length;
  const currentIsland = islands.find((island) => island.published && readCount(island) < island.stories.length);
  const stateOf = (island: A1Island): IslandState => {
    if (!island.published) return "locked";
    if (readCount(island) === island.stories.length) return "done";
    return island === currentIsland ? "current" : "available";
  };
  const finishedCount = islands.reduce((total, island) => total + readCount(island), 0);
  const nextUnread = islands.filter((island) => island.published).flatMap((island) => island.stories).find((story) => !finished.includes(storyKey(story.island, story.story)));
  const resume = lastStory !== null && !finished.includes(storyKey(lastStory.island, lastStory.story)) ? lastStory : null;

  return <div className={`${styles.page} standalone-layer`} data-standalone="progress"><BaselineNav />
    <main className={progress.main}>
      <header><p className={styles.eyebrow}>Tu avance en A1</p><h1 className={progress.title}>Progreso.</h1></header>

      <section className={progress.summary} aria-label="Resumen">
        <div className={progress.next}>
          {resume !== null
            ? <><p className={progress.label}>Seguías leyendo</p><h2>{resume.title}</h2><Link className={`${styles.button} ${styles.primary}`} href={storyHref(resume)}>Continuar leyendo</Link></>
            : nextUnread !== undefined
              ? <><p className={progress.label}>{finishedCount === 0 ? "Tu primera historia" : "Siguiente historia"}</p><h2>{nextUnread.title}</h2><Link className={`${styles.button} ${styles.primary}`} href={nextUnread.href}>{finishedCount === 0 ? "Empezar a leer" : "Leer ahora"}</Link></>
              : <><p className={progress.label}>Al día</p><h2>Has leído todas las historias publicadas.</h2><Link className={`${styles.button} ${styles.secondary}`} href="/islas">Ver islas</Link></>}
        </div>
        <div className={progress.stat}>
          <strong>{finishedCount}</strong><span>de {storyCount} historias leídas</span>
          <div className={progress.bar} role="img" aria-label={`${finishedCount} de ${storyCount} historias leídas`}><i style={{ width: `${(finishedCount / storyCount) * 100}%` }} /></div>
        </div>
        <div className={progress.stat}>
          <strong>{savedWords.length}</strong><span>{savedWords.length === 1 ? "palabra guardada" : "palabras guardadas"}</span>
          {savedWords.length > 0 ? <ul className={progress.savedWords} lang="es">{savedWords.map((word) => <li key={word.key}>{word.surface}</li>)}</ul> : <p className={progress.hint}>Guarda palabras desde su ficha mientras lees.</p>}
        </div>
      </section>

      <section aria-labelledby="recorrido-a1">
        <h2 className={progress.routeTitle} id="recorrido-a1">Recorrido de A1</h2>
        <ol className={progress.modules}>
          {modules.map((entry) => <li className={progress.module} key={entry.order}>
            <p className={progress.moduleName}>Módulo {entry.order}<b>{entry.name}</b></p>
            <ol className={progress.islands}>
              {entry.islands.map((island) => {
                const state = stateOf(island);
                const read = readCount(island);
                const total = island.stories.length;
                const status = state === "done" ? "Completada" : state === "locked" ? "Próximamente" : `${read} de ${total} historias`;
                const node = <span className={progress.node} style={{ "--progress": read / total } as CSSProperties}>
                  {state === "done" ? <CheckIcon /> : state === "locked" ? <LockIcon /> : <span>{read}/{total}</span>}
                </span>;
                const text = <div><h3>{island.name}</h3><p>{status}</p></div>;
                return <li className={`${progress.island} ${progress[state]}`} key={island.id} aria-current={state === "current" ? "step" : undefined}>
                  {island.published ? <Link className={progress.islandLink} href={island.href}>{node}{text}</Link> : <div className={progress.islandLink}>{node}{text}</div>}
                </li>;
              })}
            </ol>
          </li>)}
        </ol>
      </section>
    </main>
    <footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
