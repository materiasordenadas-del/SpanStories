import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { StoryReaderTextSegment, StoryReaderViewModel } from "@/features/story-reader/model";
import { StoryText } from "./StoryText";
import styles from "./baseline.module.css";

export function IllustratedStory({ initialScene, island, story, model, selectedWordId, onSelect, onSceneChange }: {
  initialScene: number;
  island: string;
  story: string;
  model: StoryReaderViewModel;
  selectedWordId: string | null;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>) => void;
  onSceneChange?: (scene: number) => void;
}) {
  const [currentScene, setCurrentScene] = useState(initialScene);
  const touchStartX = useRef<number | null>(null);
  const goToScene = (nextScene: number) => setCurrentScene(Math.max(0, Math.min(model.scenes.length - 1, nextScene)));
  const sceneHref = (scene: number) => `/islas/${island}/${story}?modo=ilustracion&escena=${scene + 1}`;
  useEffect(() => { onSceneChange?.(currentScene); }, [currentScene, onSceneChange]);

  return <section className={styles.illustratedStory} aria-label="Historia ilustrada" aria-describedby="illustration-help" tabIndex={0} onKeyDown={(event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); goToScene(currentScene + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goToScene(currentScene - 1); }
    if (event.key === "Home") { event.preventDefault(); goToScene(0); }
    if (event.key === "End") { event.preventDefault(); goToScene(model.scenes.length - 1); }
  }}>
    {model.summary === undefined ? null : <p className={styles.illustrationLead}>{model.summary}</p>}
    <p className={styles.visuallyHidden} id="illustration-help">Usa Anterior y Siguiente, desliza o elige una escena. Con teclado: flechas izquierda y derecha, Inicio y Fin.</p>
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
            <img src={scene.illustration.src} alt={scene.illustration.alt} />
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
    <nav className={styles.scenePicker} aria-label="Ir directamente a una escena">
      <span>Escena {currentScene + 1} de {model.scenes.length}</span>
      <div>{model.scenes.map((scene, index) => <Link key={scene.number} href={sceneHref(index)} aria-current={currentScene === index ? "page" : undefined} aria-label={`Ver escena ${index + 1}`}>{index + 1}</Link>)}</div>
    </nav>
  </section>;
}
