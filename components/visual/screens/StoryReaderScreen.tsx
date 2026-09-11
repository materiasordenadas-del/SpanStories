"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const titles: Record<string, string> = { "01": "El primer día de clases", "02": "La ficha del grupo", "03": "Conocer a un compañero", "04": "No entiendo" };

const storyParagraphs = [
  <>Hola. Yo soy Samuel.</>, <>Soy de Argentina.</>, <>Hoy voy a mi nueva escuela.</>,
  <>—Buenos días, clase —dice el Sr. Taylor.</>, <>—Hola, buenos días, profesor —dice la clase.</>,
  <>El Sr. Taylor mira la lista y dice:</>, <>—¿Quién es Samuel López?</>, <>Nadie contesta.</>,
  <>—Eh... Perdón, señor. Yo soy Samuel Gómez, no López. El apellido es Gómez.</>,
  <>El Sr. Taylor mira la lista otra vez.</>, <>La lista dice:</>,
  <><strong>NOMBRE:</strong> Samuel<br /><strong>APELLIDO:</strong> López</>,
  <>—¿Hay un Samuel López? —dice el Sr. Taylor.</>, <>—Samuel, ¿de dónde eres?</>,
  <>—Soy de Buenos Aires, Argentina.</>, <>—Bienvenido, Samuel —dice el Sr. Taylor.</>,
  <>—Gracias, señor Taylor —dice Samuel.</>, <>Samuel está contento. Es su primer día de clases.</>,
];

const scenes = [
  { text: "Hola. Yo soy Samuel.\n\nSoy de Argentina.\n\nHoy voy a mi nueva escuela." },
  { text: "Es el primer día de Samuel en su nueva clase." },
  { text: "—Buenos días, clase —dice el Sr. Taylor.\n\n—Hola, buenos días, profesor —dice la clase." },
  { text: "El Sr. Taylor mira la lista y dice:\n\n—¿Quién es Samuel López?\n\nNadie contesta." },
  { text: "—Eh... Perdón, señor. Yo soy Samuel Gómez, no López. El apellido es Gómez." },
  { text: "El Sr. Taylor mira la lista otra vez.\n\nLa lista dice:", roster: true },
  { text: "—¿Hay un Samuel López? —dice el Sr. Taylor.\n\n—Samuel, ¿de dónde eres?" },
  { text: "—Soy de Buenos Aires, Argentina.\n\n—Bienvenido, Samuel —dice el Sr. Taylor.\n\n—Gracias, señor Taylor —dice Samuel." },
  { text: "Samuel está contento.\n\nEs su primer día de clases." },
] as const;

