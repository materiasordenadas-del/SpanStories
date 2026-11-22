// Inventario de la historia: qué objetos del escenario usa la historia (por el vocabulario que enseñan sus escenas) y
// qué personajes y cámaras aparecen. Lee las historias guardadas en disco (/api/historias); no modifica nada.
export const HISTORIAS_API = 'http://localhost:3000/api/historias';

/** Objetos del escenario que cubre un selector del vocabulario ({objectIds}|{collection}|{registryKind}|{name}). Función pura. */
export function resolverSelector(selector, lista) {
  const norm = s => String(s ?? '').toLowerCase();
  if (Array.isArray(selector.objectIds)) return lista.filter(o => selector.objectIds.includes(o.id));
  if (selector.collection) { const c = norm(selector.collection); return lista.filter(o => norm(o.id) === c || norm(o.etiqueta) === c || norm(o.id).startsWith(c + ':') || norm(o.sector) === c); }
  if (selector.registryKind) { const k = norm(selector.registryKind); return lista.filter(o => norm(o.tipo) === k || norm(o.tipo).includes(k)); }
  if (selector.name) { const n = norm(selector.name); return lista.filter(o => norm(o.etiqueta).includes(n)); }
  return [];
}

/**
 * Entradas del inventario a partir de: la lista de objetos del editor, el vocabulario de la zona y las historias.
 * Cada entrada de vocabulario usada por una escena → { palabra, escenas:[{historia, escena}], objetos:[{id, etiqueta, estado}], faltan: boolean }.
 */
export function construirInventario({ zonaId, lista, vocabulario, historias, ocultos = new Set() }) {
  const porEntrada = new Map(), personajes = new Map(), camaras = [];
  const entradas = new Map((vocabulario?.entries ?? []).map(e => [e.id, e]));
  for (const h of historias) for (const escena of h.project?.scenes ?? []) {
    if (escena.zoneId !== zonaId) continue;
    for (const id of escena.entryIds ?? []) {
      if (!porEntrada.has(id)) porEntrada.set(id, []);
      porEntrada.get(id).push({ historia: h.name ?? h.id, escena: escena.name });
    }
    for (const a of escena.actors ?? []) { if (!personajes.has(a.id + a.name)) personajes.set(a.id + a.name, { nombre: a.name, caracter: a.characterId, escenas: [] }); personajes.get(a.id + a.name).escenas.push({ historia: h.name ?? h.id, escena: escena.name }); }
    const nCam = (escena.cameras?.length ?? 0) + (escena.shot ? 1 : 0); if (nCam) camaras.push({ historia: h.name ?? h.id, escena: escena.name, cantidad: nCam });
  }
  const palabras = [...porEntrada].map(([id, escenas]) => {
    const e = entradas.get(id), encontrados = new Map();
    for (const s of e?.selectors ?? []) for (const o of resolverSelector(s, lista)) encontrados.set(o.id, o);
    const objetos = [...encontrados.values()].map(o => ({ id: o.id, etiqueta: o.etiqueta, estado: ocultos.has(o.id) ? 'oculto' : 'presente' }));
    return { id, palabra: e?.speech?.text ?? id, escenas, objetos, faltan: !objetos.length };
  }).sort((a, b) => a.palabra.localeCompare(b.palabra, 'es'));
  return { palabras, personajes: [...personajes.values()], camaras };
}

export async function cargarHistorias({ fetchFn = fetch } = {}) {
  const r = await fetchFn(HISTORIAS_API, { cache: 'no-store' }); if (!r.ok) throw new Error('No se pudieron listar las historias (HTTP ' + r.status + ').');
  const lista = await r.json(), items = (Array.isArray(lista) ? lista : Object.values(lista).find(v => Array.isArray(v) && v.every(x => x && typeof x.id === 'string')) ?? []).slice(0, 40);
  const historias = [];
  for (const item of items) {
    try {
      const d = await (await fetchFn(HISTORIAS_API + '?id=' + encodeURIComponent(item.id), { cache: 'no-store' })).json();
      const h = d.historia ?? d.autoguardado; if (h?.project) historias.push(h);
    } catch { /* una historia ilegible no impide ver las demás */ }
  }
  return historias;
}
