"use client";

import Link from "next/link";
import { useState } from "react";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const FIRST_STORY_HREF = "/islas/01/01";

// Tres momentos de la Historia 1: llegada, malentendido y bienvenida.
const SCENE_STRIP = [
  { src: "/stories/historia-01/scenes/scene-01.png", alt: "Samuel llega a su nueva escuela en Bogotá" },
  { src: "/stories/historia-01/scenes/scene-05.png", alt: "Samuel explica que su apellido es Gómez, no López" },
  { src: "/stories/historia-01/scenes/scene-08.png", alt: "El Sr. Taylor da la bienvenida a Samuel" },
] as const;

// Demo con frases reales de la Historia 1 («Primer día de clases en Bogotá»).
const words = {
  Hola: { category: "Interjección", translation: "hello / hi", definition: "Se usa para saludar cuando encuentras o te diriges a alguien." },
  Perdón: { category: "Expresión", translation: "sorry / excuse me", definition: "Se dice para disculparse o para pedir atención con educación." },
  señor: { category: "Sustantivo masculino", translation: "sir / Mr.", definition: "Forma respetuosa de dirigirse a un hombre." },
  apellido: { category: "Sustantivo masculino", translation: "surname / last name", definition: "Nombre de familia que va después del nombre." },
} as const;
type Word = keyof typeof words;

export function LandingScreen({ islandNames, storyCount }: { islandNames: readonly string[]; storyCount: number }) {
  const [selectedWord, setSelectedWord] = useState<Word>("Hola");
  const selected = words[selectedWord];
  const marquee = `${islandNames.join(" · ")} ·`;
  return <div className={`${styles.page} standalone-layer`} data-standalone="landing">
    <BaselineNav />
    <main>
      <section className={styles.hero} id="top"><div data-motion="hero-copy"><p className={styles.eyebrow}>Pre-alfa · A1 → C1</p><h1 data-motion="hero-lines"><span>Aprende español</span><span>leyendo historias</span><span><em>que se conectan.</em></span></h1><p className={styles.heroCopy}>Cada historia te deja palabras. Vuelven dentro de otra historia, en otra isla, cuando ya casi las habías olvidado. Ese es todo el método.</p><div className={styles.actions}><Link className={`${styles.button} ${styles.primary}`} href="/islas">Empezar por A1 <span aria-hidden>↗</span></Link><Link className={`${styles.button} ${styles.secondary}`} href="/niveles">Comparar niveles</Link></div></div><Link className={styles.portraitLink} href={FIRST_STORY_HREF}><div className={styles.portrait} data-motion="hero-portrait"><img src="/stories/historia-01/scenes/scene-01.png" alt="Samuel llega a su nueva escuela en Bogotá" /></div><span className={styles.portraitCaption}>Samuel, en «Primer día de clases en Bogotá»</span></Link></section>
      <div className={styles.marquee} data-motion="marquee"><span>{marquee}</span><span aria-hidden>{marquee}</span></div>
      <section className={styles.stats} aria-label="SpanStories en cifras"><Stat value="0" label="rachas que perder" /><Stat value="0" label="vidas, corazones, medallas" /><Stat value={String(storyCount)} label="historias en A1" accent /><Stat value="5" label="niveles previstos, de A1 a C1" /></section>
      <section className={styles.method} id="metodo"><div className={styles.sectionLabel}>Cómo funciona</div><div className={styles.methodRows}><Method number="01" title="Eliges tu nivel">No empezamos por el verbo ser. Empezamos por una historia que puedes entender.</Method><Method number="02" title="Lees una historia">Corta, real, escrita para volver a ella. Sin ejercicios antes. Sin lista de palabras.</Method><Method number="03" title="Las palabras vuelven">Una palabra que viste ayer aparece hoy en otro lugar. La reconoces antes de traducirla.</Method><Method number="04" title="Se abre una isla">Cada grupo de historias construye un lugar. Cuando estás listo, puedes entrar más lejos.</Method></div></section>
      <div className={`${styles.wideImage} ${styles.sceneStrip}`} data-motion="wide-image" id="islas">{SCENE_STRIP.map((scene) => <img alt={scene.alt} key={scene.src} src={scene.src} />)}</div>
      <section className={styles.readerDemo} id="progreso"><div className={styles.readerAside} data-motion="reader-aside"><p className={styles.eyebrow}>Demo de lectura</p><h2>Toca una<br /><em>palabra.</em></h2><p>Las palabras importantes se quedan cerca. Tócalas para ver qué hacen aquí.</p><div className={styles.wordCard} aria-live="polite"><strong lang="es">{selectedWord}</strong><span>{selected.category}</span><p className={styles.wordTranslation} lang="en">{selected.translation}</p><p>{selected.definition}</p></div></div><article className={styles.story}><p className={styles.eyebrow}>A1 · Isla 01 · Primeros contactos</p><h3>Primer día de clases en Bogotá</h3><p><WordButton word="Hola" selected={selectedWord} onSelect={setSelectedWord} />. Yo soy Samuel. Soy de Argentina.</p><p>—¿Quién es Samuel López?</p><p>—Eh… <WordButton word="Perdón" selected={selectedWord} onSelect={setSelectedWord} />, <WordButton word="señor" selected={selectedWord} onSelect={setSelectedWord} />. Yo soy Samuel Gómez, no López. El <WordButton word="apellido" selected={selectedWord} onSelect={setSelectedWord} /> es Gómez.</p><Link className={styles.storyLink} href={FIRST_STORY_HREF}>Leer la historia completa</Link></article></section>
      <section className={styles.closing} id="aviso"><div><p className={styles.eyebrow}>El principio</p><h2 data-motion="closing-title"><span>Las primeras islas</span><span><em>se están escribiendo.</em></span></h2></div><div><p>Estamos en pre-alfa. La primera isla de A1 ya se puede leer; las siguientes llegarán poco a poco.</p><Link className={`${styles.button} ${styles.darkButton} ${styles.closingAction}`} href={FIRST_STORY_HREF}>Leer la primera historia</Link></div></section>
    </main><footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) { return <div className={styles.stat} data-motion="reveal"><strong className={accent ? styles.accentText : undefined}>{value}</strong><span>{label}</span></div>; }
function Method({ number, title, children }: { number: string; title: string; children: string }) { return <div className={styles.methodRow} data-motion="method-row"><span className={styles.methodNumber}>{number}</span><h3>{title}</h3><p>{children}</p></div>; }
function WordButton({ word, selected, onSelect }: { word: Word; selected: Word; onSelect: (word: Word) => void }) { return <button aria-pressed={selected === word} className={`${styles.word} ${selected === word ? styles.wordSelected : ""}`} lang="es" onClick={() => onSelect(word)} type="button">{word}</button>; }
