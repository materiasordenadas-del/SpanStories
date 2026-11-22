// Operaciones sobre grupos de claves (reimplementación de «Keyframe Offset» y «Share Keyframes» del add-on
// Herramientas, MIT). Trabajan sobre la capa activa y no tocan las tiras (la animación de base).
import * as THREE from 'three';
import { sampleTrack, trackKind } from '../animation.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Pistas de un hueso o cadena en una capa (r:/t:/s: del hueso, ik:<cadena>:…). */
export function tracksOfBone(layer, bone) {
  return Object.keys(layer.tracks).filter((id) => /^[rts]:/.test(id) && id.slice(2) === bone.name);
}
export function tracksOfChain(layer, chain) {
  return Object.keys(layer.tracks).filter((id) => id.startsWith(`ik:${chain}:`));
}

/** Instantánea de las pistas (para que el deslizador interactivo parta siempre del mismo estado). */
export function snapshotTracks(layer, ids) {
  return Object.fromEntries(ids.filter((id) => layer.tracks[id]).map((id) => [id, clone(layer.tracks[id])]));
}

/**
 * Desfase en cascada: el grupo i se desplaza round(n·i) fotogramas (i = 1, 2, 3… en el orden dado; con
 * `first` también el primero se mueve n). Sirve para el solapamiento (overlap): cadera → columna → cabeza…
 * groups: [[ids de pistas], …]; snap: snapshotTracks() del estado inicial. selected: Set de «id|f» para mover
 * solo esas claves (las demás se quedan).
 */
export function offsetCascade(layer, groups, n, snap, { first = false, selected = null } = {}) {
  let moved = 0;
  groups.forEach((ids, gi) => {
    const d = Math.round(n * (gi + (first ? 1 : 0)));
    for (const id of ids) {
      if (!snap[id]) continue;
      const keys = clone(snap[id]);
      for (const k of keys) {
        if (selected && !selected.has(`${id}|${k.f}`)) continue;
        k.f += d;
        if (d) moved++;
      }
      // si dos claves caen en el mismo fotograma, gana la que se movió (la del grupo)
      keys.sort((a, b) => a.f - b.f);
      const out = [];
      for (const k of keys) {
        const last = out[out.length - 1];
        if (last && last.f === k.f) out[out.length - 1] = k;
        else out.push(k);
      }
      layer.tracks[id] = out;
    }
  });
  return moved;
}

/**
 * Compartir claves: todas las pistas dadas acaban con clave en la unión de sus fotogramas.
 * La clave nueva toma el valor exacto que la curva tenía en ese fotograma y la interpolación de su tramo.
 * onlyFrames: limitar a esos fotogramas (p. ej. las claves elegidas en la línea de tiempo).
 */
export function shareKeys(layer, ids, { onlyFrames = null } = {}) {
  const frames = new Set();
  for (const id of ids) for (const k of layer.tracks[id] || []) if (!onlyFrames || onlyFrames.has(k.f)) frames.add(k.f);
  let added = 0;
  for (const id of ids) {
    const keys = layer.tracks[id];
    if (!keys?.length) continue;
    const have = new Set(keys.map((k) => k.f));
    const add = [];
    for (const f of [...frames].sort((x, y) => x - y)) {
      if (have.has(f)) continue;
      insertKeyExact(keys, f, trackKind(id) === 'quat');
      add.push(f);
    }
    added += add.length;
  }
  return { added, frames: frames.size };
}

// ---------- Multikey (reimplementación de «Multikey» del add-on Herramientas, MIT) ----------
// Edita a la vez muchas claves elegidas: «escalar» las acerca o aleja de su valor neutro (desplazamientos y capas
// aditivas: el cero / la identidad; valores absolutos: la media de las elegidas) y «variar» les suma un ruido
// repetible (misma semilla → mismo resultado), proporcional a lo que ya varían.

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** ¿Es un desplazamiento (neutro = 0 / identidad) o un valor absoluto? */
function isOffsetTrack(layer, id) {
  if (/^ik:[^:]+:(pos|rot|pole)$/.test(id)) return true;
  if (/^ik:/.test(id)) return false; // abs, absq, absw, w: absolutos
  return layer.mode === 'add' && !id.startsWith('s:');
}

