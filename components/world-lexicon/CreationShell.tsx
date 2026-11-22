"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createBrowserWorldLexiconService, createPreviewWorldLexiconService } from "@/lib/adapters/world-lexicon";
import { WorldLexiconFrame } from "./WorldLexiconFrame";
import { StoryStudio } from "./StoryStudio";
import { PlacePicker } from "./GeneratedPlaces";
import { HistoriaInicio, type HistoriaAbierta } from "./HistoriaInicio";
import type { StudioSource } from "@/features/story-studio/model";
import type { EngineHost } from "./EngineStage";
import styles from "./creation-shell.module.css";
import pageStyles from "./world-lexicon.module.css";
import stageStyles from "./engine-stage.module.css";

export type WorkshopEditor = "body" | "face";
/** Petición de la barra al Estudio: abrir un taller (o cerrarlo con editor null). `n` la distingue de la anterior. */
export type WorkshopRequest = { editor: WorkshopEditor | null; n: number };

const GENERATOR = "http://127.0.0.1:5179";
const BAR_HEIGHT = 52;
const isPlaceId = (v: unknown): v is string => typeof v === "string" && /^atlas-[\w-]{1,120}$/.test(v);

function generatorUrl(place: string | null) {
  const url = new URL(GENERATOR + "/");
  url.searchParams.set("origen", window.location.origin);
  if (place) url.searchParams.set("lugar", place);
  return url.href;
}

