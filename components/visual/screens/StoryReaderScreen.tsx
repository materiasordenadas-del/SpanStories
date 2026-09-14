"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { glossHosts, reconcileGlosses, type ShownGloss } from "@/features/story-reader/gloss";
import type { StoryReaderSentence, StoryReaderTextSegment, StoryReaderViewModel } from "@/features/story-reader/model";
import { recordStoryOccurrenceOpened } from "@/features/story-reader/record-occurrence-opened";
import { BaselineNav } from "../layouts/BaselineNav";
import { rememberStory } from "../reading-memory";
import { GlossStoryText } from "./GlossStoryText";
import { IllustratedStory } from "./IllustratedStory";
import { QuickGlossControls, type QuickGlossColor } from "./QuickGlossControls";
import { layoutQuickGloss } from "./quick-gloss-layout";
import { StoryEnd, type ConsultedWord, type StoryNextStep } from "./StoryEnd";
import { StoryText } from "./StoryText";
import { LexicalPanel } from "./WordPanel";
import styles from "./baseline.module.css";

/** Con la ficha como hoja inferior, la palabra tocada sube lo justo para quedar a la vista. */
function keepWordAboveSheet(word: HTMLElement) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const sheet = document.getElementById("lexical-detail");
    if (sheet === null || getComputedStyle(sheet).position !== "fixed") return;
    const covered = word.getBoundingClientRect().bottom + 24 - (window.innerHeight - sheet.offsetHeight);
    if (covered <= 0) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: covered, behavior: reduceMotion ? "auto" : "smooth" });
  }));
}

const GLOSS_COLOR_KEY = "spanstories:traduccion-rapida:color";

function readGlossColor(): QuickGlossColor {
  if (typeof window === "undefined") return "naranja";
  try {
    return window.localStorage.getItem(GLOSS_COLOR_KEY) === "azul" ? "azul" : "naranja";
  } catch {
    return "naranja";
  }
}

type ReadingParagraph = { readonly key: string; readonly roster: boolean; readonly dialogue: boolean; readonly sentences: StoryReaderSentence[] };
type ReadingBlock = { readonly key: string; readonly paragraphs: readonly ReadingParagraph[] };

/** Agrupa la historia por escenas: la narración seguida forma un párrafo; cada réplica de diálogo y cada lista van aparte. */
function readingBlocks(model: StoryReaderViewModel): readonly ReadingBlock[] {
  const toParagraphs = (sentences: readonly StoryReaderSentence[]) => {
    const paragraphs: ReadingParagraph[] = [];
    for (const sentence of sentences) {
      const roster = sentence.presentation === "ROSTER";
      const dialogue = sentence.text.trimStart().startsWith("—");
      const last = paragraphs.at(-1);
      if (last !== undefined && !roster && !dialogue && !last.roster && !last.dialogue) last.sentences.push(sentence);
      else paragraphs.push({ key: sentence.id, roster, dialogue, sentences: [sentence] });
    }
    return paragraphs;
  };
  if (model.scenes.length === 0) {
    return model.sentences.map((sentence) => ({ key: sentence.id, paragraphs: [{ key: sentence.id, roster: sentence.presentation === "ROSTER", dialogue: false, sentences: [sentence] }] }));
  }
  const placed = new Set<number>();
  const blocks: ReadingBlock[] = model.scenes.map((scene) => {
    scene.sentenceIndexes.forEach((index) => placed.add(index));
    return { key: `escena-${scene.number}`, paragraphs: toParagraphs(scene.sentenceIndexes.flatMap((index) => model.sentences[index] ?? [])) };
  });
  model.sentences.forEach((sentence, index) => {
    if (!placed.has(index)) blocks.push({ key: sentence.id, paragraphs: toParagraphs([sentence]) });
  });
  return blocks;
}