function powQuat(q, s, out) {
  out.copy(q);
  if (out.w < 0) out.set(-out.x, -out.y, -out.z, -out.w);
  const ang = 2 * Math.acos(Math.min(1, out.w));
  if (ang < 1e-9) return out.identity();
  const sn = Math.sin(ang / 2);
  const ax = new THREE.Vector3(out.x / sn, out.y / sn, out.z / sn);
  return out.setFromAxisAngle(ax, ang * s);
}

// ---------- Insertar una clave sin cambiar la curva ----------
// Cada interpolación es una Bézier cúbica de tiempo; partirla por de Casteljau deja dos tramos que recorren exactamente
// lo mismo (los giros se interpolan por la misma geodésica). Así «Compartir claves» no cambia el movimiento.
const BEZ = { linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3], smooth: [1 / 3, 0, 2 / 3, 1], in: [1 / 3, 0, 2 / 3, 1 / 3], out: [1 / 3, 2 / 3, 2 / 3, 1] };

function bezierOfKey(k0, quat) {
  const m = k0.i || 'smooth';
  if (k0.bc) return null; // tangentes por canal: no se parte (se inserta con su valor exacto)
  if (m === 'bezier') return k0.b || [0.42, 0, 0.58, 1];
  if (m === 'auto') return quat ? [1 / 3, 1 / 6, 2 / 3, 5 / 6] : null; // vectores «auto»: Hermite con vecinos
  return BEZ[m] || null;
}

