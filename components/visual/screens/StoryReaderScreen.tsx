"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { StoryReaderTextSegment, StoryReaderViewModel } from "@/features/story-reader/model";
import { recordStoryOccurrenceOpened } from "@/features/story-reader/record-occurrence-opened";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const titles: Record<string, string> = { "01": "El primer día de clases", "02": "La ficha del grupo", "03": "Conocer a un compañero", "04": "No entiendo" };

function StoryText({ segments, selectedWordId, onSelect }: {
  segments: readonly StoryReaderTextSegment[];
  selectedWordId: string | null;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>) => void;
}) {
  return <>{segments.map((segment, index) => segment.kind === "TEXT"
    ? <span key={index}>{segment.text}</span>
    : <button
        aria-controls="lexical-detail"
        aria-pressed={selectedWordId === (segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId)}
        className={styles.selectableWord}
        key={`${segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId}-${index}`}
        onClick={() => onSelect(segment)}
        type="button"
      >{segment.text}</button>)}</>;
}

function LexicalPanel({ model, selectedWordId, eventError, isOpen, onToggle }: {
  model: StoryReaderViewModel;
  selectedWordId: string | null;
  eventError: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const lexical = selectedWordId === null ? undefined : model.lexicalEntries[selectedWordId];
  const surface = selectedWordId === null ? undefined : model.surfaceEntries[selectedWordId];
  return <aside className={`${styles.lexicalPanel} ${isOpen ? "" : styles.lexicalPanelClosed}`} id="lexical-detail" aria-live="polite">
    <button className={styles.lexicalToggle} type="button" aria-expanded={isOpen} aria-controls="lexical-detail-content" onClick={onToggle}>
      <span>{isOpen ? "Palabra seleccionada" : "Ver palabra seleccionada"}</span><span aria-hidden>{isOpen ? "→" : "←"}</span>
    </button>
    <div id="lexical-detail-content" hidden={!isOpen}>
      {lexical === undefined && surface === undefined ? <p>Selecciona una palabra para ver su información.</p> : lexical !== undefined ? <>
        <strong>{lexical.surface}</strong>
        <dl>
          <div><dt>Forma base</dt><dd>{lexical.lemma}</dd></div>
          {lexical.senseItem !== null ? <div><dt>Sentido publicado</dt><dd>{lexical.senseItem}</dd></div> : null}
          {lexical.lexicalCategory !== null ? <div><dt>Categoría</dt><dd>{lexical.lexicalCategory}</dd></div> : null}
        </dl>
        <p className={styles.lexicalContext}>{lexical.context}</p>
      </> : <>
        <strong>{surface?.surface}</strong>
        <p>Esta palabra todavía no tiene una entrada léxica publicada en el motor.</p>
        <p className={styles.lexicalContext}>{surface?.context}</p>
      </>}
      {eventError ? <p className={styles.lexicalError} role="status">La palabra se abrió, pero la interacción no pudo guardarse.</p> : null}
    </div>
  </aside>;
}

function IllustratedStory({ initialScene, island, story, model, selectedWordId, onSelect }: {
  initialScene: number;
  island: string;
  story: string;
  model: StoryReaderViewModel;
  selectedWordId: string | null;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>) => void;
}) {
  const [currentScene, setCurrentScene] = useState(initialScene);
  const touchStartX = useRef<number | null>(null);
  const goToScene = (nextScene: number) => setCurrentScene(Math.max(0, Math.min(model.scenes.length - 1, nextScene)));
  const sceneHref = (scene: number) => `/islas/${island}/${story}?modo=ilustracion&escena=${scene + 1}`;

  return <section className={styles.illustratedStory} aria-label="Historia ilustrada" aria-describedby="illustration-help" tabIndex={0} onKeyDown={(event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); goToScene(currentScene + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goToScene(currentScene - 1); }
    if (event.key === "Home") { event.preventDefault(); goToScene(0); }
    if (event.key === "End") { event.preventDefault(); goToScene(model.scenes.length - 1); }
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
        {model.scenes.map((scene, index) => <article className={styles.sceneSlide} key={scene.number} aria-hidden={currentScene !== index}>
          <div className={styles.sceneImage}>
            <img src="/stories/historia-01/primer-dia-bogota-storyboard.png" alt={`Ilustración de la escena ${index + 1}`} style={{ "--scene-column": index % 3, "--scene-row": Math.floor(index / 3) } as CSSProperties} />
            <span className={styles.sceneNumber}>{String(index + 1).padStart(2, "0")}</span>
            {scene.rosterSentenceIndex !== null ? <div className={styles.rosterCard} aria-label="Información escrita en la lista"><StoryText segments={model.sentences[scene.rosterSentenceIndex].segments} selectedWordId={selectedWordId} onSelect={onSelect} /></div> : null}
          </div>
          <div className={styles.sceneCopy}><div className={styles.sceneText}>{scene.sentenceIndexes.filter((sentenceIndex) => sentenceIndex !== scene.rosterSentenceIndex).map((sentenceIndex, sentencePosition) => <p key={model.sentences[sentenceIndex].id}>
            <StoryText segments={model.sentences[sentenceIndex].segments} selectedWordId={selectedWordId} onSelect={onSelect} />
            {sentencePosition < scene.sentenceIndexes.length - (scene.rosterSentenceIndex === null ? 1 : 2) ? <br /> : null}
          </p>)}</div></div>
        </article>)}
      </div>
      <nav className={styles.sliderArrows} aria-label="Navegar por las escenas">
        {currentScene > 0 ? <Link className={styles.sliderArrowLeft} href={sceneHref(currentScene - 1)}><span aria-hidden>←</span><span>Anterior</span></Link> : null}
        {currentScene < model.scenes.length - 1 ? <Link className={styles.sliderArrowRight} href={sceneHref(currentScene + 1)}><span>Siguiente</span><span aria-hidden>→</span></Link> : null}
      </nav>
    </div>
    <div className={styles.sliderMeta}>
      <div className={styles.sliderProgress} aria-label={`Escena ${currentScene + 1} de ${model.scenes.length}`}><i style={{ width: `${((currentScene + 1) / model.scenes.length) * 100}%` }} /></div>
      <span className={styles.sliderCount}>{String(currentScene + 1).padStart(2, "0")} / {String(model.scenes.length).padStart(2, "0")}</span>
    </div>
    <nav className={styles.scenePicker} aria-label="Ir directamente a una escena">
      <span>Ir a escena</span>
      <div>{model.scenes.map((scene, index) => <Link key={scene.number} href={sceneHref(index)} aria-current={currentScene === index ? "page" : undefined} aria-label={`Ver escena ${index + 1}`}>{String(index + 1).padStart(2, "0")}</Link>)}</div>
    </nav>
  </section>;
}

function SamuelStory({ initialMode, initialScene, island, story, model }: { initialMode: "read" | "illustration"; initialScene: number; island: string; story: string; model: StoryReaderViewModel }) {
  const mode = initialMode;
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [eventError, setEventError] = useState(false);
  const [isLexicalPanelOpen, setIsLexicalPanelOpen] = useState(false);
  const selectWord = (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>) => {
    const selectedId = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    setSelectedWordId(selectedId);
    setIsLexicalPanelOpen(true);
    setEventError(false);
    if (segment.kind === "LEXICAL") {
      void recordStoryOccurrenceOpened(model.eventContext, segment.occurrenceId).catch(() => setEventError(true));
    }
  };
  return <div className={styles.samuelStory}>
    <div className={mode === "illustration" ? styles.illustrationLayout : ""}>
      <header className={styles.storyHeader}>
      <div><p className={styles.eyebrow}>A1 · Isla 01 · Historia 01</p><h1>{model.title}</h1></div>
      <nav className={styles.storyModes} aria-label="Formato de la historia">
        <Link href={`/islas/${island}/${story}`} aria-current={mode === "read" ? "page" : undefined}>Solo lectura</Link>
        <Link href={`/islas/${island}/${story}?modo=ilustracion`} aria-current={mode === "illustration" ? "page" : undefined}>Ilustración</Link>
      </nav>
      </header>
      {mode === "read" ? <article className={styles.readingStory} role="tabpanel">{model.sentences.map((sentence) => <p className={sentence.presentation === "ROSTER" ? styles.storySentenceRoster : undefined} key={sentence.id}><StoryText segments={sentence.segments} selectedWordId={selectedWordId} onSelect={selectWord} /></p>)}</article> : <IllustratedStory key={initialScene} initialScene={initialScene} island={island} story={story} model={model} selectedWordId={selectedWordId} onSelect={selectWord} />}
    </div>
    <LexicalPanel model={model} selectedWordId={selectedWordId} eventError={eventError} isOpen={isLexicalPanelOpen} onToggle={() => setIsLexicalPanelOpen((open) => !open)} />
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialScene = 0, storyOne }: { island: string; story: string; initialMode?: "read" | "illustration"; initialScene?: number; storyOne?: StoryReaderViewModel | null }) {
  const title = titles[story] ?? "Una nueva historia";
  const isFirstStory = storyOne !== null && storyOne !== undefined;
  return <div className={`${styles.page} standalone-layer`} data-interactive-story={isFirstStory || undefined}><BaselineNav /><main className={`${styles.readerPage} ${isFirstStory ? styles.readerPageWide : ""}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link>{isFirstStory ? <SamuelStory initialMode={initialMode} initialScene={initialScene} island={island} story={story} model={storyOne} /> : <article className={styles.readingStory}><p className={styles.eyebrow}>A1 · Isla {island} · Historia {story}</p><h1>{title}</h1><p>Hoy es mi primer día en la escuela. Entro en el aula y veo a la profesora. Ella sonríe y dice: «Buenos días».</p><p>Hay muchas personas en la clase. Me siento cerca de una chica. Se llama Ana y es de Colombia. Yo digo mi nombre y empezamos a hablar.</p><p>No entiendo todas las palabras, pero entiendo la historia. Poco a poco, el español empieza a ser un lugar conocido.</p></article>}</main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
