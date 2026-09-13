"use client";

import { useState } from "react";
import Link from "next/link";
import type { StoryReaderTextSegment, StoryReaderViewModel } from "@/features/story-reader/model";
import { recordStoryOccurrenceOpened } from "@/features/story-reader/record-occurrence-opened";
import { BaselineNav } from "../layouts/BaselineNav";
import { IllustratedStory } from "./IllustratedStory";
import { StoryText } from "./StoryText";
import { LexicalPanel } from "./WordPanel";
import styles from "./baseline.module.css";

function StoryWorkspace({ initialMode, initialScene, island, story, model }: { initialMode: "read" | "illustration"; initialScene: number; island: string; story: string; model: StoryReaderViewModel }) {
  const mode = initialMode === "illustration" && model.scenes.length > 0 ? "illustration" : "read";
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [eventError, setEventError] = useState(false);
  const [isLexicalPanelOpen, setIsLexicalPanelOpen] = useState(false);
  const selectWord = (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>) => {
    const selectedId = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    setSelectedWordId(selectedId);
    setIsLexicalPanelOpen(true);
    setEventError(false);
    if (segment.kind === "LEXICAL" && model.eventContext !== undefined) {
      void recordStoryOccurrenceOpened(model.eventContext, segment.occurrenceId).catch(() => setEventError(true));
    }
  };
  return <div className={styles.storyWorkspace}>
    <div className={mode === "illustration" ? styles.illustrationLayout : ""}>
      <header className={styles.storyHeader}>
      <div><p className={styles.eyebrow}>A1 · Isla {island} · Historia {story}</p><h1>{model.title}</h1></div>
      <nav className={styles.storyModes} aria-label="Formato de la historia">
        <Link href={`/islas/${island}/${story}`} aria-current={mode === "read" ? "page" : undefined}>Solo lectura</Link>
        {model.scenes.length > 0 ? <Link href={`/islas/${island}/${story}?modo=ilustracion`} aria-current={mode === "illustration" ? "page" : undefined}>Ilustración</Link> : null}
      </nav>
      </header>
      {mode === "read" ? <article className={styles.readingStory} role="tabpanel">{model.sentences.map((sentence) => <p className={sentence.presentation === "ROSTER" ? styles.storySentenceRoster : undefined} key={sentence.id}><StoryText segments={sentence.segments} selectedWordId={selectedWordId} onSelect={selectWord} /></p>)}</article> : <IllustratedStory key={initialScene} initialScene={initialScene} island={island} story={story} model={model} selectedWordId={selectedWordId} onSelect={selectWord} />}
    </div>
    <LexicalPanel model={model} selectedWordId={selectedWordId} eventError={eventError} isOpen={isLexicalPanelOpen} onToggle={() => setIsLexicalPanelOpen((open) => !open)} />
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialScene = 0, storyModel }: { island: string; story: string; initialMode?: "read" | "illustration"; initialScene?: number; storyModel: StoryReaderViewModel }) {
  return <div className={`${styles.page} standalone-layer`} data-interactive-story><BaselineNav /><main className={`${styles.readerPage} ${styles.readerPageWide}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link><StoryWorkspace initialMode={initialMode} initialScene={initialScene} island={island} story={story} model={storyModel} /></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
