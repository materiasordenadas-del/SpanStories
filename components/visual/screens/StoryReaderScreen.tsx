"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { StoryReaderSentence, StoryReaderTextSegment, StoryReaderViewModel } from "@/features/story-reader/model";
import { recordStoryOccurrenceOpened } from "@/features/story-reader/record-occurrence-opened";
import { BaselineNav } from "../layouts/BaselineNav";
import { IllustratedStory } from "./IllustratedStory";
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

function StoryWorkspace({ initialMode, initialScene, island, story, model }: { initialMode: "read" | "illustration"; initialScene: number; island: string; story: string; model: StoryReaderViewModel }) {
  const mode = initialMode === "illustration" && model.scenes.length > 0 ? "illustration" : "read";
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [eventError, setEventError] = useState(false);
  const [isLexicalPanelOpen, setIsLexicalPanelOpen] = useState(false);
  const hasLexicalWords = Object.keys(model.lexicalEntries).length > 0;
  const selectWord = (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word?: HTMLElement) => {
    const selectedId = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    setSelectedWordId(selectedId);
    setIsLexicalPanelOpen(true);
    setEventError(false);
    if (word !== undefined) keepWordAboveSheet(word);
    if (segment.kind === "LEXICAL" && model.eventContext !== undefined) {
      void recordStoryOccurrenceOpened(model.eventContext, segment.occurrenceId).catch(() => setEventError(true));
    }
  };
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
          <p className={styles.readingHint}>{hasLexicalWords ? "Toca cualquier palabra para ver su ficha; las subrayadas tienen más información." : "Toca cualquier palabra para escucharla o guardarla."}</p>
          <article className={styles.readingStory} lang="es">{readingBlocks(model).map((block) => <div className={styles.storyBeat} key={block.key}>
            {block.paragraphs.map((paragraph) => <p className={paragraph.roster ? styles.storySentenceRoster : undefined} key={paragraph.key}>
              {paragraph.sentences.map((sentence, index) => <Fragment key={sentence.id}>{index > 0 ? " " : null}<StoryText segments={sentence.segments} selectedWordId={selectedWordId} onSelect={selectWord} /></Fragment>)}
            </p>)}
          </div>)}</article>
        </>
        : <IllustratedStory key={initialScene} initialScene={initialScene} island={island} story={story} model={model} selectedWordId={selectedWordId} onSelect={selectWord} />}
    </div>
    <LexicalPanel model={model} selectedWordId={selectedWordId} eventError={eventError} isOpen={isLexicalPanelOpen} onToggle={() => setIsLexicalPanelOpen((open) => !open)} />
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialScene = 0, storyModel }: { island: string; story: string; initialMode?: "read" | "illustration"; initialScene?: number; storyModel: StoryReaderViewModel }) {
  return <div className={`${styles.page} standalone-layer`} data-interactive-story><BaselineNav /><main className={`${styles.readerPage} ${styles.readerPageWide}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link><StoryWorkspace initialMode={initialMode} initialScene={initialScene} island={island} story={story} model={storyModel} /></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
