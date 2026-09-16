import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { StoryReaderViewModel, StoryReaderWordReference } from "@/features/story-reader/model";
import type { WordPanelTextPart, WordPanelViewModel } from "@/features/story-reader/word-panel";
import { speakSpanish } from "@/features/story-reader/browser-speech";
import { readerWordPractice, togglePracticeWord, useIsPracticeWordSaved, type ReaderWordPractice } from "@/lib/adapters/practice";
import styles from "./baseline.module.css";
import panelStyles from "./word-panel.module.css";
import { LexicalProgress } from "./LexicalProgress";
import { recordKnowledge } from "@/lib/adapters/lexical-knowledge";
import { practiceTargetKey } from "@/features/practice/domain/target";

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

function ImageIcon() {
  return <svg aria-hidden="true" focusable="false" width="26" height="26" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="m5 18 5-5 3 3 2-2 4 4" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /></svg>;
}

function MagnifierIcon() {
  return <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-4.3-4.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

/** Icono de lupa sobre la imagen: abre un pop ampliado x4 que queda contenido dentro del panel
 * (nunca centrado en pantalla) y se cierra al hacer scroll, tocar fuera o pulsar Escape. */
function ZoomableImage({ alt, className, onError, src }: { alt: string; className: string; onError?: () => void; src: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const close = () => setRect(null);
  const open = () => {
    const img = imgRef.current;
    const panel = img?.closest<HTMLElement>(`.${panelStyles.panel}`);
    if (!img || !panel) return;
    const imgRect = img.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 12;
    const maxWidth = panelRect.width - margin * 2;
    const maxHeight = panelRect.height - margin * 2;
    let width = Math.min(imgRect.width * 4, maxWidth);
    let height = width * (imgRect.height / imgRect.width);
    if (height > maxHeight) {
      height = maxHeight;
      width = height * (imgRect.width / imgRect.height);
    }
    const left = Math.min(Math.max(imgRect.left + imgRect.width / 2 - width / 2, panelRect.left + margin), panelRect.right - margin - width);
    const top = Math.min(Math.max(imgRect.top + imgRect.height / 2 - height / 2, panelRect.top + margin), panelRect.bottom - margin - height);
    setRect({ top, left, width, height });
  };
  useEffect(() => {
    if (rect === null) return;
    const handleClose = () => close();
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", handleClose, true);
    document.addEventListener("scroll", handleClose, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleClose, true);
      document.removeEventListener("scroll", handleClose, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [rect]);
  return <span className={panelStyles.zoomWrap}>
    <img alt={alt} className={className} loading="lazy" onError={onError} ref={imgRef} src={src} />
    <button aria-label={`Ampliar imagen de «${alt}»`} className={panelStyles.zoomButton} onClick={open} type="button"><MagnifierIcon /></button>
    {rect === null ? null : <img alt={alt} className={panelStyles.zoomedImage} src={src} style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
  </span>;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function AudioButton({ label, text }: { label: string; text: string }) {
  return <button aria-label={label} className={panelStyles.audioButton} onClick={() => speakSpanish(text)} title={label} type="button"><SpeakerIcon /></button>;
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = { wikimedia: "Wikimedia Commons", openverse: "Openverse" };

/** Enriquecimiento opcional: si la imagen remota falla, se oculta y el resto del panel sigue igual. */
function DictionaryImage({ image }: { image: NonNullable<WordPanelViewModel["dictionaryImage"]> }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const providerLabel = image.provider === undefined ? undefined : PROVIDER_LABELS[image.provider] ?? image.provider;
  const hasSource = image.creator !== undefined || providerLabel !== undefined || image.license !== undefined || image.sourcePageUrl !== undefined;
  return <figure className={panelStyles.dictionaryImage}>
    <ZoomableImage alt={image.alt} className={panelStyles.dictionaryImagePicture} onError={() => setFailed(true)} src={image.src} />
    {hasSource ? <details className={panelStyles.dictionaryImageSource}>
      <summary>ⓘ Fuente</summary>
      <p>
        {image.creator === undefined ? null : `${image.creator}. `}
        {providerLabel === undefined ? null : `${providerLabel}. `}
        {image.license === undefined ? null : image.licenseUrl === undefined
          ? image.license
          : <a href={image.licenseUrl} rel="noopener noreferrer" target="_blank">{image.license}</a>}
        {image.sourcePageUrl === undefined ? null : <> · <a href={image.sourcePageUrl} rel="noopener noreferrer" target="_blank">Ver origen</a></>}
      </p>
    </details> : null}
  </figure>;
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

function WordPanel({ panel, reference, practice, eventError, closeButtonRef, onClose, fallbackTranslation }: {
  panel: WordPanelViewModel;
  reference: StoryReaderWordReference | undefined;
  /** Null solo si la selección no resuelve a nada guardable; toda palabra seleccionable tiene esta opción. */
  practice: ReaderWordPractice | null;
  eventError: boolean;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  fallbackTranslation?: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFitWord(titleRef, panel.surface);
  const saved = useIsPracticeWordSaved(practice);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "examples" | "usage" | "context" | "more">("summary");
  const examples = reference?.examples ?? panel.examples ?? [];
  const otherStories = reference?.otherStories ?? [];
  const usageNotes = reference?.usageNotes ?? [];
  const relatedWords = reference?.relatedWords ?? [];
  const translation = reference?.translation ?? panel.translation ?? fallbackTranslation;
  const contextTranslation = translation === undefined ? panel.contextTranslation : undefined;
  const canSave = panel.canSave !== false;
  const partOfSpeech = reference?.partOfSpeechLabel ?? panel.partOfSpeechLabel;
  const usage = reference?.shortUsage ?? panel.shortUsage;
  // Un país (bandera) nunca queda etiquetado "Sustantivo" por el heurístico de POS, pero sigue
  // siendo una imagen resuelta y lista para mostrar: su presencia basta para reservar el hueco.
  const imageEligible = partOfSpeech === "Sustantivo" || partOfSpeech === "Verbo" || panel.dictionaryImage !== undefined;
  const renderExamples = (items: typeof examples) => items.length === 0
    ? <p className={panelStyles.emptyState}>Todavía no hay ejemplos publicados para esta palabra.</p>
    : <div className={panelStyles.sourceList}>{items.map((example, index) => <div className={panelStyles.sourceRow} key={index}><strong lang="es">{example.text}</strong>{example.translation === undefined ? null : <span lang="en">{example.translation}</span>}</div>)}</div>;
  const renderOtherStories = () => otherStories.length === 0
    ? <p className={panelStyles.emptyState}>Todavía no aparece en otras historias publicadas.</p>
    : <div className={panelStyles.otherStories}>{otherStories.map((item, index) => <div className={panelStyles.otherStory} key={index}><BookIcon /><div><p lang="es"><strong>{item.word}</strong>{item.rest}</p><small>{item.meta}</small></div></div>)}</div>;
  const usageBlock = usage === undefined
    ? <p className={panelStyles.emptyState}>La explicación de uso está pendiente de publicación.</p>
    : <p className={panelStyles.usage}><SpeakerIcon />{usage}</p>;
  const contextBlock = <p className={panelStyles.contextCard} lang="es"><ContextText parts={panel.currentContext.parts} /></p>;
  const tabContent = activeTab === "summary" ? <>
    {usageBlock}
    <section><div className={panelStyles.sourceHeading}><h3>Ejemplos</h3>{examples.length > 3 ? <button onClick={() => setActiveTab("examples")} type="button">Ver más →</button> : null}</div>{renderExamples(examples.slice(0, 3))}</section>
    <section><h3>En esta historia</h3>{contextBlock}</section>
    <section><div className={panelStyles.sourceHeading}><h3>En otras historias</h3>{otherStories.length > 2 ? <button onClick={() => setActiveTab("context")} type="button">Ver todas →</button> : null}</div>{renderOtherStories()}</section>
  </> : activeTab === "examples" ? <section><h3>Ejemplos</h3>{renderExamples(examples)}</section>
    : activeTab === "usage" ? <><section><h3>Uso</h3>{usageBlock}</section>{usageNotes.length === 0 ? <p className={panelStyles.emptyState}>No hay notas adicionales publicadas.</p> : <ul className={panelStyles.usageNotes}>{usageNotes.map((note) => <li key={note}>{note}</li>)}</ul>}</>
    : activeTab === "context" ? <><section><h3>En esta historia</h3>{contextBlock}</section><section><h3>En otras historias</h3>{renderOtherStories()}</section></>
    : <dl className={panelStyles.dataList}><div><dt>Frecuencia</dt><dd>{reference?.frequency ?? "Pendiente de publicación"}</dd></div><div><dt>Palabras relacionadas</dt><dd className={panelStyles.related} lang="es">{relatedWords.length === 0 ? "Pendiente de publicación" : relatedWords.map((word) => <span key={word}>{word}</span>)}</dd></div></dl>;
  return <div className={panelStyles.panel} id="lexical-detail-content">
    <header className={panelStyles.topBar}><span>Palabra seleccionada</span><button aria-label="Cerrar la ficha" className={panelStyles.closeButton} onClick={onClose} ref={closeButtonRef} type="button"><CloseIcon /></button></header>
    <div className={panelStyles.body}>
      <section className={`${panelStyles.summary} ${imageEligible ? panelStyles.summaryWithImage : ""}`}>
        <div><div className={panelStyles.wordLine}><h2 lang="es" ref={titleRef} style={{ "--word-length": Array.from(panel.surface).length } as CSSProperties}>{panel.surface}</h2><AudioButton label={`Escuchar «${panel.surface}»`} text={panel.surface} />{practice === null ? null : <button aria-label={saved ? "Quitar de palabras guardadas" : "Guardar palabra"} aria-pressed={saved} className={`${panelStyles.favoriteButton} ${saved ? panelStyles.favoriteActive : ""}`} disabled={!canSave} onClick={() => void togglePracticeWord(practice)} type="button">☆</button>}</div>{translation !== undefined
                ? <p className={panelStyles.translation} lang="en">{translation}</p>
                : contextTranslation !== undefined
                  ? <p className={panelStyles.translation} lang="en">{contextTranslation}<span className={panelStyles.srOnly}> (traducción de esta frase)</span></p>
                  : <p className={panelStyles.translation}>—</p>}<ul aria-label="Datos de la palabra" className={panelStyles.tags}>{partOfSpeech === undefined ? <li>Sin clasificar</li> : <li>{partOfSpeech}</li>}<li className={panelStyles.levelTag}><span className={panelStyles.srOnly}>Nivel </span>{panel.cefrLevel ?? "—"}</li></ul></div>
        {imageEligible ? panel.image !== undefined
          ? <div><ZoomableImage alt={panel.image.alt} className={panelStyles.summaryImage} src={panel.image.src} />{reference?.imageCaption === undefined ? null : <p className={panelStyles.imageCaption}>{reference.imageCaption}</p>}</div>
          : panel.dictionaryImage !== undefined
            ? <DictionaryImage image={panel.dictionaryImage} key={panel.id} />
            : <div className={panelStyles.imagePlaceholder}><ImageIcon /><span>Imagen pendiente</span></div>
          : null}
      </section>
      {practice !== null ? <LexicalProgress word={practice} revealed={translation !== undefined || contextTranslation !== undefined} /> : null}
      <button aria-expanded={detailsOpen} className={panelStyles.detailsToggle} onClick={() => setDetailsOpen((open) => !open)} type="button">Detalles<ChevronIcon expanded={detailsOpen} /></button>
      <div className={detailsOpen ? panelStyles.detailsOpen : panelStyles.details}><div className={panelStyles.detailsInner}>
        <nav aria-label="Secciones de la palabra" className={panelStyles.sectionNav}>{[["summary", "Resumen"], ["examples", "Ejemplos"], ["usage", "Uso"], ["context", "En contexto"], ["more", "Más"]].map(([id, label]) => <button aria-current={activeTab === id ? "page" : undefined} className={activeTab === id ? panelStyles.activeTab : undefined} key={id} onClick={() => setActiveTab(id as typeof activeTab)} type="button">{label}</button>)}</nav>
        <div className={panelStyles.tabContent}>{tabContent}</div>
      </div></div>
      {eventError ? <p className={panelStyles.error} role="status">La palabra se abrió, pero la interacción no pudo guardarse.</p> : null}
    </div>
    <footer className={panelStyles.actions}>
      {practice === null ? null : <button aria-pressed={saved} className={panelStyles.saveButton} disabled={!canSave} onClick={() => void togglePracticeWord(practice)} type="button"><BookmarkIcon filled={saved} />{saved ? "Guardada" : "Guardar palabra"}</button>}
      {practice === null || !saved ? null : <button className={panelStyles.knownButton} onClick={() => recordKnowledge({ kind: "STATE_DECLARED", targetKey: practiceTargetKey(practice.target), storyVersionId: practice.savedFrom.storyVersionId, occurrenceId: practice.savedFrom.occurrenceId, declaredState: "KNOWN" })} type="button">Marcar como conocida</button>}
      <button className={panelStyles.practiceButton} onClick={() => speakSpanish(panel.currentContext.text)} type="button"><SpeakerIcon />Escuchar frase</button>
    </footer>
  </div>;
}

export function LexicalPanel({ model, selectedWordId, eventError, isOpen, onToggle, fallbackTranslation }: {
  model: StoryReaderViewModel;
  selectedWordId: string | null;
  eventError: boolean;
  isOpen: boolean;
  onToggle: () => void;
  fallbackTranslation?: string;
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
  // Se guarda la identidad léxica publicada (Sense o, si no está resuelto, Lexeme) cuando existe, nunca la
  // forma escrita: «soy» y «es» son la misma palabra guardada. Una palabra sin Lexeme se guarda igual, por
  // su selección exacta en la historia (UNRESOLVED_SURFACE), sin inventarle un Lexeme a partir del texto.
  const practice = selectedWordId === null ? null : readerWordPractice(model, selectedWordId);
  return <aside aria-label="Ficha de la palabra" className={`${styles.lexicalPanel} ${panelStyles.container} ${isExpanded ? "" : styles.lexicalPanelClosed}`} id="lexical-detail" onKeyDown={(event) => {
    if (event.key !== "Escape" || !isExpanded) return;
    event.stopPropagation();
    close();
  }}>
    <p aria-live="polite" className={panelStyles.srOnly}>{panel === undefined ? "" : `Palabra seleccionada: ${panel.surface}`}</p>
    {panel === undefined
      ? <p className={panelStyles.hint}><strong>Toca cualquier palabra</strong> de la historia para ver su ficha.</p>
      : isOpen
        ? <><button aria-label="Ocultar la ficha" className={panelStyles.handle} onClick={close} type="button"><ChevronIcon expanded={true} /></button><WordPanel closeButtonRef={closeButtonRef} eventError={eventError} fallbackTranslation={fallbackTranslation} key={panel.id} onClose={close} panel={panel} practice={practice} reference={reference} /></>
        : <button aria-expanded={false} className={panelStyles.openButton} onClick={() => { setFocusTarget("close"); onToggle(); }} ref={openButtonRef} type="button"><span>Ver «{panel.surface}»</span><ChevronIcon expanded={false} /></button>}
  </aside>;
}
