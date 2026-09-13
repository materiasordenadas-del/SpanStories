import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { StoryReaderViewModel, StoryReaderWordReference } from "@/features/story-reader/model";
import type { WordPanelContext, WordPanelTextPart, WordPanelViewModel } from "@/features/story-reader/word-panel";
import { speakSpanish } from "@/features/story-reader/browser-speech";
import styles from "./baseline.module.css";
import panelStyles from "./word-panel.module.css";

const INITIAL_LIST_SIZE = 3;

function ContextText({ parts }: { parts: readonly WordPanelTextPart[] }) {
  return <>{parts.map((part, index) => part.highlighted
    ? <mark className={panelStyles.contextMark} key={index}>{part.text}</mark>
    : <span key={index}>{part.text}</span>)}</>;
}

function contextMeta(context: WordPanelContext) {
  return [context.islandLabel, context.storyTitle, context.sceneLabel].filter((value): value is string => value !== undefined).join(" · ");
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

function ImagePlaceholderIcon() {
  return <svg aria-hidden="true" focusable="false" width="28" height="28" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8.5" cy="9" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m5 17 4.5-4 3 2.5 2.5-2 4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function AudioButton({ label, text }: { label: string; text: string }) {
  return <button aria-label={label} className={panelStyles.audioButton} onClick={() => speakSpanish(text)} title={label} type="button"><SpeakerIcon /></button>;
}

function ExpandableList<T>({ id, title, headingLevel = 3, items, renderItem }: {
  id: string;
  title: string;
  headingLevel?: 3 | 4;
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const hiddenCount = items.length - INITIAL_LIST_SIZE;
  return <section aria-labelledby={`${id}-title`} className={panelStyles.section} id={id}>
    <div className={panelStyles.sectionHeader}>
      <Heading id={`${id}-title`}>{title}</Heading>
      {hiddenCount > 0 ? <button aria-controls={`${id}-list`} aria-expanded={expanded} className={panelStyles.moreButton} onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "Ver menos" : `Ver más (${hiddenCount})`}</button> : null}
    </div>
    <ul className={panelStyles.list} id={`${id}-list`}>{(expanded ? items : items.slice(0, INITIAL_LIST_SIZE)).map(renderItem)}</ul>
  </section>;
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

function WordPanel({ panel, reference, eventError, closeButtonRef, onClose }: {
  panel: WordPanelViewModel;
  reference: StoryReaderWordReference | undefined;
  eventError: boolean;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"resumen" | "ejemplos" | "uso" | "contexto" | "mas">("resumen");
  const [saved, setSaved] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFitWord(titleRef, panel.surface);
  const examples = reference?.examples ?? panel.examples;
  const otherStories = reference?.otherStories ?? [];
  const usageNotes = reference?.usageNotes ?? [];
  const tabs = [{ id: "resumen", label: "Resumen" }, { id: "ejemplos", label: "Ejemplos" }, { id: "uso", label: "Uso" }, { id: "contexto", label: "En contexto" }, { id: "mas", label: "Más" }] as const;
  const translation = reference?.translation ?? panel.translation;
  const partOfSpeech = reference?.partOfSpeechLabel ?? panel.partOfSpeechLabel;
  const hasTags = partOfSpeech !== undefined || panel.cefrLevel !== undefined;
  const renderExamples = (items: NonNullable<typeof examples>) => <div className={panelStyles.sourceList}>{items.map((example, index) => <div className={panelStyles.sourceRow} key={index}><strong>{example.text}</strong>{example.translation === undefined ? null : <span lang="en">{example.translation}</span>}</div>)}</div>;
  const renderOtherStories = (items: typeof otherStories) => <div className={panelStyles.otherStories}>{items.map((story, index) => <div className={panelStyles.otherStory} key={index}><BookIcon /><div><p><strong>{story.word}</strong>{story.rest}</p><small>{story.meta}</small></div></div>)}</div>;
  return <div className={panelStyles.panel} id="lexical-detail-content">
    <div className={panelStyles.topBar}>
      <span>Palabra seleccionada</span>
      <button aria-label="Cerrar información de palabra" className={panelStyles.closeButton} onClick={onClose} ref={closeButtonRef} type="button"><CloseIcon /></button>
    </div>
    <div className={panelStyles.body}>
      <header className={`${panelStyles.summary} ${panel.image === undefined ? "" : panelStyles.summaryWithImage}`} id="word-panel-summary">
        <div>
          <div className={panelStyles.wordLine}>
            <h2 lang="es" ref={titleRef} style={{ "--word-length": Array.from(panel.surface).length } as CSSProperties}>{panel.surface}</h2>
            <AudioButton label={`Escuchar «${panel.surface}»`} text={panel.surface} />
            <button aria-pressed={saved} className={`${panelStyles.favoriteButton} ${saved ? panelStyles.favoriteActive : ""}`} onClick={() => setSaved((value) => !value)} type="button"><span className={panelStyles.srOnly}>Guardar como favorita</span>☆</button>
          </div>
          {translation === undefined ? null : <p className={panelStyles.translation} lang="en">{translation}</p>}
          {panel.kind === "SURFACE" ? <p className={panelStyles.note}>Todavía no hay una ficha para esta palabra.</p> : null}
          {hasTags ? <ul aria-label="Datos de la palabra" className={panelStyles.tags}>
            {partOfSpeech === undefined ? null : <li>{partOfSpeech}</li>}
            {panel.cefrLevel === undefined ? null : <li className={panelStyles.levelTag}><span className={panelStyles.srOnly}>Nivel </span>{panel.cefrLevel}</li>}
          </ul> : null}
        </div>
        {panel.image === undefined ? null : <div aria-label={panel.image.alt} className={panelStyles.imagePlaceholder}><ImagePlaceholderIcon /><span>{reference?.imageCaption ?? panel.image.alt}</span></div>}
      </header>
      <button aria-controls="word-panel-details" aria-expanded={detailsOpen} className={panelStyles.detailsToggle} onClick={() => setDetailsOpen((open) => !open)} type="button"><span>Detalles</span><ChevronIcon expanded={detailsOpen} /></button>
      <div className={detailsOpen ? panelStyles.detailsOpen : panelStyles.details} id="word-panel-details">
        <div className={panelStyles.detailsInner}>
        <nav aria-label="Secciones de la palabra" className={panelStyles.sectionNav}>
          {tabs.map((tab) => <button aria-current={activeTab === tab.id ? "page" : undefined} className={activeTab === tab.id ? panelStyles.activeTab : undefined} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}
        </nav>
          {activeTab === "resumen" ? <div className={panelStyles.tabContent}>
            <p className={panelStyles.usage}><SpeakerIcon /><span>{reference?.shortUsage ?? panel.shortUsage ?? "Palabra seleccionada en esta historia."}</span></p>
            {examples?.length ? <section><div className={panelStyles.sourceHeading}><h3>Ejemplos</h3><button onClick={() => setActiveTab("ejemplos")} type="button">Ver más →</button></div>{renderExamples(examples.slice(0, 3))}</section> : null}
            <section><h3>En esta historia</h3><p className={panelStyles.contextCard} lang="es"><ContextText parts={panel.currentContext.parts} /></p></section>
            {otherStories.length ? <section><div className={panelStyles.sourceHeading}><h3>En otras historias</h3><button onClick={() => setActiveTab("contexto")} type="button">Ver todas →</button></div>{renderOtherStories(otherStories.slice(0, 2))}</section> : null}
          </div> : null}
          {activeTab === "ejemplos" ? <div className={panelStyles.tabContent}>{examples?.length ? renderExamples(examples) : <p>Aún no hay ejemplos publicados para esta palabra.</p>}</div> : null}
          {activeTab === "uso" ? <div className={panelStyles.tabContent}>{usageNotes.length ? <ul className={panelStyles.usageNotes}>{usageNotes.map((note) => <li key={note}>{note}</li>)}</ul> : <p>No hay datos de uso publicados.</p>}</div> : null}
          {activeTab === "contexto" ? <div className={panelStyles.tabContent}><section><h3>En esta historia</h3><p className={panelStyles.contextCard} lang="es"><ContextText parts={panel.currentContext.parts} /></p></section>{otherStories.length ? <section><h3>En otras historias</h3>{renderOtherStories(otherStories)}</section> : null}</div> : null}
          {activeTab === "mas" ? <div className={panelStyles.tabContent}><dl className={panelStyles.dataList}>{reference !== undefined ? <><div><dt>Frecuencia</dt><dd>{reference.frequency}</dd></div><div><dt>Categoría gramatical</dt><dd>{reference.partOfSpeechLabel}</dd></div><div><dt>Palabras relacionadas</dt><dd className={panelStyles.related}>{reference.relatedWords.map((word) => <span key={word}>{word}</span>)}</dd></div></> :<div><dd>Aún no hay más información publicada para esta palabra.</dd></div>}</dl></div> : null}
          {eventError ? <p className={panelStyles.error} role="status">La palabra se abrió, pero la interacción no pudo guardarse.</p> : null}
        </div>
      </div>
    </div>
    <footer className={panelStyles.actions}>
      <button className={panelStyles.saveButton} onClick={() => setSaved((value) => !value)} type="button">▱ {saved ? "Palabra guardada" : "Guardar palabra"}</button>
      <button className={panelStyles.practiceButton} onClick={() => setActiveTab("ejemplos")} type="button">▥ Practicar</button>
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
  const panel = selectedWordId === null ? undefined : model.lexicalEntries[selectedWordId]?.panel ?? model.surfaceEntries[selectedWordId]?.panel;
  const reference = selectedWordId === null ? undefined : model.lexicalEntries[selectedWordId]?.reference;
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Focus only follows the panel's own open/close buttons; selecting a word never moves focus out of the story.
  const [focusTarget, setFocusTarget] = useState<"open" | "close" | null>(null);
  useEffect(() => {
    if (focusTarget === "open" && !isOpen) openButtonRef.current?.focus();
    if (focusTarget === "close" && isOpen) closeButtonRef.current?.focus();
  }, [focusTarget, isOpen]);
  const isExpanded = panel !== undefined && isOpen;
  return <aside aria-label="Información de la palabra" className={`${styles.lexicalPanel} ${panelStyles.container} ${isExpanded ? "" : styles.lexicalPanelClosed}`} id="lexical-detail">
    <p aria-live="polite" className={panelStyles.srOnly}>{panel === undefined ? "" : `Palabra seleccionada: ${panel.surface}`}</p>
    {panel === undefined
      ? <p className={panelStyles.hint}><strong>Selecciona una palabra</strong> para ver su información.</p>
      : isOpen
        ? <><button aria-label="Ocultar panel de palabra" className={panelStyles.handle} onClick={() => { setFocusTarget("open"); onToggle(); }} type="button"><ChevronIcon expanded={true} /></button><WordPanel closeButtonRef={closeButtonRef} eventError={eventError} key={panel.id} onClose={() => { setFocusTarget("open"); onToggle(); }} panel={panel} reference={reference} /></>
        : <button aria-expanded={false} className={panelStyles.openButton} onClick={() => { setFocusTarget("close"); onToggle(); }} ref={openButtonRef} type="button"><span>Ver palabra seleccionada</span><ChevronIcon expanded={false} /></button>}
  </aside>;
}
