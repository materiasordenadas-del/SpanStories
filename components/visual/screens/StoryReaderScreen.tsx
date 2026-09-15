"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { selectSpanishVoice, stopSpanishSpeech } from "@/features/story-reader/browser-speech";
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
const VOICE_KEY = "spanstories:lector:voz";

function voiceId(voice: SpeechSynthesisVoice) {
  return `${voice.voiceURI}::${voice.lang}::${voice.name}`;
}

function spanishVoices(voices: readonly SpeechSynthesisVoice[]) {
  return voices.filter((voice) => voice.lang.toLocaleLowerCase("en").startsWith("es"));
}

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

/** Devuelve qué palabra interactiva contiene un carácter pronunciado por SpeechSynthesis. */
function wordOffsetAt(sentence: StoryReaderSentence, charIndex: number) {
  let cursor = 0;
  let result = 0;
  let wordOffset = 0;
  for (const segment of sentence.segments) {
    if (segment.kind === "TEXT") { cursor += segment.text.length; continue; }
    const start = sentence.text.indexOf(segment.text, cursor);
    if (start < 0) continue;
    if (start <= charIndex) result = wordOffset;
    cursor = start + segment.text.length;
    wordOffset += 1;
  }
  return result;
}

function StoryWorkspace({ initialMode, initialListenMode, initialScene, island, story, model, next }: { initialMode: "read" | "illustration"; initialListenMode: boolean; initialScene: number; island: string; story: string; model: StoryReaderViewModel; next: StoryNextStep }) {
  const [mode, setMode] = useState<"read" | "illustration">(initialMode === "illustration" && model.scenes.length > 0 ? "illustration" : "read");
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
  const [listenMode, setListenMode] = useState(initialListenMode);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [activeWordOffset, setActiveWordOffset] = useState(0);
  const [spokenProgress, setSpokenProgress] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [fontScale, setFontScale] = useState(0);
  const [spacing, setSpacing] = useState<"compact" | "normal" | "wide">("normal");
  const [speed, setSpeed] = useState(1);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [voices, setVoices] = useState<readonly SpeechSynthesisVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const glossTimers = useRef(new Map<string, number>());
  const articleRef = useRef<HTMLElement>(null);
  const activeSentenceRef = useRef<HTMLSpanElement>(null);
  const narrationRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const spokenProgressRef = useRef(0);
  const receivedBoundaryRef = useRef(false);
  const activeSentence = model.sentences[activeSentenceIndex];
  const activeWordIds = useMemo(() => (activeSentence?.segments ?? []).filter((segment) => segment.kind !== "TEXT").map((segment) => segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId), [activeSentence]);
  const activeWordId = activeWordIds[activeWordOffset] ?? null;
  const hasLexicalWords = Object.keys(model.lexicalEntries).length > 0;
  // El interruptor solo aparece cuando alguna palabra de la historia tiene traducción rápida.
  const hasQuickGloss = model.sentences.some((sentence) => sentence.glossUnits?.some((unit) => unit.words.some((word) => word.gloss.kind !== "MISSING")) === true);
  // En modo ilustración el cierre aparece al llegar a la última escena, no antes.
  const reachedEnd = mode === "read" || illustrationScene === model.scenes.length - 1;

  useEffect(() => { rememberStory({ island, story, title: model.title }); }, [island, story, model.title]);

  const setSpeechProgress = (value: number) => {
    const next = Math.max(0, Math.min(100, value));
    spokenProgressRef.current = next;
    setSpokenProgress(next);
  };
  const stopProgressAnimation = () => {
    if (progressFrameRef.current !== null) window.cancelAnimationFrame(progressFrameRef.current);
    progressFrameRef.current = null;
  };
  useEffect(() => () => { stopProgressAnimation(); narrationRef.current = null; stopSpanishSpeech(); }, []);
  useEffect(() => {
    if (typeof window.speechSynthesis === "undefined") return;
    const speech = window.speechSynthesis;
    const updateVoices = () => setVoices(spanishVoices(speech.getVoices()));
    updateVoices();
    speech.addEventListener("voiceschanged", updateVoices);
    try { setSelectedVoiceId(window.localStorage.getItem(VOICE_KEY)); } catch { /* La elección dura esta visita. */ }
    return () => speech.removeEventListener("voiceschanged", updateVoices);
  }, []);
  useEffect(() => {
    if (voices.length === 0 || (selectedVoiceId !== null && voices.some((voice) => voiceId(voice) === selectedVoiceId))) return;
    const fallback = selectSpanishVoice(voices);
    if (fallback !== undefined) setSelectedVoiceId(voiceId(fallback));
  }, [selectedVoiceId, voices]);
  useEffect(() => {
    if (!isPlaying || !activeSentenceRef.current) return;
    activeSentenceRef.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }, [activeSentenceIndex, isPlaying]);

  // Con fronteras de voz disponibles, la barra termina en el borde real de la palabra
  // pronunciada. No usamos porcentajes por cantidad: «a» y «Encantado» no miden igual.
  useLayoutEffect(() => {
    const sentence = activeSentenceRef.current;
    if (!listenMode || sentence === null) return;
    if (!receivedBoundaryRef.current) {
      sentence.style.removeProperty("--spoken-progress-px");
      return;
    }
    const word = sentence.querySelector<HTMLElement>("[data-spoken-current='true']");
    if (word === null) return;
    const sentenceBox = sentence.getBoundingClientRect();
    const wordBox = word.getBoundingClientRect();
    sentence.style.setProperty("--spoken-progress-px", `${Math.max(0, wordBox.right - sentenceBox.left)}px`);
  }, [activeSentenceIndex, activeWordOffset, listenMode, spokenProgress, fontScale, spacing]);

  const animateSentenceProgress = (utterance: SpeechSynthesisUtterance, sentence: StoryReaderSentence) => {
    stopProgressAnimation();
    // Estimación visual: nunca decide cuándo saltar de frase; eso siempre lo marca `onend`.
    const words = Math.max(1, sentence.segments.filter((segment) => segment.kind !== "TEXT").length);
    const duration = Math.max(900, (words * 60_000) / (165 * speed));
    const startedAt = performance.now() - (spokenProgressRef.current / 100) * duration;
    const advance = (now: number) => {
      if (narrationRef.current !== utterance || receivedBoundaryRef.current) return;
      setSpeechProgress(Math.min(99, ((now - startedAt) / duration) * 100));
      progressFrameRef.current = window.requestAnimationFrame(advance);
    };
    progressFrameRef.current = window.requestAnimationFrame(advance);
  };
  const playFromSentence = (fromSentence: number) => {
    if (typeof window.speechSynthesis === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") return;
    const sentence = model.sentences[fromSentence];
    if (sentence === undefined) return;
    const voice = voices.find((item) => voiceId(item) === selectedVoiceId) ?? selectSpanishVoice(window.speechSynthesis.getVoices());
    // La oración completa se entrega como una sola locución para conservar ritmo,
    // enlace entre palabras y prosodia natural también en las voces remotas de Chrome.
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.lang = "es-ES";
    utterance.rate = speed;
    if (voice !== undefined) utterance.voice = voice;
    receivedBoundaryRef.current = false;
    stopProgressAnimation();
    utterance.onstart = () => {
      setActiveSentenceIndex(fromSentence);
      setActiveWordOffset(0);
      setSpeechProgress(0);
      // Importante para voces de red: el seguimiento comienza al oírse la voz,
      // no mientras Chrome todavía está descargando/preparando el audio.
      window.setTimeout(() => {
        if (narrationRef.current === utterance && !receivedBoundaryRef.current) animateSentenceProgress(utterance, sentence);
      }, 80);
    };
    utterance.onboundary = (event) => {
      receivedBoundaryRef.current = true;
      stopProgressAnimation();
      const wordOffset = wordOffsetAt(sentence, event.charIndex);
      setActiveWordOffset(wordOffset);
      const words = Math.max(1, sentence.segments.filter((segment) => segment.kind !== "TEXT").length);
      setSpeechProgress(((wordOffset + 1) / words) * 100);
    };
    utterance.onend = () => { if (narrationRef.current === utterance) { stopProgressAnimation(); setSpeechProgress(100); narrationRef.current = null; if (fromSentence < model.sentences.length - 1) playFromSentence(fromSentence + 1); else setIsPlaying(false); } };
    utterance.onerror = () => { if (narrationRef.current === utterance) { stopProgressAnimation(); narrationRef.current = null; setIsPlaying(false); } };
    narrationRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setActiveSentenceIndex(fromSentence);
    setActiveWordOffset(0);
    setSpeechProgress(0);
    setIsPlaying(true);
  };
  const togglePlayback = () => {
    if (isPlaying) { stopProgressAnimation(); window.speechSynthesis.pause(); setIsPlaying(false); return; }
    setListenMode(true);
    if (window.speechSynthesis.paused && narrationRef.current !== null) { window.speechSynthesis.resume(); setIsPlaying(true); if (!receivedBoundaryRef.current && activeSentence !== undefined) animateSentenceProgress(narrationRef.current, activeSentence); return; }
    playFromSentence(activeSentenceIndex);
  };
  const seekToSentence = (index: number) => {
    stopProgressAnimation();
    stopSpanishSpeech();
    narrationRef.current = null;
    setIsPlaying(false);
    setActiveSentenceIndex(Math.max(0, Math.min(model.sentences.length - 1, index)));
    setActiveWordOffset(0);
    setSpeechProgress(0);
  };
  const chooseVoice = (voice: SpeechSynthesisVoice) => {
    const id = voiceId(voice);
    setSelectedVoiceId(id);
    try { window.localStorage.setItem(VOICE_KEY, id); } catch { /* La elección dura esta visita. */ }
  };
  const previewVoice = (voice: SpeechSynthesisVoice) => {
    if (typeof window.SpeechSynthesisUtterance === "undefined") return;
    stopProgressAnimation();
    stopSpanishSpeech();
    narrationRef.current = null;
    setIsPlaying(false);
    const sample = new SpeechSynthesisUtterance(model.sentences[activeSentenceIndex]?.text ?? "Hola, esta es la voz seleccionada.");
    sample.lang = voice.lang;
    sample.rate = speed;
    sample.voice = voice;
    window.speechSynthesis.speak(sample);
  };

  const selectWord = (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word?: HTMLElement) => {
    const selectedId = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    setSelectedWordId(selectedId);
    setIsLexicalPanelOpen(true);
    setEventError(false);
    if (isPlaying) { stopProgressAnimation(); window.speechSynthesis.pause(); setIsPlaying(false); }
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

  const activeTranslation = activeSentence?.glossUnits?.map((unit) => unit.gloss?.text).filter((value): value is string => value !== undefined).join(" ");
  const quickTranslation = selectedWordId === null ? undefined : model.sentences.flatMap((sentence) => sentence.glossUnits ?? []).flatMap((unit) => {
    const word = unit.words.find((entry) => entry.id === selectedWordId);
    if (word === undefined || word.gloss.kind === "MISSING") return [];
    return [unit.gloss?.text ?? word.gloss.text];
  })[0];

  return <div className={styles.storyWorkspace} style={{ "--reader-scale": `${fontScale}px`, "--reader-leading": spacing === "compact" ? "1.58" : spacing === "wide" ? "1.92" : "1.72" } as CSSProperties}>
    <div className={mode === "illustration" ? styles.illustrationLayout : ""}>
      <header className={styles.storyHeader}>
      <div><p className={styles.eyebrow}>A1 · Isla {island} · Historia {story}</p><h1>{model.title}</h1></div>
      <div className={styles.readerActions}><button aria-expanded={preferencesOpen} className={styles.headerIcon} onClick={() => setPreferencesOpen((open) => !open)} type="button">Aa</button><button className={styles.headerIcon} type="button" title="Opciones">•••</button></div>
      <nav className={styles.storyModes} aria-label="Formato de la historia">
        <Link aria-current={mode === "read" && !listenMode ? "page" : undefined} href={`/islas/${island}/${story}`}>Leer</Link>
        <Link aria-current={mode === "read" && listenMode ? "page" : undefined} href={`/islas/${island}/${story}?modo=leer-escuchar`}>Leer + escuchar</Link>
        {model.scenes.length > 0 ? <Link aria-current={mode === "illustration" ? "page" : undefined} href={`/islas/${island}/${story}?modo=ilustracion`}>Ilustraciones</Link> : null}
      </nav>
      {preferencesOpen ? <aside className={styles.preferences} aria-label="Preferencias de lectura"><strong>Lectura</strong><div><span>Tamaño</span><button onClick={() => setFontScale((v) => Math.max(-2, v - 1))}>−</button><button onClick={() => setFontScale((v) => Math.min(6, v + 1))}>+</button></div><div><span>Espaciado</span>{(["compact", "normal", "wide"] as const).map((value) => <button aria-pressed={spacing === value} key={value} onClick={() => setSpacing(value)}>{value === "compact" ? "Compacto" : value === "wide" ? "Amplio" : "Normal"}</button>)}</div><strong>Audio</strong><div><span>Velocidad</span>{[0.8, 0.9, 1, 1.2].map((value) => <button aria-pressed={speed === value} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}</div></aside> : null}
      </header>
      <div className={styles.hintRow}><button className={styles.sentenceTranslation} disabled={activeTranslation === undefined} onClick={() => setShowTranslation((open) => !open)} type="button">{showTranslation ? "Ocultar traducción" : "Traducir frase"}</button>{hasQuickGloss ? <QuickGlossControls color={glossColor} enabled={glossMode} hasGlosses={activeGlossWords.size > 0} onClear={clearGlosses} onColorChange={changeGlossColor} onToggle={toggleGlossMode} /> : null}</div>
      {mode === "read"
        ? <>
          <article className={glossMode ? `${styles.readingStory} ${styles.glossMode}` : styles.readingStory} data-gloss-color={glossMode ? glossColor : undefined} lang="es" ref={articleRef}>{readingBlocks(model).map((block) => <div className={styles.storyBeat} key={block.key}>
            {block.paragraphs.map((paragraph) => <p className={paragraph.roster ? styles.storySentenceRoster : undefined} key={paragraph.key}>
              {paragraph.sentences.map((sentence, index) => { const sentenceIndex = model.sentences.indexOf(sentence); const isActiveSentence = listenMode && sentenceIndex === activeSentenceIndex; const progress = isActiveSentence ? `${spokenProgress}%` : undefined; return <Fragment key={sentence.id}>{index > 0 ? " " : null}<span className={isActiveSentence ? styles.activeSentence : undefined} ref={sentenceIndex === activeSentenceIndex ? activeSentenceRef : undefined} style={progress === undefined ? undefined : { "--spoken-progress": progress } as CSSProperties}>{glossMode && sentence.glossUnits !== undefined
                ? <GlossStoryText activeWordIds={activeGlossWords} onSelect={selectWord} onToggle={toggleGlossWord} segments={sentence.segments} shown={shownGlosses} units={sentence.glossUnits} />
                : <StoryText activeWordId={listenMode && sentenceIndex === activeSentenceIndex ? activeWordId : null} segments={sentence.segments} selectedWordId={selectedWordId} onSelect={selectWord} />}{showTranslation && sentenceIndex === activeSentenceIndex && activeTranslation !== undefined ? <em className={styles.inlineTranslation}>{activeTranslation}</em> : null}</span></Fragment>; })}
            </p>)}
          </div>)}</article>
          <p aria-live="polite" className={styles.visuallyHidden}>{glossAnnouncement}</p>
        </>
        : <IllustratedStory activeGlossWords={activeGlossWords} glossColor={glossColor} glossMode={glossMode} glossRootRef={articleRef} initialScene={initialScene} island={island} story={story} model={model} onSelect={selectWord} onSceneChange={setIllustrationScene} onToggleGloss={toggleGlossWord} selectedWordId={selectedWordId} shownGlosses={shownGlosses} />}
      {reachedEnd ? <StoryEnd consultedWords={consultedWords} island={island} next={next} onReopenWord={reopenWord} story={story} title={model.title} /> : null}
    </div>
    <LexicalPanel fallbackTranslation={quickTranslation} model={model} selectedWordId={selectedWordId} eventError={eventError} isOpen={isLexicalPanelOpen} onToggle={() => setIsLexicalPanelOpen((open) => !open)} />
    {mode === "read" && listenMode ? <div className={styles.audioPlayer} aria-label="Reproductor de la historia"><button aria-label="Frase anterior" onClick={() => seekToSentence(activeSentenceIndex - 1)} type="button">↺</button><button aria-label={isPlaying ? "Pausar" : "Reproducir"} className={styles.playButton} onClick={togglePlayback} type="button">{isPlaying ? "❚❚" : "▶"}</button><button aria-label="Siguiente frase" onClick={() => seekToSentence(activeSentenceIndex + 1)} type="button">↻</button><span>{String(Math.floor(activeSentenceIndex * 5 / 60)).padStart(2, "0")}:{String((activeSentenceIndex * 5) % 60).padStart(2, "0")}</span><input aria-label="Progreso" max={Math.max(model.sentences.length - 1, 1)} min="0" onChange={(event) => seekToSentence(Number(event.target.value))} type="range" value={activeSentenceIndex} /><span>03:12</span><button onClick={() => setSpeed((value) => value === 1 ? 1.2 : 1)} type="button">{speed}×</button><button aria-expanded={voiceMenuOpen} aria-haspopup="dialog" className={styles.voiceButton} onClick={() => setVoiceMenuOpen(true)} type="button">Voz</button></div> : null}
    {voiceMenuOpen ? <div className={styles.voiceDialogBackdrop} onMouseDown={() => setVoiceMenuOpen(false)} role="presentation"><section aria-labelledby="voice-menu-title" aria-modal="true" className={styles.voiceDialog} onMouseDown={(event) => event.stopPropagation()} role="dialog"><button aria-label="Cerrar" className={styles.voiceClose} onClick={() => setVoiceMenuOpen(false)} type="button">×</button><h2 id="voice-menu-title">Voces en español</h2><p>Elige la voz para escuchar las historias. Las voces disponibles dependen de tu navegador y dispositivo.</p><div className={styles.voiceList} role="radiogroup" aria-label="Voz de lectura">{voices.length > 0 ? voices.map((voice) => <div className={styles.voiceRow} key={voiceId(voice)}><button aria-checked={selectedVoiceId === voiceId(voice)} className={styles.voiceChoice} onClick={() => chooseVoice(voice)} role="radio" type="button"><span>{voice.name}</span><small>{voice.lang}</small></button><button aria-label={`Probar ${voice.name}`} className={styles.voicePreview} onClick={() => previewVoice(voice)} type="button">▶</button></div>) : <p className={styles.noVoices}>No hay voces en español disponibles en este navegador.</p>}</div><div className={styles.voiceRate}><strong>Velocidad:</strong>{[0.6, 0.8, 0.9, 1, 1.2, 1.5].map((value) => <button aria-pressed={speed === value} key={value} onClick={() => setSpeed(value)} type="button">{value}×</button>)}</div><button className={styles.voiceContinue} onClick={() => setVoiceMenuOpen(false)} type="button">Continuar</button></section></div> : null}
  </div>;
}

export function StoryReaderScreen({ island, story, initialMode = "read", initialListenMode = false, initialScene = 0, storyModel, next }: { island: string; story: string; initialMode?: "read" | "illustration"; initialListenMode?: boolean; initialScene?: number; storyModel: StoryReaderViewModel; next: StoryNextStep }) {
  return <div className={`${styles.page} standalone-layer`} data-interactive-story><BaselineNav /><main className={`${styles.readerPage} ${styles.readerPageWide}`}><Link className={styles.backLink} href={`/islas/${island}`}>← Volver a las historias</Link><StoryWorkspace initialMode={initialMode} initialListenMode={initialListenMode} initialScene={initialScene} island={island} key={`${initialMode}:${initialListenMode}`} model={storyModel} next={next} story={story} /></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
