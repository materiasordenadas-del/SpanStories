import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { StoryReaderViewModel, StoryReaderWordReference } from "@/features/story-reader/model";
import type { WordPanelTextPart, WordPanelViewModel } from "@/features/story-reader/word-panel";
import { speakSpanish } from "@/features/story-reader/browser-speech";
import { toggleSavedWord, useReadingMemory, type SavedWord } from "../reading-memory";
import styles from "./baseline.module.css";
import panelStyles from "./word-panel.module.css";

const EXAMPLES_IN_SUMMARY = 2;

function ContextText({ parts }: { parts: readonly WordPanelTextPart[] }) {
  return <>{parts.map((part, index) => part.highlighted
    ? <mark className={panelStyles.contextMark} key={index}>{part.text}</mark>
    : <span key={index}>{part.text}</span>)}</>;
}

function SpeakerIcon() {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Z" fill="currentColor" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <svg aria-hidden="true" focusable="false" className={expanded ? panelStyles.chevronExpanded : undefined} width="16" height="16" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function BookIcon() {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5m0-13C14 5 17 4.5 20 5v13c-3-.5-6 0-8 1.5m0-13v13" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function AudioButton({ label, text }: { label: string; text: string }) {
  return <button aria-label={label} className={panelStyles.audioButton} onClick={() => speakSpanish(text)} title={label} type="button"><SpeakerIcon /></button>;
}

/** Ajusta --word-fit para que la palabra del panel quepa en una línea con el espacio real que deja la fila. */
function useFitWord(titleRef: RefObject<HTMLHeadingElement | null>, word: string) {
  useLayoutEffect(() => {
    const title = titleRef.current;
    const line = title?.parentElement;
    if (!title || !line) return;
    let fittedWidth = -1;
    const fit = () => {
      // Solo reajusta si cambia el ancho: el cambio de alto que provoca el propio ajuste no debe re-disparar.
      if (line.clientWidth === fittedWidth) return;
      fittedWidth = line.clientWidth;
      const siblings = Array.from(line.children).filter((child) => child !== title) as HTMLElement[];
      const available = line.clientWidth - siblings.reduce((sum, child) => sum + child.offsetWidth, 0) - siblings.length * parseFloat(getComputedStyle(line).columnGap || "0");
      delete title.dataset.wrap;
      // El ancho del texto no escala del todo lineal (hinting), así que se repite la medida hasta que cabe.
      for (let pass = 0; pass < 3; pass += 1) {
        const target = Math.floor(((parseFloat(getComputedStyle(title).fontSize) * available) / title.scrollWidth) * 10) / 10;
        if (!(target > 0)) return;
        title.style.setProperty("--word-fit", `${target}px`);
        if (title.scrollWidth <= available) return;
      }
      // Ni con --word-min cabe: último recurso, dejar que la palabra se parta.
      title.dataset.wrap = "";
    };
    fit();
    // Se aplaza al siguiente frame para no cambiar el tamaño observado dentro del propio callback.
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); });
    observer.observe(line);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [titleRef, word]);
}