const icons: Record<string, string> = {
  generador: "M3 19 9 9l4 6 3-4 5 8H3ZM16.5 7.5a2 2 0 1 0 0-.01",
  editor: "M12 3 3 8v9l9 5 9-5V8l-9-5Zm0 0v19M3 8l9 5 9-5",
  estudio: "M3 6h18v13H3V6Zm0 4h18M7 6l3 4m3-4 3 4",
  body: "M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-6 3h12M12 10v5m0 0-3 6m3-6 3 6",
  face: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
};
function Glyph({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>;
}

type Props = {
  host: EngineHost; owner: string; query: string; studioSources: StudioSource[];
  studentService: ReturnType<typeof createBrowserWorldLexiconService>;
  previewService: ReturnType<typeof createPreviewWorldLexiconService>;
  localTest: boolean; draft: boolean;
  /** Historia elegida en el menú de inicio antes de montar el motor. */
  initialHistoria?: HistoriaAbierta | null;
};

/**
 * Generador de mundos › Editor de escenarios › Estudio › Talleres, con una sola barra.
 * Editor y Estudio comparten el motor vivo (cambiar entre ellos no recarga el escenario).
 * El Generador es otra aplicación: se conserva montada y oculta, y su lugar se pasa al Editor por mensaje.
 */
export function CreationShell({ host, owner, query, studioSources, studentService, previewService, localTest, draft, initialHistoria = null }: Props) {
  // El Estudio trabaja siempre sobre una historia (un archivo en Estudio/Historias, como un .blend).
  // Sin historia abierta se muestra el menú de inicio; una vez abierta se conserva oculta al ir al Editor (no pierde trabajo).
  const [abierta, setAbierta] = useState<(HistoriaAbierta & { nonce: number }) | null>(initialHistoria ? { ...initialHistoria, nonce: 0 } : null);
  const studioOpened = abierta !== null;
  const openHistoria = (h: HistoriaAbierta) => {
    setAbierta(old => ({ ...h, nonce: (old?.nonce ?? 0) + 1 }));
    const params = new URLSearchParams(window.location.search); params.set("h", h.file.id);
    window.history.replaceState(window.history.state, "", "?" + params.toString());
  };
  const closeHistoria = () => {
    setAbierta(null);
    const params = new URLSearchParams(window.location.search); params.delete("h");
    window.history.replaceState(window.history.state, "", "?" + params.toString());
  };
  const [generatorSrc, setGeneratorSrc] = useState<string | null>(null);
  const [generatorPlace, setGeneratorPlace] = useState<string | null>(null);
  const generatorFrame = useRef<HTMLIFrameElement>(null);
  const [workshopRequest, setWorkshopRequest] = useState<WorkshopRequest>({ editor: null, n: 0 });
  const [workshopOpen, setWorkshopOpen] = useState<WorkshopEditor | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const studioActions = useRef<HTMLDivElement>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
  // Escenario de servicio (restaurante, farmacia…) que se está viendo en el Editor en lugar del motor.
  const [service, setService] = useState<string | null>(null);
  const hostRef = useRef(host); hostRef.current = host;

  // Abrir ?modo=generador directamente (o con ?lugar=…) monta el Generador.
  useEffect(() => {
    if (host.mode === "generador" && !generatorSrc) {
      const place = new URLSearchParams(window.location.search).get("lugar");
      setGeneratorPlace(isPlaceId(place) ? place : null);
      setGeneratorSrc(generatorUrl(isPlaceId(place) ? place : null));
    }
  }, [host.mode, generatorSrc]);

  // El Generador pasa el lugar al Editor: SENT (recién enviado o actualizado) u OPEN (ya estaba en el visor).
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== GENERATOR || event.source !== generatorFrame.current?.contentWindow) return;
      const m = event.data;
      if (m?.channel !== "spanstories.generador" || m.version !== 1 || !isPlaceId(m.id)) return;
      if (m.type !== "SENT" && m.type !== "OPEN") return;
      const h = hostRef.current;
      setGeneratorPlace(m.id);
      // Recién enviado: se carga su versión actual aunque ya estuviera abierto (si no, se vería la anterior).
      if (m.type === "SENT" && h.zone === m.id && !h.revision) h.reload(); else h.setZone(m.id, null);
      h.setMode("editor");
      const label = typeof m.label === "string" ? m.label.slice(0, 80) : "El lugar";
      setNotice(m.type === "SENT" ? `${label} llegó desde el Generador · última versión` : `${label} abierto desde el Generador`);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => {
    if (!actionsOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !studioActions.current?.contains(event.target)) setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setActionsOpen(false);
        actionsButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [actionsOpen]);

  const goGenerator = (place: string | null = null) => {
    if (!generatorSrc || (place && place !== generatorPlace)) { setGeneratorPlace(place); setGeneratorSrc(generatorUrl(place)); }
    host.setMode("generador");
  };
  const goStudio = () => { if (workshopOpen) setWorkshopRequest(r => ({ editor: null, n: r.n + 1 })); host.setMode("estudio"); };
  const goWorkshop = (editor: WorkshopEditor) => { host.setMode("estudio"); setWorkshopRequest(r => ({ editor, n: r.n + 1 })); };
  const active = host.mode === "estudio" && workshopOpen ? workshopOpen : host.mode;
  const atlas = isPlaceId(host.zone) ? host.zone : null;
  const placeQuery = (() => { const p = new URLSearchParams(query); if (host.zone) p.set("zone", host.zone); else p.delete("zone"); if (host.revision) p.set("revision", host.revision); else p.delete("revision"); return p.toString(); })();
  const visor = new URLSearchParams(placeQuery); visor.set("modo", "visor");

  const step = (id: string, label: string, short: string, onClick: () => void, title: string): ReactNode =>
    <button type="button" className={styles.step} data-space={id} aria-label={short} aria-current={active === id ? "page" : undefined} onClick={() => { setActionsOpen(false); onClick(); }} title={title}>
      <Glyph name={id} /><span className={styles.long}>{label}</span><span className={styles.short}>{short}</span>
    </button>;

  return <div className={styles.shell} data-mode={host.mode} style={{ "--shell-bar": BAR_HEIGHT + "px" } as CSSProperties}>
    <header className={styles.bar}>
      <a className={styles.brand} href="?modo=editor" onClick={e => { e.preventDefault(); host.setMode("editor"); }} title="SpanStories · Editor de escenarios">
        <span className={styles.logo}><Glyph name="editor" /></span><strong>SpanStories</strong>
      </a>
      <nav className={styles.flow} aria-label="Espacios de creación">
        <span className={styles.arrow} aria-hidden="true">›</span>
        {step("editor", "Editor de escenarios", "Editor", () => host.setMode("editor"), "Coloca objetos y palabras · mismo escenario que el Estudio")}
        <span className={styles.arrow} aria-hidden="true">›</span>
        {step("estudio", "Estudio", "Estudio", goStudio, "Dirige la historia · mismo escenario que el Editor")}
        <span className={styles.arrow} aria-hidden="true">›</span>
        <div className={styles.group} role="group" aria-label="Talleres">
          <span className={styles.groupLabel}>Talleres</span>
          {step("body", "Animación", "Animación", () => goWorkshop("body"), "Taller de animación del personaje seleccionado en el Estudio")}
          {step("face", "Facial", "Facial", () => goWorkshop("face"), "Taller facial del personaje seleccionado en el Estudio")}
        </div>
      </nav>
      <div className={styles.context}>
        {host.mode === "editor" && <>
          <PlacePicker zone={host.zone} revision={host.revision} onChange={(zone, revision) => { setService(null); host.setZone(zone, revision); }} service={service} onService={setService} className={styles.place} />
          {atlas && <button type="button" className={styles.tool} onClick={() => goGenerator(atlas)} title="Abrir este lugar en el Generador de mundos"><Glyph name="generador" /><span>Editar en el Generador</span></button>}
          <a className={styles.tool} href={"?" + visor.toString()} title="Vista previa del Visor de escenarios (como lo ve el estudiante)"><Glyph name="eye" /><span>Vista previa</span></a>
        </>}
        {host.mode === "generador" && generatorSrc && <a className={styles.tool} href={GENERATOR + "/" + (generatorPlace ? "?lugar=" + encodeURIComponent(generatorPlace) : "")} target="_blank" rel="noopener noreferrer" title="Abrir el Generador en una pestaña aparte"><Glyph name="external" /><span>Abrir en pestaña</span></a>}
        <div className={styles.actionsWrap} ref={studioActions} hidden={host.mode !== "estudio" || !studioOpened} data-open={actionsOpen}>
          <button type="button" className={styles.actionsToggle} ref={actionsButton} aria-expanded={actionsOpen}
            aria-controls="studio-header-actions" onClick={() => setActionsOpen(open => !open)}>Acciones</button>
          <div ref={setActions} id="studio-header-actions" className={styles.actions} />
        </div>
      </div>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    <div className={styles.content}>
      {host.mode === "editor" && service && <div className={styles.service}>
        <p className={styles.serviceNote} role="status">Vista del escenario de servicio · aún no está adaptado al motor de ciudades, así que no admite edición ni Estudio. <a href={"/api/servicios/" + encodeURIComponent(service) + "/index.html"} target="_blank" rel="noopener noreferrer">Abrir en pestaña</a></p>
        <iframe key={service} src={"/api/servicios/" + encodeURIComponent(service) + "/index.html"} title={"Escenario de servicio " + service} allow="autoplay; fullscreen" />
      </div>}
      {host.mode === "editor" && <main className={pageStyles.page + " " + stageStyles.transparent + " " + styles.fill} data-interactive-story>
        <WorldLexiconFrame host={host} query={query} viewerUrl={host.origin + "/"} service={studentService} development localTest={localTest} draft={draft} title="Editor de escenarios" />
      </main>}
      {host.mode === "estudio" && !abierta && <HistoriaInicio embedded sources={studioSources} onOpen={openHistoria} />}
      {abierta && <div className={host.mode === "estudio" ? styles.fill : stageStyles.hidden}>
        <StoryStudio key={owner + ":" + abierta.file.id + ":" + abierta.nonce} host={host} viewerUrl={host.origin + "/"} service={previewService} owner={owner} sources={studioSources}
          historia={abierta} onOpenHistoria={openHistoria} onCloseHistoria={closeHistoria}
          toolbar={actions} workshopRequest={workshopRequest} onWorkshopChange={setWorkshopOpen} />
      </div>}
      {generatorSrc && <iframe ref={generatorFrame} className={host.mode === "generador" ? styles.generator : stageStyles.hidden} src={generatorSrc} title="Generador de mundos" allow="autoplay; fullscreen" />}
    </div>
  </div>;
}
