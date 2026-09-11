"use client";

import { useState } from "react";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const islands = [
  ["01", "El mercado", "Completada · 6/6", "done", 100, 290, "labelBottom"],
  ["02", "La casa de la abuela", "En curso · 2/6", "current", 280, 130, "labelTop"],
  ["03", "Trámites", "Bloqueada", "locked", 280, 450, "labelBottom"],
  ["04", "El último autobús", "Bloqueada", "locked", 480, 290, "labelBottom"],
  ["05", "Vecinos", "Bloqueada", "locked", 700, 290, "labelBottom"],
  ["06", "La cocina de la tía", "Bloqueada", "locked", 900, 130, "labelTop"],
  ["07", "La azotea", "Bloqueada", "locked", 900, 450, "labelBottom"],
  ["08", "El domingo", "Bloqueada · cierre de módulo", "locked", 1080, 290, "labelBottom"],
] as const;

export function ProgressScreen() {
  const [routeMotion, setRouteMotion] = useState(true);
  const [nodeMotion, setNodeMotion] = useState(true);
  const [animationRun, setAnimationRun] = useState(0);

  return <div className={`${styles.page} standalone-layer`} data-standalone="progress"><BaselineNav />
    <main className={styles.referenceProgress} id="progreso"><header className={styles.referenceHeader}><p className={styles.eyebrow}>Tu avance · A2</p><h1>Progreso.</h1></header><section className={styles.referenceMap} data-route-motion={routeMotion ? "on" : "off"} data-node-motion={nodeMotion ? "on" : "off"}>
      <div className={styles.referenceMapHeader}><div><p>A2 · Módulo 2 — El barrio</p><h2>El mapa del barrio.</h2></div><div className={styles.referenceSummary}><span>8/44 lecciones · 18%</span><i><b /></i><em>Estás en la historia 02 de 08</em></div></div>
      <aside className={styles.animationTools} aria-label="Herramientas de animación"><p>Herramientas</p><h2>Animación</h2><button type="button" aria-pressed={routeMotion} onClick={() => setRouteMotion((active) => !active)}><span>Ruta</span><b>{routeMotion ? "Activa" : "Pausada"}</b></button><button type="button" aria-pressed={nodeMotion} onClick={() => setNodeMotion((active) => !active)}><span>Nodo actual</span><b>{nodeMotion ? "Activo" : "Pausado"}</b></button><button className={styles.replayButton} type="button" onClick={() => setAnimationRun((run) => run + 1)}>Reproducir</button></aside>
      <div className={styles.mapScroller}><div className={styles.mapCanvas} key={animationRun}><svg viewBox="0 0 1180 580" aria-hidden="true">
        <path className={styles.mapFuture} d="M 100 290 L 280 130 L 480 290 L 700 290 L 900 130 L 1080 290" />
        <path className={styles.mapFuture} d="M 100 290 L 280 450 L 480 290" />
        <path className={styles.mapFuture} d="M 700 290 L 900 450 L 1080 290" />
        <path className={styles.mapDone} d="M 100 290 L 280 130" pathLength="1" />
        <circle className={styles.mapTraveller} r="7"><animateMotion dur="2.6s" repeatCount="indefinite" path="M 100 290 L 280 130" /></circle>
      </svg><span className={styles.storyDirection} aria-hidden="true">Tu recorrido</span>{islands.map(([number,name,status,state,x,y,labelPosition],index) => <article className={`${styles.mapIsland} ${styles[state]} ${styles[labelPosition]}`} key={number} style={{left:x,top:y,animationDelay:`${index*.12}s`}}><div className={styles.mapNode}>{state === "done" ? "✓" : state === "current" ? <><small>{number}</small><strong>2/6</strong></> : number}</div><div className={styles.mapLabel}><h3>{name}</h3><p>{status}</p></div></article>)}</div></div>
      <div className={styles.mapLegend}><span><i className={styles.legendDone} />Completada</span><span><i className={styles.legendCurrent} />En curso</span><span><i className={styles.legendLocked} />Bloqueada</span></div>
    </section></main><footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