function WordPanel({ panel, reference, saveWord, eventError, closeButtonRef, onClose }: {
  panel: WordPanelViewModel;
  reference: StoryReaderWordReference | undefined;
  saveWord: Pick<SavedWord, "key" | "surface">;
  eventError: boolean;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFitWord(titleRef, panel.surface);
  const { savedWords } = useReadingMemory();
  const saved = savedWords.some((word) => word.key === saveWord.key);
  const examples = reference?.examples ?? panel.examples ?? [];
  const otherStories = reference?.otherStories ?? [];
  const usageNotes = reference?.usageNotes ?? [];
  const relatedWords = reference?.relatedWords ?? [];
  const translation = reference?.translation ?? panel.translation;
  const partOfSpeech = reference?.partOfSpeechLabel ?? panel.partOfSpeechLabel;
  const usage = reference?.shortUsage ?? panel.shortUsage;
  const hasMore = examples.length > EXAMPLES_IN_SUMMARY || usageNotes.length > 0 || otherStories.length > 0 || reference !== undefined;
  const renderExamples = (items: typeof examples) => <div className={panelStyles.sourceList}>{items.map((example, index) => <div className={panelStyles.sourceRow} key={index}><strong lang="es">{example.text}</strong>{example.translation === undefined ? null : <span lang="en">{example.translation}</span>}</div>)}</div>;
  return <div className={panelStyles.panel} id="lexical-detail-content">
    <header className={panelStyles.head}>
      <div className={panelStyles.wordLine}>
        <h2 lang="es" ref={titleRef} style={{ "--word-length": Array.from(panel.surface).length } as CSSProperties}>{panel.surface}</h2>
        <AudioButton label={`Escuchar «${panel.surface}»`} text={panel.surface} />
      </div>
      <button aria-label="Cerrar la ficha" className={panelStyles.closeButton} onClick={onClose} ref={closeButtonRef} type="button"><CloseIcon /></button>
    </header>
    <div className={panelStyles.body}>
      {translation === undefined ? null : <p className={panelStyles.translation} lang="en">{translation}</p>}
      {panel.kind === "SURFACE" ? <p className={panelStyles.note}>Esta palabra todavía no tiene ficha. Puedes escucharla y guardarla.</p> : null}
      {partOfSpeech !== undefined || panel.cefrLevel !== undefined ? <ul aria-label="Datos de la palabra" className={panelStyles.tags}>
        {partOfSpeech === undefined ? null : <li>{partOfSpeech}</li>}
        {panel.cefrLevel === undefined ? null : <li className={panelStyles.levelTag}><span className={panelStyles.srOnly}>Nivel </span>{panel.cefrLevel}</li>}
      </ul> : null}
      {usage === undefined ? null : <p className={panelStyles.usageText}>{usage}</p>}
      <section><h3 className={panelStyles.blockTitle}>En esta historia</h3><p className={panelStyles.contextCard} lang="es"><ContextText parts={panel.currentContext.parts} /></p></section>
      {examples.length > 0 ? <section><h3 className={panelStyles.blockTitle}>Ejemplos</h3>{renderExamples(examples.slice(0, EXAMPLES_IN_SUMMARY))}</section> : null}
      {hasMore ? <details className={panelStyles.more}>
        <summary>Más sobre «{panel.surface}»<ChevronIcon expanded={false} /></summary>
        <div className={panelStyles.moreContent}>
          {examples.length > EXAMPLES_IN_SUMMARY ? <section><h3 className={panelStyles.blockTitle}>Más ejemplos</h3>{renderExamples(examples.slice(EXAMPLES_IN_SUMMARY))}</section> : null}
          {usageNotes.length > 0 ? <section><h3 className={panelStyles.blockTitle}>Uso</h3><ul className={panelStyles.usageNotes}>{usageNotes.map((note) => <li key={note}>{note}</li>)}</ul></section> : null}
          {otherStories.length > 0 ? <section><h3 className={panelStyles.blockTitle}>En otras historias</h3><div className={panelStyles.otherStories}>{otherStories.map((item, index) => <div className={panelStyles.otherStory} key={index}><BookIcon /><div><p lang="es"><strong>{item.word}</strong>{item.rest}</p><small>{item.meta}</small></div></div>)}</div></section> : null}
          {reference !== undefined ? <dl className={panelStyles.dataList}><div><dt>Frecuencia</dt><dd>{reference.frequency}</dd></div>{relatedWords.length > 0 ? <div><dt>Palabras relacionadas</dt><dd className={panelStyles.related} lang="es">{relatedWords.map((word) => <span key={word}>{word}</span>)}</dd></div> : null}</dl> : null}
        </div>
      </details> : null}
      {eventError ? <p className={panelStyles.error} role="status">La palabra se abrió, pero la interacción no pudo guardarse.</p> : null}
    </div>
    <footer className={panelStyles.actions}>
      <button aria-pressed={saved} className={panelStyles.saveButton} onClick={() => toggleSavedWord({ ...saveWord, ...(translation === undefined ? {} : { translation }) })} type="button"><BookmarkIcon filled={saved} />{saved ? "Guardada" : "Guardar palabra"}</button>
      <button className={panelStyles.practiceButton} onClick={() => speakSpanish(panel.currentContext.text)} type="button"><SpeakerIcon />Escuchar la frase</button>
    </footer>
  </div>;
}

export function LexicalPanel({ model, selectedWordId, eventError, isOpen, onToggle }: {
  model: StoryReaderViewModel;
  selectedWordId: string | null;
  eventError: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const lexicalEntry = selectedWordId === null ? undefined : model.lexicalEntries[selectedWordId];
  const panel = selectedWordId === null ? undefined : lexicalEntry?.panel ?? model.surfaceEntries[selectedWordId]?.panel;
  const reference = lexicalEntry?.reference;
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Focus only follows the panel's own open/close buttons; selecting a word never moves focus out of the story.
  const [focusTarget, setFocusTarget] = useState<"open" | "close" | null>(null);
  useEffect(() => {
    if (focusTarget === "open" && !isOpen) openButtonRef.current?.focus();
    if (focusTarget === "close" && isOpen) closeButtonRef.current?.focus();
  }, [focusTarget, isOpen]);
  const isExpanded = panel !== undefined && isOpen;
  const close = () => { setFocusTarget("open"); onToggle(); };
  // Se guarda la palabra (lema), no la aparición concreta: «soy» y «es» son la misma palabra guardada.
  const saveWord = lexicalEntry !== undefined
    ? { key: `lema:${lexicalEntry.lemma}`, surface: lexicalEntry.lemma }
    : { key: `forma:${panel?.surface.toLocaleLowerCase("es") ?? ""}`, surface: panel?.surface.toLocaleLowerCase("es") ?? "" };
  return <aside aria-label="Ficha de la palabra" className={`${styles.lexicalPanel} ${panelStyles.container} ${isExpanded ? "" : styles.lexicalPanelClosed}`} id="lexical-detail" onKeyDown={(event) => {
    if (event.key !== "Escape" || !isExpanded) return;
    event.stopPropagation();
    close();
  }}>
    <p aria-live="polite" className={panelStyles.srOnly}>{panel === undefined ? "" : `Palabra seleccionada: ${panel.surface}`}</p>
    {panel === undefined
      ? <p className={panelStyles.hint}><strong>Toca cualquier palabra</strong> de la historia para ver su ficha.</p>
      : isOpen
        ? <><button aria-label="Ocultar la ficha" className={panelStyles.handle} onClick={close} type="button"><ChevronIcon expanded={true} /></button><WordPanel closeButtonRef={closeButtonRef} eventError={eventError} key={panel.id} onClose={close} panel={panel} reference={reference} saveWord={saveWord} /></>
        : <button aria-expanded={false} className={panelStyles.openButton} onClick={() => { setFocusTarget("close"); onToggle(); }} ref={openButtonRef} type="button"><span>Ver «{panel.surface}»</span><ChevronIcon expanded={false} /></button>}
  </aside>;
}