function StoryWorkspace({ initialMode, initialScene, island, story, model, next }: { initialMode: "read" | "illustration"; initialScene: number; island: string; story: string; model: StoryReaderViewModel; next: StoryNextStep }) {
  const mode = initialMode === "illustration" && model.scenes.length > 0 ? "illustration" : "read";
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [eventError, setEventError] = useState(false);
  const [isLexicalPanelOpen, setIsLexicalPanelOpen] = useState(false);
  const [consultedWords, setConsultedWords] = useState<readonly ConsultedWord[]>([]);
  const [illustrationScene, setIllustrationScene] = useState(initialScene);
  const [glossMode, setGlossMode] = useState(false);
  const [glossColor, setGlossColor] = useState<QuickGlossColor>(readGlossColor);
  const [activeGlossWords, setActiveGlossWords] = useState<ReadonlySet<string>>(() => new Set());
  const [shownGlosses, setShownGlosses] = useState<ReadonlyMap<string, ShownGloss>>(() => new Map());
  const [glossAnnouncement, setGlossAnnouncement] = useState("");
  const glossTimers = useRef(new Map<string, number>());
  const articleRef = useRef<HTMLElement>(null);
  const hasLexicalWords = Object.keys(model.lexicalEntries).length > 0;
  // El interruptor solo aparece cuando alguna palabra de la historia tiene traducción rápida.
  const hasQuickGloss = model.sentences.some((sentence) => sentence.glossUnits?.some((unit) => unit.words.some((word) => word.gloss.kind !== "MISSING")) === true);
  // En modo ilustración el cierre aparece al llegar a la última escena, no antes.
  const reachedEnd = mode === "read" || illustrationScene === model.scenes.length - 1;

  useEffect(() => { rememberStory({ island, story, title: model.title }); }, [island, story, model.title]);

  const selectWord = (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word?: HTMLElement) => {
    const selectedId = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    setSelectedWordId(selectedId);
    setIsLexicalPanelOpen(true);
    setEventError(false);
    setConsultedWords((words) => words.some((entry) => entry.surface.toLocaleLowerCase("es") === segment.text.toLocaleLowerCase("es")) ? words : [...words, { id: selectedId, surface: segment.text }]);
    if (word !== undefined) keepWordAboveSheet(word);
    if (segment.kind === "LEXICAL" && model.eventContext !== undefined) {
      void recordStoryOccurrenceOpened(model.eventContext, segment.occurrenceId).catch(() => setEventError(true));
    }
  };
  const reopenWord = (id: string) => {
    setSelectedWordId(id);
    setIsLexicalPanelOpen(true);
  };

  /** Muestra las etiquetas de las palabras tocadas; las que sobran se retiran con su animación y luego se quitan. */
  const showGlossWords = (nextActive: ReadonlySet<string>) => {
    const nextShown = reconcileGlosses(shownGlosses, glossHosts(model.sentences, nextActive));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, entry] of nextShown) {
      if (!entry.leaving || shownGlosses.get(id)?.leaving === true) continue;
      window.clearTimeout(glossTimers.current.get(id));
      glossTimers.current.set(id, window.setTimeout(() => {
        glossTimers.current.delete(id);
        setShownGlosses((current) => {
          if (current.get(id)?.leaving !== true) return current;
          const remaining = new Map(current);
          remaining.delete(id);
          return remaining;
        });
      }, reduceMotion ? 0 : 300));
    }
    setActiveGlossWords(nextActive);
    setShownGlosses(nextShown);
    return nextShown;
  };
  const toggleGlossWord = (wordId: string, surface: string) => {
    const nextActive = new Set(activeGlossWords);
    if (nextActive.has(wordId)) nextActive.delete(wordId);
    else nextActive.add(wordId);
    const host = [...showGlossWords(nextActive).values()].find((entry) => !entry.leaving && entry.wordIds.includes(wordId));
    setGlossAnnouncement(host === undefined ? `${surface}: traducción retirada` : `${surface}: ${host.gloss.text}`);
  };
  const clearGlosses = () => {
    showGlossWords(new Set());
    setGlossAnnouncement("Traducciones retiradas");
  };
  const toggleGlossMode = () => {
    if (glossMode) {
      glossTimers.current.forEach((timer) => window.clearTimeout(timer));
      glossTimers.current.clear();
      setActiveGlossWords(new Set());
      setShownGlosses(new Map());
      setGlossAnnouncement("");
    } else {
      // Con la traducción rápida, tocar una palabra ya no abre la ficha.
      setSelectedWordId(null);
      setIsLexicalPanelOpen(false);
    }
    setGlossMode(!glossMode);
  };
  const changeGlossColor = (color: QuickGlossColor) => {
    setGlossColor(color);
    try {
      window.localStorage.setItem(GLOSS_COLOR_KEY, color);
    } catch {
      // Sin almacenamiento disponible, el color dura lo que dure esta visita.
    }
  };

  // Las etiquetas se colocan antes de pintarse, cada vez que cambia lo que se muestra.
  useLayoutEffect(() => {
    if (articleRef.current !== null) layoutQuickGloss(articleRef.current);
  }, [shownGlosses]);

  // El texto cambia de líneas al cambiar el ancho de la columna o al terminar de cargar la fuente.
  useEffect(() => {
    const article = articleRef.current;
    if (!glossMode || article === null) return;
    let frame = 0;
    let width = article.getBoundingClientRect().width;
    const relayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => layoutQuickGloss(article));
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined || Math.abs(entry.contentRect.width - width) < 0.5) return;
      width = entry.contentRect.width;
      relayout();
    });
    observer.observe(article);
    window.addEventListener("resize", relayout);
    void document.fonts.ready.then(relayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", relayout);
      cancelAnimationFrame(frame);
    };
  }, [glossMode]);

  useEffect(() => {
    if (!glossMode || activeGlossWords.size === 0) return;
    const clearOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") clearGlosses(); };
    document.addEventListener("keydown", clearOnEscape);
    return () => document.removeEventListener("keydown", clearOnEscape);
  });

  useEffect(() => {
    const timers = glossTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const readingHint = glossMode
    ? "Toca una palabra para ver su traducción encima. Toca las palabras vecinas para verlas juntas."
    : hasLexicalWords ? "Los puntos señalan los objetivos FOCUS de esta historia. Toca cualquier palabra para ver su ficha." : "Toca cualquier palabra para escucharla.";

  return <div className={styles.storyWorkspace}>
    <div className={mode === "illustration" ? styles.illustrationLayout : ""}>
      <header className={styles.storyHeader}>
      <div><p className={styles.eyebrow}>A1 · Isla {island} · Historia {story}</p><h1>{model.title}</h1></div>
      <nav className={styles.storyModes} aria-label="Formato de la historia">
        <Link href={`/islas/${island}/${story}`} aria-current={mode === "read" ? "page" : undefined}>Texto</Link>
        {model.scenes.length > 0 ? <Link href={`/islas/${island}/${story}?modo=ilustracion`} aria-current={mode === "illustration" ? "page" : undefined}>Con ilustraciones</Link> : null}
      </nav>
      </header>
      {mode === "read"
        ? <>
          <div className={styles.hintRow}>
            <p className={styles.readingHint}>{readingHint}</p>
            {hasQuickGloss ? <QuickGlossControls color={glossColor} enabled={glossMode} hasGlosses={activeGlossWords.size > 0} onClear={clearGlosses} onColorChange={changeGlossColor} onToggle={toggleGlossMode} /> : null}
          </div>
          <article className={glossMode ? `${styles.readingStory} ${styles.glossMode}` : styles.readingStory} data-gloss-color={glossMode ? glossColor : undefined} lang="es" ref={articleRef}>{readingBlocks(model).map((block) => <div className={styles.storyBeat} key={block.key}>
            {block.paragraphs.map((paragraph) => <p className={paragraph.roster ? styles.storySentenceRoster : undefined} key={paragraph.key}>
              {paragraph.sentences.map((sentence, index) => <Fragment key={sentence.id}>{index > 0 ? " " : null}{glossMode && sentence.glossUnits !== undefined
                ? <GlossStoryText activeWordIds={activeGlossWords} onToggle={toggleGlossWord} segments={sentence.segments} shown={shownGlosses} units={sentence.glossUnits} />
                : <StoryText segments={sentence.segments} selectedWordId={selectedWordId} onSelect={selectWord} />}</Fragment>)}
            </p>)}
          </div>)}</article>
          <p aria-live="polite" className={styles.visuallyHidden}>{glossAnnouncement}</p>
        </>
        : <IllustratedStory key={initialScene} initialScene={initialScene} island={island} story={story} model={model} selectedWordId={selectedWordId} onSelect={selectWord} onSceneChange={setIllustrationScene} />}
      {reachedEnd ? <StoryEnd consultedWords={consultedWords} island={island} next={next} onReopenWord={reopenWord} story={story} title={model.title} /> : null}
    </div>
    <LexicalPanel model={model} selectedWordId={selectedWordId} eventError={eventError} isOpen={isLexicalPanelOpen} onToggle={() => setIsLexicalPanelOpen((open) => !open)} />
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialScene = 0, storyModel, next }: { island: string; story: string; initialMode?: "read" | "illustration"; initialScene?: number; storyModel: StoryReaderViewModel; next: StoryNextStep }) {
  return <div className={`${styles.page} standalone-layer`} data-interactive-story><BaselineNav /><main className={`${styles.readerPage} ${styles.readerPageWide}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link><StoryWorkspace initialMode={initialMode} initialScene={initialScene} island={island} story={story} model={storyModel} next={next} /></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
