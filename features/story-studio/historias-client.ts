"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { localAudioId, type StudioAudioAsset } from './browser-media';
import { sequenceList, type StudioProject, type StudioSource } from './model';
import type { HistoriaFile, HistoriaSummary } from './historia';

/** Cliente de app/api/historias: el disco es la fuente de verdad; localStorage solo es espejo de emergencia. */
const API = '/api/historias';
async function call<T>(init: RequestInit & { query?: string } = {}): Promise<T> {
  const response = await fetch(API + (init.query ?? ''), { cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(data.error || 'No se pudo acceder a las historias.'), { status: response.status, revision: data.revision });
  return data as T;
}
const post = <T,>(body: Record<string, unknown>) => call<T>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const historias = {
  list: () => call<{ historias: HistoriaSummary[]; ultima: string | null; damaged: string[] }>(),
  open: (id: string) => call<{ historia: HistoriaFile | null; autoguardado: HistoriaFile | null; autoError: string | null; copias: { n: number; savedAt: string; revision: number }[] }>({ query: '?id=' + encodeURIComponent(id) }),
  copy: (id: string, n: number) => call<{ historia: HistoriaFile | null }>({ query: `?id=${encodeURIComponent(id)}&copia=${n}` }),
  create: (historia: HistoriaFile) => post<{ historia: HistoriaFile }>({ accion: 'crear', historia }),
  save: (historia: HistoriaFile, expectedRevision: number | null) => post<{ historia: HistoriaFile; directory: string }>({ accion: 'guardar', historia, expectedRevision }),
  autosave: (historia: HistoriaFile) => post<{ autosaveAt: string }>({ accion: 'autoguardar', historia }),
  touch: (id: string) => post({ accion: 'abrir', id }),
  discard: (id: string) => post({ accion: 'descartar', id }),
  rename: (id: string, name: string) => post({ accion: 'renombrar', id, name }),
  duplicate: (id: string, name?: string) => post<{ historia: HistoriaFile }>({ accion: 'duplicar', id, name }),
  remove: (id: string) => post({ accion: 'eliminar', id }),
  audioList: (id: string) => call<{ audio: Omit<StudioAudioAsset, 'blob'>[] }>({ query: `?id=${encodeURIComponent(id)}&audios=1` }),
};

/** Sube a la carpeta de la historia las grabaciones que usa y aún no están en disco. */
export async function uploadHistoriaAudio(id: string, project: StudioProject, assets: readonly StudioAudioAsset[]) {
  const wanted = new Set(sequenceList(project).flatMap(x => x.sequence.cues).flatMap(c => (c.kind === 'dialogue' || c.kind === 'sound') && c.audioUrl ? [localAudioId(c.audioUrl)].filter((v): v is string => !!v) : []));
  if (!wanted.size) return { sent: 0, missing: 0 };
  const onDisk = new Set((await historias.audioList(id)).audio.map(a => a.id));
  let sent = 0;
  const loaded = new Set(assets.map(a => a.id)), missing = [...wanted].filter(id => !onDisk.has(id) && !loaded.has(id));
  for (const asset of assets) {
    if (!wanted.has(asset.id) || onDisk.has(asset.id)) continue;
    const { blob, ...meta } = asset;
    const response = await fetch(`${API}?id=${encodeURIComponent(id)}&sha=${asset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Meta': encodeURIComponent(JSON.stringify(meta)) }, body: blob });
    if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'No se pudo guardar una grabación.');
    sent++;
  }
  // Grabaciones usadas que no están ni en disco ni en este navegador: se guarda igual, pero se avisa.
  return { sent, missing: missing.length };
}
/** Descarga de la carpeta de la historia las grabaciones que falten en este navegador. */
export async function downloadHistoriaAudio(id: string, have: readonly { id: string }[]): Promise<StudioAudioAsset[]> {
  const known = new Set(have.map(a => a.id)), rows: StudioAudioAsset[] = [];
  for (const meta of (await historias.audioList(id)).audio) {
    if (known.has(meta.id)) continue;
    const response = await fetch(`${API}?id=${encodeURIComponent(id)}&audio=${meta.id}`, { cache: 'no-store' });
    if (response.ok) rows.push({ ...meta, blob: await response.blob() });
  }
  return rows;
}

const mirrorKey = (id: string) => `spanstories.historia.espejo:${id}`;
export function readMirror(id: string): HistoriaFile | null { try { const t = localStorage.getItem(mirrorKey(id)); return t ? JSON.parse(t) : null; } catch { return null; } }
export function clearMirror(id: string) { try { localStorage.removeItem(mirrorKey(id)); } catch {} }
export function listMirrors(): HistoriaFile[] {
  const out: HistoriaFile[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('spanstories.historia.espejo:')) { const h = readMirror(k.slice(28)); if (h) out.push(h); } } } catch {}
  return out;
}

export type AutosaveState = { at: string | null; error: string | null; saving: boolean };
/**
 * Autoguardado como el de Blender: 4 s después del último cambio, cada 2 min mientras siga sin guardar,
 * y al cerrar u ocultar la pestaña (sendBeacon). Si el disco no responde queda un espejo en este navegador.
 */
export function useHistoriaAutosave(snapshot: () => HistoriaFile | null, dirty: boolean, signature: unknown) {
  const [state, setState] = useState<AutosaveState>({ at: null, error: null, saving: false });
  const last = useRef('');
  const snap = useRef(snapshot), dirtyRef = useRef(dirty), again = useRef<() => void>(() => {});
  useEffect(() => { snap.current = snapshot; dirtyRef.current = dirty; });
  const run = useCallback(async () => {
    const h = snap.current(); if (!h || !dirtyRef.current) return;
    const key = JSON.stringify(h.project) + h.name; if (key === last.current) return;
    setState(s => ({ ...s, saving: true }));
    try { const r = await historias.autosave(h); last.current = key; clearMirror(h.id); setState({ at: r.autosaveAt, error: null, saving: false }); }
    catch (error) {
      const status = (error as { status?: number }).status;
      // 409: otro guardado de esta historia está escribiendo ahora mismo; no es un fallo de disco. Se reintenta en unos segundos.
      if (status === 409) { setState(s => ({ ...s, saving: false })); window.setTimeout(() => again.current(), 5000); return; }
      // 410: la historia se eliminó desde el menú; no se escribe espejo (la recrearía en la lista de recuperación).
      if (status === 410) { setState({ at: null, error: error instanceof Error ? error.message : 'Esta historia ya no existe.', saving: false }); return; }
      try { localStorage.setItem(mirrorKey(h.id), JSON.stringify({ ...h, savedAt: new Date().toISOString() })); } catch {}
      setState({ at: null, error: error instanceof Error ? error.message : 'Sin conexión con el disco', saving: false });
    }
  }, []);
  useEffect(() => { again.current = () => void run(); }, [run]);
  // Tras cada cambio.
  useEffect(() => { if (!dirty) { last.current = ''; return; } const t = window.setTimeout(() => void run(), 4000); return () => window.clearTimeout(t); }, [dirty, signature, run]);
  // Red de seguridad periódica.
  useEffect(() => { const t = window.setInterval(() => void run(), 120000); return () => window.clearInterval(t); }, [run]);
  // Al cerrar, recargar u ocultar la pestaña.
  useEffect(() => {
    const flush = () => {
      const h = snap.current(); if (!h || !dirtyRef.current) return;
      const body = JSON.stringify({ accion: 'autoguardar', historia: h });
      // sendBeacon/keepalive admiten unos 64 KB en total (bytes, no caracteres). Una historia mayor solo llega al disco
      // si la pestaña sigue viva (al ocultarse); al cerrar queda además el espejo de este navegador.
      const blob = new Blob([body], { type: 'application/json' }), small = blob.size < 60000;
      const sent = small && navigator.sendBeacon?.(API, blob);
      if (!sent) { void fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: small }).catch(() => {}); try { localStorage.setItem(mirrorKey(h.id), JSON.stringify({ ...h, savedAt: new Date().toISOString() })); } catch {} }
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  return { ...state, now: run, reset: () => { last.current = ''; setState({ at: null, error: null, saving: false }); } };
}

/** Borradores del Estudio anterior (antes de las historias) guardados en este navegador. */
export function legacyDrafts(): { key: string; project: StudioProject }[] {
  const out: { key: string; project: StudioProject }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('spanstories.story-studio.v1:') || localStorage.getItem('spanstories.historia.importado:' + key)) continue;
      try { const record = JSON.parse(localStorage.getItem(key)!); if (record?.draft?.scenes?.length) out.push({ key, project: record.draft }); } catch {}
    }
  } catch {}
  return out;
}
export function markLegacyImported(key: string) { try { localStorage.setItem('spanstories.historia.importado:' + key, new Date().toISOString()); } catch {} }
export type { StudioSource };