function IllustratedStory({ initialScene, island, story }: { initialScene: number; island: string; story: string }) {
  const [currentScene, setCurrentScene] = useState(initialScene);
  const touchStartX = useRef<number | null>(null);
  const goToScene = (nextScene: number) => setCurrentScene(Math.max(0, Math.min(scenes.length - 1, nextScene)));
  const sceneHref = (scene: number) => `/islas/${island}/${story}?modo=ilustracion&escena=${scene + 1}`;

  return <section className={styles.illustratedStory} aria-label="Historia ilustrada" aria-describedby="illustration-help" tabIndex={0} onKeyDown={(event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goToScene(currentScene + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goToScene(currentScene - 1); }
    if (event.key === "Home") { event.preventDefault(); goToScene(0); }
    if (event.key === "End") { event.preventDefault(); goToScene(scenes.length - 1); }
  }}>
    <div className={styles.illustrationIntro}><p>Primer día de clases en Bogotá</p><span>Samuel pasa de los nervios de la llegada a sentirse parte de su nueva clase.</span></div>
    <p className={styles.illustrationHelp} id="illustration-help">Usa las flechas, desliza o elige una escena. En teclado, usa ← →, Inicio y Fin.</p>
    <div className={styles.sliderViewport} aria-live="polite" aria-atomic="true" onTouchStart={(event) => {
      touchStartX.current = event.touches[0]?.clientX ?? null;
    }} onTouchEnd={(event) => {
      const startX = touchStartX.current;
      touchStartX.current = null;
      if (startX === null) return;
      const distance = startX - (event.changedTouches[0]?.clientX ?? startX);
      if (Math.abs(distance) < 40) return;
      goToScene(currentScene + (distance > 0 ? 1 : -1));
    }}>
      <div className={styles.sliderTrack} style={{ transform: `translateX(-${currentScene * 100}%)` }}>
        {scenes.map((scene, index) => <article className={styles.sceneSlide} key={index} aria-hidden={currentScene !== index}>
          <div className={styles.sceneImage}>
            <img src="/stories/historia-01/primer-dia-bogota-storyboard.png" alt={`Ilustración de la escena ${index + 1}`} style={{ "--scene-column": index % 3, "--scene-row": Math.floor(index / 3) } as CSSProperties} />
            <span className={styles.sceneNumber}>{String(index + 1).padStart(2, "0")}</span>
            {"roster" in scene && scene.roster ? <div className={styles.rosterCard} aria-label="Información escrita en la lista"><span>NOMBRE: <b>Samuel</b></span><span>APELLIDO: <b>López</b></span></div> : null}
          </div>
          <div className={styles.sceneCopy}><p className={styles.sceneText}>{scene.text}</p></div>
        </article>)}
      </div>
      <nav className={styles.sliderArrows} aria-label="Navegar por las escenas">
        {currentScene > 0 ? <Link className={styles.sliderArrowLeft} href={sceneHref(currentScene - 1)}><span aria-hidden>←</span><span>Anterior</span></Link> : null}
        {currentScene < scenes.length - 1 ? <Link className={styles.sliderArrowRight} href={sceneHref(currentScene + 1)}><span>Siguiente</span><span aria-hidden>→</span></Link> : null}
      </nav>
    </div>
    <div className={styles.sliderMeta}>
      <div className={styles.sliderProgress} aria-label={`Escena ${currentScene + 1} de ${scenes.length}`}><i style={{ width: `${((currentScene + 1) / scenes.length) * 100}%` }} /></div>
      <span className={styles.sliderCount}>{String(currentScene + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span>
    </div>
    <nav className={styles.scenePicker} aria-label="Ir directamente a una escena">
      <span>Ir a escena</span>
      <div>{scenes.map((_, index) => <Link key={index} href={sceneHref(index)} aria-current={currentScene === index ? "page" : undefined} aria-label={`Ver escena ${index + 1}`}>{String(index + 1).padStart(2, "0")}</Link>)}</div>
    </nav>
  </section>;
}

function SamuelStory({ initialMode, initialScene, island, story }: { initialMode: "read" | "illustration"; initialScene: number; island: string; story: string }) {
  const mode = initialMode;
  return <div className={mode === "illustration" ? styles.illustrationLayout : ""}>
    <header className={styles.storyHeader}>
      <div><p className={styles.eyebrow}>A1 · Isla 01 · Historia 01</p><h1>El primer día de clases</h1></div>
      <nav className={styles.storyModes} aria-label="Formato de la historia">
        <Link href={`/islas/${island}/${story}`} aria-current={mode === "read" ? "page" : undefined}>Solo lectura</Link>
        <Link href={`/islas/${island}/${story}?modo=ilustracion`} aria-current={mode === "illustration" ? "page" : undefined}>Ilustración</Link>
      </nav>
    </header>
    {mode === "read" ? <article className={styles.readingStory} role="tabpanel">{storyParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article> : <IllustratedStory key={initialScene} initialScene={initialScene} island={island} story={story} />}
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialScene = 0 }: { island: string; story: string; initialMode?: "read" | "illustration"; initialScene?: number }) {
  const title = titles[story] ?? "Una nueva historia";
  const isFirstStory = story === "01" || story === "1";
  return <div className={`${styles.page} standalone-layer`} data-interactive-story={isFirstStory || undefined}><BaselineNav /><main className={`${styles.readerPage} ${isFirstStory ? styles.readerPageWide : ""}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link>{isFirstStory ? <SamuelStory initialMode={initialMode} initialScene={initialScene} island={island} story={story} /> : <article className={styles.readingStory}><p className={styles.eyebrow}>A1 · Isla {island} · Historia {story}</p><h1>{title}</h1><p>Hoy es mi primer día en la escuela. Entro en el aula y veo a la profesora. Ella sonríe y dice: «Buenos días».</p><p>Hay muchas personas en la clase. Me siento cerca de una chica. Se llama Ana y es de Colombia. Yo digo mi nombre y empezamos a hablar.</p><p>No entiendo todas las palabras, pero entiendo la historia. Poco a poco, el español empieza a ser un lugar conocido.</p></article>}</main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
