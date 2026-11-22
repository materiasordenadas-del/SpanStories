"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import styles from "./engine-stage.module.css";

/** Editor de escenarios y Estudio comparten un único motor vivo. */
export type EngineMode = "generador" | "editor" | "estudio";
/** Modos que dibuja el motor 3D (el Generador es otra aplicación: el motor queda oculto, sin recargarse). */
const ENGINE_MODES: readonly EngineMode[] = ["editor", "estudio"];
export const isEngineMode = (m: unknown): m is EngineMode => m === "generador" || m === "editor" || m === "estudio";

export type EngineHost = {
  /** El iframe único del motor (no se desmonta al cambiar de modo). */
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly origin: string;
  readonly mode: EngineMode;
  /** Zona cargada en el motor (null hasta que el motor la anuncia). */
  readonly zone: string | null;
  /** true si se llegó a este modo cambiando desde el otro (sin recargar), no abriendo la página directamente. */
  readonly switched: boolean;
  /** Hueco de cada modo: el motor se dibuja encima del hueco del modo activo. */
  slot(mode: EngineMode): (element: HTMLElement | null) => void;
  setMode(mode: EngineMode): void;
  /** Cambiar de zona sí recarga el motor: es otra ciudad. */
  setZone(zone: string, revision?: string | null): void;
  /** Versión guardada del lugar generado que se está viendo (null = la actual). */
  readonly revision: string | null;
  reload(): void;
  /** Hueco prioritario (el visor del Taller «En escena»): mientras exista, el motor se dibuja ahí, sobre los paneles. */
  setOverlay(element: HTMLElement | null): void;
};

const KEEP = ["room", "dev", "unbatched", "revision", "borrador"];

function engineUrl(viewerUrl: string, query: URLSearchParams, zone: string | null, studio: boolean, revision: string | null = query.get("revision")) {
  const url = new URL(viewerUrl);
  for (const key of KEEP) if (query.has(key)) url.searchParams.set(key, query.get(key)!);
  if (revision) url.searchParams.set("revision", revision); else url.searchParams.delete("revision");
  if (zone) url.searchParams.set("zone", zone);
  if (studio) url.searchParams.set("estudio", "1");
  return url.href;
}

