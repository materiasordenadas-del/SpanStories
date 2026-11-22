// Retimer con marcadores (reimplementación de «Markers Retimer» del add-on Herramientas, MIT).
// Marcadores en la línea de tiempo; al mover uno, el tiempo entre sus vecinos se estira o se encoge
// (deformación lineal por tramos y siempre creciente: nunca invierte el orden). Afecta a las claves de las capas
// y a las tiras (la animación de base, mocap incluida) mediante strip.timeMap.
import { uid } from '../animation.js';

/** Mapa lineal por tramos de `from` a `to` (mismas longitudes, crecientes). Fuera de los extremos, desplazamiento constante. */
export function warpFn(from, to) {
  return (f) => {
    const n = from.length;
    if (n === 0) return f;
    if (f <= from[0]) return f + (to[0] - from[0]);
    if (f >= from[n - 1]) return f + (to[n - 1] - from[n - 1]);
    let i = 1;
    while (from[i] < f) i++;
    const u = (f - from[i - 1]) / (from[i] - from[i - 1] || 1);
    return to[i - 1] + u * (to[i] - to[i - 1]);
  };
}

/** Interpola los nudos [[x, y], …] (crecientes en x) con pendiente 1 fuera de ellos. */
export function knotsAt(k, x) {
  if (!k?.length) return x;
  if (x <= k[0][0]) return k[0][1] + (x - k[0][0]);
  const n = k.length;
  if (x >= k[n - 1][0]) return k[n - 1][1] + (x - k[n - 1][0]);
  let i = 1;
  while (k[i][0] < x) i++;
  const u = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1);
  return k[i - 1][1] + u * (k[i][1] - k[i - 1][1]);
}

export function addMarker(doc, f, name = '') {
  doc.markers ||= [];
  const fr = Math.round(f);
  if (doc.markers.some((m) => m.f === fr)) return null;
  const m = { id: uid('mk'), f: fr, name: name || `M${doc.markers.length + 1}` };
  doc.markers.push(m);
  doc.markers.sort((a, b) => a.f - b.f);
  return m;
}

export function removeMarker(doc, id) {
  const n = (doc.markers || []).length;
  doc.markers = (doc.markers || []).filter((m) => m.id !== id);
  return n !== doc.markers.length;
}

/** Hasta dónde puede ir un marcador sin cruzar a sus vecinos (ni los extremos del rango). */
export function markerLimits(engine, id) {
  const doc = engine.doc;
  const [r0, r1] = engine.range();
  const list = [...(doc.markers || [])].sort((a, b) => a.f - b.f);
  const i = list.findIndex((m) => m.id === id);
  const lo = i > 0 ? list[i - 1].f + 1 : r0 + 1;
  const hi = i < list.length - 1 ? list[i + 1].f - 1 : r1 - 1;
  return [lo, hi];
}

/**
 * Mueve el marcador `id` a `to` y reparte el tiempo: entre el vecino anterior y el marcador se estira o encoge,
 * y lo mismo entre el marcador y el siguiente. Los extremos del rango (o los vecinos) quedan fijos.
 * scope: 'all' (todas las capas) | 'active'. strips: también la animación de base.
 * Devuelve { moved } o null si no hay nada que hacer.
 */
export function retimeMarker(engine, id, to, { scope = 'all', strips = true } = {}) {
  const doc = engine.doc;
  const m = (doc.markers || []).find((x) => x.id === id);
  if (!m) return null;
  const [lo, hi] = markerLimits(engine, id);
  to = Math.round(Math.min(hi, Math.max(lo, to)));
  if (to === m.f) return null;
  const [r0, r1] = engine.range();
  const anchors = [r0, ...doc.markers.map((x) => x.f), r1];
  const from = [...new Set(anchors)].sort((a, b) => a - b);
  const dest = from.map((f) => (f === m.f ? to : f));
  const w = warpFn(from, dest);
  // rango fijo mientras se reparte (si era automático, lo que duran las tiras no debe cambiar los anclajes)
  if (doc.rangeMode === 'auto') {
    doc.rangeMode = 'manual';
    doc.start = r0;
    doc.end = r1;
  }
  let moved = 0;
  const layers = scope === 'active' ? [engine.layer()] : doc.layers;
  for (const l of layers) {
    if (l.lock) continue;
    for (const [tid, keys] of Object.entries(l.tracks)) {
      const out = [];
      for (const k of keys) {
        const nf = Math.round(w(k.f));
        if (nf !== k.f) moved++;
        const last = out[out.length - 1];
        const nk = { ...k, f: nf };
        if (last && last.f === nf) out[out.length - 1] = nk; // dos claves en el mismo fotograma: se queda la última
        else out.push(nk);
      }
      l.tracks[tid] = out;
    }
  }
  if (strips) for (const s of doc.strips) retimeStrip(s, w, from, dest);
  for (const t of doc.temp || []) {
    t.a = Math.round(w(t.a));
    t.b = Math.round(w(t.b));
    for (const ks of Object.values(t.tracks || {})) for (const k of ks) k.f = Math.round(w(k.f));
  }
  m.f = to;
  doc.markers.sort((a, b) => a.f - b.f);
  return { moved, to };
}

/** Deforma el tiempo de una tira: nudos [[fotograma nuevo relativo al inicio, fotograma original del clip]]. */
export function retimeStrip(s, w, from = [], to = []) {
  const len = Math.max(1, s.len);
  const end = s.start + len - 1;
  const k0 = s.timeMap?.k?.length ? s.timeMap.k.map(([x, y]) => [x + s.start, y]) : [[s.start, 0], [end, len - 1]];
  const len0 = s.timeMap?.len0 ?? len;
  const ns = Math.round(w(s.start));
  const ne = Math.round(w(end));
  // nudos: los anteriores llevados al nuevo tiempo, más uno en cada anclaje (marcador) que cae dentro de la tira
  const k = k0.map(([x, y]) => [w(x), y]);
  from.forEach((x, j) => {
    if (x > s.start && x < end) k.push([to[j], knotsAt(k0, x)]);
  });
  k.sort((a, b) => a[0] - b[0]);
  const dedup = [];
  for (const p of k) if (!dedup.length || p[0] > dedup[dedup.length - 1][0] + 1e-6) dedup.push(p);
  s.start = ns;
  s.len = Math.max(1, ne - ns + 1);
  s.timeMap = { k: dedup.map(([x, y]) => [+(x - ns).toFixed(4), +y.toFixed(4)]), len0 };
  // si quedó la identidad, se quita
  const id = s.timeMap.k.every(([x, y]) => Math.abs(x - y) < 1e-3) && s.len === len0;
  if (id) delete s.timeMap;
}
