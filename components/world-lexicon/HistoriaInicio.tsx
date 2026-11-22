"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildStudioRehearsal } from "@/features/story-studio/demo";
import { historiaFromDraft, newHistoria, type HistoriaFile, type HistoriaSummary, type Plantilla } from "@/features/story-studio/historia";
import { clearMirror, historias, legacyDrafts, listMirrors, markLegacyImported } from "@/features/story-studio/historias-client";
import type { StudioSource } from "@/features/story-studio/model";
import styles from "./historia-inicio.module.css";

/** Lo que se abre: el contenido a cargar y el último guardado en disco (para saber si hay cambios y su revisión). */
export type HistoriaAbierta = { file: HistoriaFile; saved: HistoriaFile | null; recovered: boolean };
type Zone = { id: string; label: string; group: string };

const plantillas: { id: Plantilla; label: string; hint: string }[] = [
  { id: "vacia", label: "Vacía", hint: "Una escena y una frase, sin escenario cargado" },
];

function ago(iso: string | null) {
  if (!iso) return "sin guardar";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.round(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
const time = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function hue(text: string) { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/**
 * Menú de inicio del Estudio: fondo blanco y un cuadrado por historia. Nada del escenario se carga hasta entrar en una.
 * Si `autoOpen` trae un id (por ejemplo, al recargar con ?h=), se entra directo salvo que haya algo que recuperar.
 */
export function HistoriaInicio({ onOpen, sources = [], autoOpen = null, embedded = false }: { onOpen: (h: HistoriaAbierta) => void; sources?: StudioSource[]; autoOpen?: string | null; embedded?: boolean }) {
  const [items, setItems] = useState<HistoriaSummary[] | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", plantilla: "vacia" as Plantilla, zoneId: "" });
  const [menu, setMenu] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ id: string; saved: HistoriaFile | null; auto: HistoriaFile; mirror: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HistoriaSummary | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [legacy, setLegacy] = useState<ReturnType<typeof legacyDrafts>>([]);
  const autoTried = useRef(false);

  const catalog = useMemo(() => [buildStudioRehearsal("barcelona").source, buildStudioRehearsal("airport").source, ...sources], [sources]);
  const zoneLabel = useCallback((id: string) => !id ? "Sin escenario" : zones.find(z => z.id === id)?.label ?? id.replace(/^atlas-/, "").replace(/-/g, " "), [zones]);

  const refresh = useCallback(async () => {
    try { const r = await historias.list(); setLegacy(legacyDrafts()); setItems(r.historias); setUltima(r.ultima); setError(r.damaged.length ? `No se pudieron leer: ${r.damaged.join(", ")} (siguen en disco, sin tocar).` : ""); }
    catch (e) { setItems([]); setError(e instanceof Error ? e.message : "No se pudieron leer las historias."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    fetch("/api/generated-places", { cache: "no-store" }).then(r => r.json()).then(r => {
      const list: Zone[] = [...(Array.isArray(r.zones) ? r.zones : []), ...(Array.isArray(r.places) ? r.places.map((p: { id: string; label: string }) => ({ id: p.id, label: p.label, group: "Generador de mundos" })) : [])];
      setZones(list.filter(z => typeof z.id === "string" && !z.id.startsWith("servicio")));
    }).catch(() => {});
  }, []);

  const open = useCallback(async (id: string, opts: { copia?: number; prefer?: "auto" | "saved" } = {}) => {
    setBusy(id); setMenu(null);
    try {
      if (opts.copia) {
        const [{ historia: copy }, { historia: saved }] = await Promise.all([historias.copy(id, opts.copia), historias.open(id)]);
        if (!copy) throw Error("Esa copia ya no existe.");
        await historias.touch(id);
        onOpen({ file: { ...copy, revision: saved?.revision ?? copy.revision, project: { ...copy.project, revision: saved?.revision ?? copy.revision } }, saved, recovered: true });
        return;
      }
      const r = await historias.open(id), mirror = listMirrors().find(m => m.id === id) ?? null;
      // El espejo del navegador solo cuenta si es más nuevo que lo que hay en disco.
      const newest = [r.autoguardado, mirror].filter((h): h is HistoriaFile => !!h).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] ?? null;
      const pending = newest && (!r.historia || Date.parse(newest.savedAt) > Date.parse(r.historia.savedAt)) && (!r.historia || JSON.stringify(newest.project) !== JSON.stringify(r.historia.project)) ? newest : null;
      if (pending && !opts.prefer) { setRecovery({ id, saved: r.historia, auto: pending, mirror: pending === mirror && pending !== r.autoguardado }); return; }
      await historias.touch(id);
      if (opts.prefer === "auto" && pending) {
        const revision = r.historia?.revision ?? 0;
        onOpen({ file: { ...pending, revision, project: { ...pending.project, revision } }, saved: r.historia, recovered: true });
      } else {
        if (!r.historia) throw Error("Esta historia solo tiene autoguardado: recupéralo.");
        onOpen({ file: r.historia, saved: r.historia, recovered: false });
      }
      if (opts.prefer === "auto" || !pending) clearMirror(id);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la historia."); }
    finally { setBusy(null); }
  }, [onOpen]);

  useEffect(() => { if (autoOpen && !autoTried.current) { autoTried.current = true; void open(autoOpen); } }, [autoOpen, open]);

  async function create() {
    setBusy("nueva");
    try {
      const file = newHistoria({ name: draft.name || "Historia sin título", plantilla: draft.plantilla, zoneId: draft.zoneId });
      const { historia } = await historias.create(file);
      onOpen({ file: historia, saved: historia, recovered: false });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo crear la historia."); setBusy(null); }
  }
  async function importLegacy(key: string, project: (typeof legacy)[number]["project"]) {
    try {
      const source = catalog.find(s => s.storyVersionId === project.storyVersionId);
      if (!source) throw Error(`No se encuentra la Story de «${project.name}» en este navegador.`);
      const { historia } = await historias.create(historiaFromDraft(project, source));
      markLegacyImported(key); setLegacy(legacyDrafts()); await refresh();
      onOpen({ file: historia, saved: historia, recovered: false });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo importar el borrador."); }
  }
  async function act(fn: () => Promise<unknown>) { setMenu(null); try { await fn(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar."); } }

  const shown = (items ?? []).filter(h => !filter || (h.name + " " + zoneLabel(h.zoneId)).toLowerCase().includes(filter.toLowerCase()));
  const last = items?.find(h => h.id === ultima) ?? null;

  return <div className={styles.page + (embedded ? " " + styles.embedded : "")} onClick={() => setMenu(null)}>
    <header className={styles.top}>
      <div className={styles.brand}><span className={styles.logo} aria-hidden="true" /><div><strong>SpanStories</strong><span>Estudio</span></div></div>
      {(items?.length ?? 0) > 4 && <input className={styles.search} type="search" placeholder="Buscar historia…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Buscar historia" />}
    </header>
    <main className={styles.main}>
      <h1>Tus historias</h1>
      {last && <p className={styles.lead}>Última: <button type="button" className={styles.link} onClick={() => void open(last.id)}>{last.name}</button> · {zoneLabel(last.zoneId)} · {ago(last.autosaveAt ?? last.savedAt)}</p>}
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setError("")}>Cerrar</button></p>}
      <ul className={styles.grid} aria-busy={items === null}>
        <li><button type="button" className={styles.card + " " + styles.newCard} onClick={() => { setDraft(d => ({ ...d, name: "" })); setCreating(true); }}>
          <span className={styles.plus} aria-hidden="true">+</span><span className={styles.cardTitle}>Nueva historia</span>
        </button></li>
        {items === null && [0, 1, 2].map(i => <li key={i}><div className={styles.card + " " + styles.skeleton} /></li>)}
        {shown.map(h => <li key={h.id} className={styles.cell}>
          <button type="button" className={styles.card} onClick={() => void open(h.id)} disabled={!!busy} aria-label={`Abrir ${h.name}`}>
            <span className={styles.thumb} style={{ "--h": hue(h.zoneId) } as React.CSSProperties}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v13H3V6Zm0 4h18M7 6l3 4m3-4 3 4" /></svg>
              {h.id === ultima && <span className={styles.badge}>Última</span>}
              {h.recuperable && <span className={styles.badge + " " + styles.warn}>Cambios sin guardar</span>}
            </span>
            <span className={styles.cardTitle}>{h.name}</span>
            <span className={styles.meta}>{zoneLabel(h.zoneId)}</span>
            <span className={styles.meta}>{h.scenes} {h.scenes === 1 ? "escena" : "escenas"} · {h.moments} momentos · {ago(h.autosaveAt ?? h.savedAt)}</span>
            {busy === h.id && <span className={styles.loading}>Abriendo…</span>}
          </button>
          <button type="button" className={styles.more} aria-label={`Más opciones de ${h.name}`} aria-expanded={menu === h.id} onClick={e => { e.stopPropagation(); setMenu(menu === h.id ? null : h.id); }}>⋯</button>
          {menu === h.id && <div className={styles.menu} role="menu" onClick={e => e.stopPropagation()}>
            <button role="menuitem" onClick={() => void open(h.id)}>Abrir</button>
            <button role="menuitem" onClick={() => { setMenu(null); setRenaming({ id: h.id, name: h.name }); }}>Renombrar…</button>
            <button role="menuitem" onClick={() => void act(() => historias.duplicate(h.id))}>Duplicar</button>
            <button role="menuitem" onClick={() => void open(h.id, { copia: 1 })}>Abrir guardado anterior</button>
            <hr />
            <button role="menuitem" className={styles.danger} onClick={() => { setMenu(null); setConfirmDelete(h); }}>Eliminar…</button>
          </div>}
        </li>)}
      </ul>
      {items !== null && !items.length && <p className={styles.empty}>Todavía no hay historias. Crea la primera: todo lo que hagas en ella se guardará en su carpeta.</p>}
      {legacy.length > 0 && <section className={styles.legacy}>
        <h2>Borradores anteriores de este navegador</h2>
        <p>Se guardaron con el Estudio antiguo. Conviértelos en historias para no perderlos.</p>
        <ul>{legacy.map(l => <li key={l.key}><span>{l.project.name} · {l.project.scenes.length} escenas</span><button type="button" onClick={() => void importLegacy(l.key, l.project)}>Convertir en historia</button></li>)}</ul>
      </section>}
      <p className={styles.foot}>Las historias se guardan en <code>Estudio/Historias</code>. Hay autoguardado mientras trabajas.</p>
    </main>

    {creating && <div className={styles.backdrop} onClick={() => setCreating(false)}>
      <form className={styles.dialog} onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void create(); }} aria-label="Nueva historia">
        <h2>Nueva historia</h2>
        <label>Nombre<input autoFocus value={draft.name} maxLength={120} placeholder="Historia sin título" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <fieldset><legend>Empezar desde</legend>
          {plantillas.map(p => <label key={p.id} className={styles.option}><input type="radio" name="plantilla" checked={draft.plantilla === p.id} onChange={() => setDraft({ ...draft, plantilla: p.id, zoneId: p.id === "aeropuerto" ? "aeropuerto-entrada" : p.id === "barcelona" ? "barcelona-passeig-gracia" : "" })} /><span><strong>{p.label}</strong><small>{p.hint}</small></span></label>)}
        </fieldset>
        <label>Escenario inicial<select value={draft.zoneId} onChange={e => setDraft({ ...draft, zoneId: e.target.value })}>
          {draft.plantilla === "vacia" && <option value="">Sin escenario · lo eliges después</option>}
          {!!draft.zoneId && !zones.some(z => z.id === draft.zoneId) && <option value={draft.zoneId}>{zoneLabel(draft.zoneId)}</option>}
          {[...new Set(zones.map(z => z.group))].map(g => <optgroup key={g} label={g}>{zones.filter(z => z.group === g).map(z => <option key={z.id} value={z.id}>{z.label}</option>)}</optgroup>)}
        </select></label>
        <div className={styles.actions}><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className={styles.primary} disabled={busy === "nueva"}>{busy === "nueva" ? "Creando…" : "Crear historia"}</button></div>
      </form>
    </div>}

    {recovery && <div className={styles.backdrop}>
      <div className={styles.dialog} role="alertdialog" aria-label="Recuperar historia">
        <h2>Hay cambios sin guardar</h2>
        <p>{recovery.mirror ? "Este navegador conserva" : "El autoguardado conserva"} una versión del <strong>{time(recovery.auto.savedAt)}</strong>, más reciente que {recovery.saved ? <>el último guardado ({time(recovery.saved.savedAt)})</> : "cualquier guardado"}.</p>
        <div className={styles.actions + " " + styles.stack}>
          <button type="button" className={styles.primary} onClick={() => { const id = recovery.id; setRecovery(null); void open(id, { prefer: "auto" }); }}>Recuperar los cambios</button>
          {recovery.saved && <button type="button" onClick={() => { const id = recovery.id; setRecovery(null); void open(id, { prefer: "saved" }); }}>Abrir el último guardado</button>}
          <button type="button" onClick={() => setRecovery(null)}>Volver</button>
        </div>
        {recovery.saved && <p className={styles.note}>Abrir el último guardado no borra el autoguardado hasta que vuelvas a guardar.</p>}
      </div>
    </div>}

    {confirmDelete && <div className={styles.backdrop} onClick={() => setConfirmDelete(null)}>
      <div className={styles.dialog} role="alertdialog" aria-label="Eliminar historia" onClick={e => e.stopPropagation()}>
        <h2>¿Eliminar «{confirmDelete.name}»?</h2>
        <p>Se moverá a <code>Estudio/Historias/_papelera</code>. Desde allí se puede recuperar.</p>
        <div className={styles.actions}><button type="button" onClick={() => setConfirmDelete(null)}>Cancelar</button><button type="button" className={styles.dangerButton} onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); void act(() => historias.remove(id)); }}>Eliminar</button></div>
      </div>
    </div>}

    {renaming && <div className={styles.backdrop} onClick={() => setRenaming(null)}>
      <form className={styles.dialog} onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); const r = renaming; setRenaming(null); void act(() => historias.rename(r.id, r.name)); }} aria-label="Renombrar historia">
        <h2>Renombrar historia</h2>
        <label>Nombre<input autoFocus value={renaming.name} maxLength={120} onChange={e => setRenaming({ ...renaming, name: e.target.value })} /></label>
        <div className={styles.actions}><button type="button" onClick={() => setRenaming(null)}>Cancelar</button><button type="submit" className={styles.primary} disabled={!renaming.name.trim()}>Renombrar</button></div>
      </form>
    </div>}
  </div>;
}