/** Inserta en keys una clave en f con el valor exacto de la curva y, si se puede, sin cambiar su forma. */
export function insertKeyExact(keys, f, quat) {
  const out = quat ? new THREE.Quaternion() : new THREE.Vector3();
  sampleTrack(keys, f, out);
  const v = out.toArray().slice(0, keys[0].v.length).map((x) => +(+x).toFixed(6));
  const i = keys.findIndex((k) => k.f > f);
  const k0 = i > 0 ? keys[i - 1] : null;
  const k1 = i > 0 ? keys[i] : null;
  const nk = { f, v, i: (k0 || keys[keys.length - 1]).i || 'smooth' };
  const b = k0 && bezierOfKey(k0, quat);
  if (k0 && k1 && b && k0.i !== 'step') {
    const us = (f - k0.f) / (k1.f - k0.f);
    // t tal que x(t) = us (x creciente)
    const X = (t) => 3 * (1 - t) * (1 - t) * t * b[0] + 3 * (1 - t) * t * t * b[2] + t * t * t;
    let lo = 0;
    let hi = 1;
    for (let n = 0; n < 50; n++) {
      const m = (lo + hi) / 2;
      if (X(m) < us) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    const L = (a, c) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
    const P0 = [0, 0];
    const P1 = [b[0], b[1]];
    const P2 = [b[2], b[3]];
    const P3 = [1, 1];
    const P01 = L(P0, P1);
    const P12 = L(P1, P2);
    const P23 = L(P2, P3);
    const P012 = L(P01, P12);
    const P123 = L(P12, P23);
    const Pm = L(P012, P123);
    const [xm, ym] = Pm;
    const r = (x) => +x.toFixed(5);
    const left = Math.abs(ym) > 1e-9 ? [P01[0] / xm, P01[1] / ym, P012[0] / xm, P012[1] / ym].map(r) : null;
    const right = Math.abs(1 - ym) > 1e-9 ? [(P123[0] - xm) / (1 - xm), (P123[1] - ym) / (1 - ym), (P23[0] - xm) / (1 - xm), (P23[1] - ym) / (1 - ym)].map(r) : null;
    delete k0.bc;
    if (left) Object.assign(k0, { i: 'bezier', b: left });
    else Object.assign(k0, { i: 'linear' }), delete k0.b;
    if (right) Object.assign(nk, { i: 'bezier', b: right });
    else nk.i = 'linear';
  } else if (k0?.b) nk.b = k0.b.slice();
  keys.push(nk);
  keys.sort((a, c) => a.f - c.f);
  return nk;
}

/** Agrupa una selección «capa|pista|f» (de la línea de tiempo) o una lista [{ id, f }] por pista. */
export function groupKeys(layer, sel) {
  const by = new Map();
  for (const s of sel) {
    let id;
    let f;
    if (typeof s === 'string') {
      const parts = s.split('|');
      if (parts.length < 3 || parts[0] !== layer.id) continue;
      f = +parts[parts.length - 1];
      id = parts.slice(1, -1).join('|');
    } else ({ id, f } = s);
    if (!layer.tracks[id]?.some((k) => k.f === f)) continue;
    (by.get(id) || by.set(id, new Set()).get(id)).add(f);
  }
  return by;
}

function meanOf(keys, quat) {
  if (quat) {
    const acc = [0, 0, 0, 0];
    const ref = keys[0].v;
    for (const k of keys) {
      const s = k.v[0] * ref[0] + k.v[1] * ref[1] + k.v[2] * ref[2] + k.v[3] * ref[3] < 0 ? -1 : 1;
      for (let c = 0; c < 4; c++) acc[c] += s * k.v[c];
    }
    return new THREE.Quaternion(...acc).normalize();
  }
  const n = keys[0].v.length;
  const m = new Array(n).fill(0);
  for (const k of keys) for (let c = 0; c < n; c++) m[c] += k.v[c] / keys.length;
  return m;
}

/** Escala las claves elegidas (factor 1 = sin cambio, 0 = al neutro/media, 2 = el doble). snap: snapshotTracks. */
export function multikeyScale(layer, groups, factor, snap) {
  let n = 0;
  for (const [id, fs] of groups) {
    if (!snap[id]) continue;
    const keys = clone(snap[id]);
    const sel = keys.filter((k) => fs.has(k.f));
    if (!sel.length) continue;
    const quat = trackKind(id) === 'quat';
    const offset = isOffsetTrack(layer, id);
    const center = offset ? (quat ? new THREE.Quaternion() : new Array(sel[0].v.length).fill(0)) : meanOf(sel, quat);
    for (const k of sel) {
      if (quat) {
        _qa.fromArray(k.v);
        const d = center.clone().invert().multiply(_qa);
        powQuat(d, factor, _qb);
        k.v = center.clone().multiply(_qb).normalize().toArray().map((x) => +x.toFixed(6));
      } else k.v = k.v.map((x, c) => +(center[c] + (x - center[c]) * factor).toFixed(6));
      n++;
    }
    layer.tracks[id] = keys;
  }
  return n;
}

/** Ruido repetible en las claves elegidas: amount 0…1 de lo que ya varían (o de 15° / 5 cm si solo hay una). */
export function multikeyRandom(layer, groups, amount, snap, { seed = 1, hips = 1 } = {}) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1;
  let n = 0;
  for (const [id, fs] of groups) {
    if (!snap[id]) continue;
    const keys = clone(snap[id]);
    const sel = keys.filter((k) => fs.has(k.f));
    if (!sel.length) continue;
    if (trackKind(id) === 'quat') {
      const m = meanOf(sel, true);
      let spread = 0;
      for (const k of sel) spread = Math.max(spread, m.angleTo(_qa.fromArray(k.v)));
      if (spread < 1e-4) spread = (15 * Math.PI) / 180;
      for (const k of sel) {
        const ax = new THREE.Vector3(rnd(), rnd(), rnd());
        if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0);
        _qb.setFromAxisAngle(ax.normalize(), spread * amount * Math.abs(rnd()));
        k.v = _qa.fromArray(k.v).multiply(_qb).normalize().toArray().map((x) => +x.toFixed(6));
        n++;
      }
    } else {
      const dim = sel[0].v.length;
      const lo = new Array(dim).fill(Infinity);
      const hi = new Array(dim).fill(-Infinity);
      for (const k of sel) k.v.forEach((x, c) => ((lo[c] = Math.min(lo[c], x)), (hi[c] = Math.max(hi[c], x))));
      const unit = id.startsWith('ik:') ? 0.05 : 0.05 * hips;
      for (const k of sel) {
        k.v = k.v.map((x, c) => +(x + (hi[c] - lo[c] > 1e-6 ? hi[c] - lo[c] : unit) * amount * rnd()).toFixed(6));
        n++;
      }
    }
    layer.tracks[id] = keys;
  }
  return n;
}
