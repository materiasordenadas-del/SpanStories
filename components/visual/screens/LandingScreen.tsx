"use client";

import Link from "next/link";
import { useState } from "react";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const words = {
  vacía: ["Adjetivo", "Que no contiene nada."],
  cojeaba: ["Verbo · cojear", "Andar inclinando el cuerpo más a un lado que a otro."],
  patio: ["Sustantivo · masculino", "Espacio abierto dentro de una casa o edificio."],
  cajón: ["Sustantivo · masculino", "Recipiente que se puede sacar y meter en un mueble."],
} as const;
type Word = keyof typeof words;

export function LandingScreen() {
  const [selectedWord, setSelectedWord] = useState<Word>("vacía");
  const selected = words[selectedWord];
  return <div className={`${styles.page} standalone-layer`} data-standalone="landing">
    <BaselineNav />
    <main>
      <section className={styles.hero} id="top"><div data-motion="hero-copy"><p className={styles.eyebrow}>Pre-alfa · A1 → C1</p><h1 data-motion="hero-lines"><span>Aprende español</span><span>leyendo historias</span><span><em>que se conectan.</em></span></h1><p className={styles.heroCopy}>Cada historia te deja palabras. Vuelven dentro de otra historia, en otra isla, cuando ya casi las habías olvidado. Ese es todo el método.</p><div className={styles.actions}><Link className={`${styles.button} ${styles.primary}`} href="/niveles">Empezar por A1 <span aria-hidden>↗</span></Link><Link className={`${styles.button} ${styles.secondary}`} href="/niveles">No sé mi nivel</Link></div></div><div className={styles.portrait} data-motion="hero-portrait" role="img" aria-label="Placeholder para retrato vertical en blanco y negro"><span>Retrato vertical · b/n</span></div></section>
      <div className={styles.marquee} data-motion="marquee"><span>El mercado · La casa de la abuela · Trámites · El último autobús · Vecinos · La cocina de la tía · El barrio en obras · Cartas sin enviar ·</span><span aria-hidden>El mercado · La casa de la abuela · Trámites · El último autobús · Vecinos · La cocina de la tía · El barrio en obras · Cartas sin enviar ·</span></div>
      <section className={styles.stats} aria-label="SpanStories en cifras"><Stat value="0" label="rachas que perder" /><Stat value="0" label="vidas, corazones, medallas" /><Stat value="38" label="historias escritas a mano" accent /><Stat value="5" label="niveles, de A1 a C1" /></section>
      <section className={styles.method} id="metodo"><div className={styles.sectionLabel}>Cómo funciona</div><div className={styles.methodRows}><Method number="01" title="Eliges tu nivel">No empezamos por el verbo ser. Empezamos por una historia que puedes entender.</Method><Method number="02" title="Lees una historia">Corta, real, escrita para volver a ella. Sin ejercicios antes. Sin lista de palabras.</Method><Method number="03" title="Las palabras vuelven">Una palabra que viste ayer aparece hoy en otro lugar. La reconoces antes de traducirla.</Method><Method number="04" title="Se abre una isla">Cada grupo de historias construye un lugar. Cuando estás listo, puedes entrar más lejos.</Method></div></section>
      <div className={styles.wideImage} data-motion="wide-image" id="islas"><span>Foto ancha b/n · mercado, calle, cocina</span></div>
      <section className={styles.readerDemo} id="progreso"><div className={styles.readerAside} data-motion="reader-aside"><p className={styles.eyebrow}>Demo de lectura</p><h2>Toca una<br /><em>palabra.</em></h2><p>Las palabras importantes se quedan cerca. Tócalas para ver qué hacen aquí.</p><div className={styles.wordCard}><strong>{selectedWord}</strong><span>{selected[0]}</span><p>{selected[1]}</p></div></div><article className={styles.story}><p className={styles.eyebrow}>A2 · Isla 02 · La casa de la abuela</p><h3>La mesa de la cocina</h3><p>Cuando llegué, la mesa estaba <WordButton word="vacía" selected={selectedWord} onSelect={setSelectedWord} />. Mi abuela había salido al mercado.</p><p>La puerta del patio estaba abierta. El gato, que <WordButton word="cojeaba" selected={selectedWord} onSelect={setSelectedWord} />, dormía al sol.</p><p>Busqué las llaves en el <WordButton word="cajón" selected={selectedWord} onSelect={setSelectedWord} /> de siempre. No estaban.</p><p>En el <WordButton word="patio" selected={selectedWord} onSelect={setSelectedWord} /> encontré una nota doblada.</p></article></section>
      <section className={styles.closing} id="aviso"><div><p className={styles.eyebrow}>El principio</p><h2 data-motion="closing-title"><span>Las primeras islas</span><span><em>se están escribiendo.</em></span></h2></div><div><p>Estamos en pre-alfa. Déjame tu correo y te aviso cuando A1 se pueda leer de principio a fin.</p><form className={styles.signup} onSubmit={(event) => event.preventDefault()}><input type="email" placeholder="tu@correo.com" aria-label="Correo electrónico" /><button className={`${styles.button} ${styles.darkButton}`} type="submit">Avísame</button></form></div></section>
    </main><footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) { return <div className={styles.stat} data-motion="reveal"><strong className={accent ? styles.accentText : undefined}>{value}</strong><span>{label}</span></div>; }
function Method({ number, title, children }: { number: string; title: string; children: string }) { return <div className={styles.methodRow} data-motion="method-row"><span className={styles.methodNumber}>{number}</span><h3>{title}</h3><p>{children}</p></div>; }
function WordButton({ word, selected, onSelect }: { word: Word; selected: Word; onSelect: (word: Word) => void }) { return <button className={`${styles.word} ${selected === word ? styles.wordSelected : ""}`} onClick={() => onSelect(word)}>{word}</button>; }