export function EngineStage({ viewerUrl, query, initialMode, children }: { viewerUrl: string; query: string; initialMode: EngineMode; children: (host: EngineHost) => ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<EngineMode, HTMLElement>());
  const overlay = useRef<HTMLElement | null>(null);
  const setOverlay = useCallback((element: HTMLElement | null) => { overlay.current = element; }, []);
  const entry = useMemo(() => new URLSearchParams(query), [query]);
  const origin = new URL(viewerUrl).origin;
  const [mode, setModeState] = useState<EngineMode>(initialMode);
  const modeRef = useRef(mode);
  const [switched, setSwitched] = useState(false);
  const [zone, setZoneState] = useState<string | null>(() => entry.get("zone"));
  const zoneRef = useRef(zone);
  const [revision, setRevision] = useState<string | null>(() => entry.get("revision"));
  const revisionRef = useRef(revision);
  // El src solo cambia con la zona (o al reintentar); el modo se cambia por mensaje, sin recargar.
  // Estudio sin lugar (historia nueva sin escenario): el motor no se carga hasta que se elige uno o se pasa al Editor.
  const [source, setSource] = useState<{ src: string | null; attempt: number }>(() => ({ src: initialMode === "estudio" && !entry.get("zone") ? null : engineUrl(viewerUrl, entry, entry.get("zone"), initialMode === "estudio"), attempt: 0 }));
  const idle = useRef(source.src === null);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const pendingZone = useRef<{ zone: string; rev: string | null } | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const statusRequests = useRef(new Map<string, (dirty: boolean | null) => void>());
  const changeZone = useCallback((next: string, rev: string | null = revisionRef.current) => {
    idle.current = false; zoneRef.current = next; setZoneState(next); revisionRef.current = rev; setRevision(rev);
    // La dirección recuerda el lugar: al recargar se vuelve a él.
    const params = new URLSearchParams(window.location.search);
    params.set("zone", next); if (rev) params.set("revision", rev); else params.delete("revision");
    window.history.replaceState(window.history.state, "", "?" + params.toString());
    setSource(s => ({ src: engineUrl(viewerUrl, entry, next, modeRef.current === "estudio", rev), attempt: s.attempt + 1 }));
  }, [viewerUrl, entry]);
  const post = useCallback((type: string, data: Record<string, unknown> = {}) => frame.current?.contentWindow?.postMessage({ channel: "spanstories.engine", version: 1, type, ...data }, origin), [origin]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const m = event.data;
      if (m?.channel !== "spanstories.engine" || m.version !== 1) return;
      if (typeof m.zoneId === "string") { zoneRef.current = m.zoneId; setZoneState(m.zoneId); }
      if (m.type === "LOADED") {
        const wanted = pendingZone.current; pendingZone.current = null;
        if (wanted && (wanted.zone !== m.zoneId || wanted.rev !== revisionRef.current)) { changeZone(wanted.zone, wanted.rev); return; }
        if (ENGINE_MODES.includes(modeRef.current) && m.mode !== modeRef.current) post("MODE", { mode: modeRef.current });
      }
      if (m.type === "MODE_READY") setModeError(null);
      // El motor no pudo pasar de modo: se avisa aquí (su propio rótulo está oculto en el Estudio).
      if (m.type === "MODE_ERROR") setModeError(`No se pudo cambiar a ${m.mode === "estudio" ? "Estudio" : "Editor"}: ${typeof m.error === "string" ? m.error : "error del motor"}`);
      if (m.type === "PROJECT_STATUS_RESULT" && typeof m.requestId === "string") { const done = statusRequests.current.get(m.requestId); if (done) { statusRequests.current.delete(m.requestId); done(typeof m.dirty === "boolean" ? m.dirty : null); } }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, post, changeZone]);

  /** Pregunta al motor si el Editor tiene cambios sin guardar (null si no responde). */
  const projectDirty = useCallback(() => new Promise<boolean | null>(resolve => {
    const requestId = Math.random().toString(36).slice(2);
    const timer = window.setTimeout(() => { statusRequests.current.delete(requestId); resolve(null); }, 1500);
    statusRequests.current.set(requestId, dirty => { window.clearTimeout(timer); resolve(dirty); });
    post("PROJECT_STATUS", { requestId });
  }), [post]);

  const setMode = useCallback((next: EngineMode, push = true) => {
    if (next === modeRef.current) return;
    modeRef.current = next; setModeState(next); setSwitched(true);
    if (push) {
      const params = new URLSearchParams(window.location.search);
      params.set("modo", next);
      if (zoneRef.current) params.set("zone", zoneRef.current);
      window.history.pushState({ modo: next }, "", "?" + params.toString());
    }
    if (ENGINE_MODES.includes(next)) {
      // El Editor necesita un lugar: si el motor no se había cargado, se carga el de siempre.
      if (idle.current && next !== "estudio") { idle.current = false; setSource(s => ({ src: engineUrl(viewerUrl, entry, null, false), attempt: s.attempt + 1 })); }
      else post("MODE", { mode: next });
    }
  }, [post, viewerUrl, entry]);

  useEffect(() => {
    const onPop = () => { const m = new URLSearchParams(window.location.search).get("modo"); if (isEngineMode(m)) setMode(m, false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setMode]);

  const setZone = useCallback((next: string, wanted?: string | null) => {
    // Sin versión indicada: en el mismo lugar se conserva la que hay; en otro lugar, su versión actual.
    const rev = wanted === undefined ? (next === zoneRef.current ? revisionRef.current : null) : wanted;
    if (!next || (next === zoneRef.current && rev === revisionRef.current)) return;
    // Si el motor aún no anunció qué zona cargó, se espera a su LOADED en vez de recargar a ciegas.
    if (zoneRef.current === null && !idle.current) { pendingZone.current = { zone: next, rev }; return; }
    if (idle.current) { changeZone(next, rev); return; }
    // Cambiar de lugar recarga el motor: las ediciones sin guardar del Editor se perderían sin aviso.
    void projectDirty().then(dirty => {
      if (dirty && !window.confirm("El Editor de escenarios tiene cambios sin guardar en este lugar.\n\nSi cambias de lugar ahora se perderán. ¿Cambiar igualmente?\n(Cancela y usa «Guardar» en el Editor para conservarlos.)")) return;
      changeZone(next, rev);
    });
  }, [changeZone, projectDirty]);

  const reload = useCallback(() => setSource(s => idle.current ? s : ({ src: engineUrl(viewerUrl, entry, zoneRef.current, modeRef.current === "estudio", revisionRef.current), attempt: s.attempt + 1 })), [viewerUrl, entry]);

  const slotSetters = useRef(new Map<EngineMode, (element: HTMLElement | null) => void>());
  const slot = useCallback((m: EngineMode) => {
    let setter = slotSetters.current.get(m);
    if (!setter) { setter = element => { if (element) slots.current.set(m, element); else slots.current.delete(m); }; slotSetters.current.set(m, setter); }
    return setter;
  }, []);

  // Coloca el motor sobre el hueco del modo activo; si los paneles cambian de tamaño, lo sigue.
  useEffect(() => {
    let raf = 0, last = "";
    const place = () => {
      const top = overlay.current?.isConnected ? overlay.current : null;
      const target = top ?? slots.current.get(modeRef.current), el = box.current;
      if (el) {
        const r = target?.getBoundingClientRect();
        const key = r && r.width && r.height ? `${r.left}|${r.top}|${r.width}|${r.height}|${top ? 1 : 0}` : "hidden";
        if (key !== last) {
          last = key;
          if (key === "hidden") el.style.visibility = "hidden";
          else Object.assign(el.style, { visibility: "visible", left: r!.left + "px", top: r!.top + "px", width: r!.width + "px", height: r!.height + "px", zIndex: top ? "79" : "" });
        }
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, []);

  const host: EngineHost = { frame, origin, mode, zone, revision, switched, slot, setMode, setZone, reload, setOverlay };
  return <div className={styles.stage} data-mode={mode}>
    <div ref={box} className={styles.engine} style={{ visibility: "hidden" }}>
      {source.src && <iframe key={source.attempt} ref={frame} src={source.src} title={mode === "estudio" ? "Escenario de la historia" : "Editor de escenarios"} allow="autoplay" sandbox="allow-scripts allow-same-origin allow-downloads allow-pointer-lock allow-popups allow-popups-to-escape-sandbox" />}
    </div>
    {modeError && <div role="alert" className={styles.modeError}>{modeError} <button type="button" onClick={() => { setModeError(null); reload(); }}>Recargar el escenario</button> <button type="button" onClick={() => setModeError(null)}>Cerrar</button></div>}
    {children(host)}
  </div>;
}
