// Horneado inteligente (como el «Smart Bake» del add-on Herramientas, MIT, reimplementado):
// en vez de una clave por fotograma, solo las que hacen falta para que la curva no se aparte de lo que se ve
// más de una tolerancia (grados / fracción de la altura de cadera). Se elige insertando el peor fotograma
// hasta que todos quedan dentro (variante de Douglas–Peucker que respeta la interpolación real de las claves).
import * as THREE from 'three';
import { sampleTrack } from '../animation.js';

const DEG = Math.PI / 180;
/** Interpolación de cada clave horneada: suave por dentro; el primer y el último tramo, lineales (la «auto» frenaría en los extremos). */
export const bakedInterp = (k, n, interp) => (interp === 'auto' && (k === 0 || k === n - 2) ? 'linear' : interp);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * frames: fotogramas (enteros, ordenados). chans: [{ kind: 'quat'|'vec', vals: [array por fotograma], tol }].
 * tol: grados para cuaterniones, unidades del valor para vectores. must: fotogramas que siempre llevan clave.
 * Devuelve los fotogramas elegidos (ordenados).
 */
export function pickFrames(frames, chans, { interp = 'auto', must = [], max = Infinity } = {}) {
  const n = frames.length;
  if (n <= 2) return frames.slice();
  const chosen = new Set([0, n - 1]);
  const idxOf = new Map(frames.map((f, i) => [f, i]));
  for (const m of must) if (idxOf.has(m)) chosen.add(idxOf.get(m));
  const err = new Float64Array(n);
  const keysOf = (ch, idx) => idx.map((i, k) => ({ f: frames[i], v: ch.vals[i], i: bakedInterp(k, idx.length, interp) }));
  const errAt = (ch, keys, j) => {
    if (ch.kind === 'quat') {
      sampleTrack(keys, frames[j], _q);
      const d = Math.abs(_q.x * ch.vals[j][0] + _q.y * ch.vals[j][1] + _q.z * ch.vals[j][2] + _q.w * ch.vals[j][3]);
      return (2 * Math.acos(Math.min(1, d))) / (ch.tol * DEG);
    }
    sampleTrack(keys, frames[j], _v);
    return Math.hypot(_v.x - ch.vals[j][0], _v.y - (ch.vals[j][1] ?? 0), _v.z - (ch.vals[j][2] ?? 0)) / ch.tol;
  };
  const recompute = (lo, hi) => {
    const idx = [...chosen].sort((a, b) => a - b);
    const keys = chans.map((ch) => keysOf(ch, idx));
    for (let j = Math.max(0, lo); j <= Math.min(n - 1, hi); j++) {
      if (chosen.has(j)) {
        err[j] = 0;
        continue;
      }
      let e = 0;
      for (let c = 0; c < chans.length; c++) e = Math.max(e, errAt(chans[c], keys[c], j));
      err[j] = e;
    }
  };
  recompute(0, n - 1);
  while (chosen.size < Math.min(n, max)) {
    let w = -1;
    let we = 1;
    for (let j = 0; j < n; j++) if (err[j] > we) [w, we] = [j, err[j]];
    if (w < 0) break;
    chosen.add(w);
    // la interpolación «auto» mira a los vecinos de los vecinos: se recalcula ese tramo
    const idx = [...chosen].sort((a, b) => a - b);
    const p = idx.indexOf(w);
    recompute(idx[Math.max(0, p - 2)], idx[Math.min(idx.length - 1, p + 2)]);
  }
  return [...chosen].sort((a, b) => a - b).map((i) => frames[i]);
}

/**
 * Hornea lo que se ve (con IK, controles temporales, Look At…) a claves FK de la capa activa,
 * solo en los fotogramas necesarios. bones: huesos; range: [a, b].
 * before(): se llama tras muestrear y antes de escribir (p. ej. apagar el IK o quitar el control temporal).
 * tolDeg / tolPos (fracción de la altura de cadera) controlan la precisión; every: una clave por fotograma.
 */
export function bakeBones(engine, bones, [a, b], { tolDeg = 0.6, tolPos = 0.003, every = false, before = null, interp = 'auto', must = [] } = {}) {
  const rig = engine.rig;
  const layer = engine.layer();
  if (layer.lock || !bones.length) return { frames: 0, keys: 0 };
  a = Math.round(a);
  b = Math.round(b);
  const frames = [];
  for (let f = a; f <= b; f++) frames.push(f);
  const had = new Set(bones.filter((bn) => layer.tracks[`r:${bn.name}`] || layer.tracks[`t:${bn.name}`]).map((bn) => bn.name));
  const hipsB = rig.bone('hips');
  const withPos = (bn) => bn === hipsB;
  const H = rig.hipsHeight || 1;
  const vis = bones.map(() => ({ q: [], p: [] }));
  for (const f of frames) {
    engine.evaluate(f);
    bones.forEach((bn, i) => {
      vis[i].q.push(bn.quaternion.toArray());
      if (withPos(bn)) vis[i].p.push(bn.position.toArray());
    });
  }
  before?.();
  let chosen = frames;
  if (!every) {
    const chans = [];
    bones.forEach((bn, i) => {
      chans.push({ kind: 'quat', vals: vis[i].q, tol: tolDeg });
      if (withPos(bn)) chans.push({ kind: 'vec', vals: vis[i].p, tol: tolPos * H / Math.max(1e-9, worldScale(bn)) });
    });
    chosen = pickFrames(frames, chans, { interp, must: must.filter((x) => x >= a && x <= b) });
  }
  const write = (fs) => {
    for (const f of fs) {
      const j = f - a;
      bones.forEach((bn, i) => engine.keyBone(bn, new THREE.Quaternion().fromArray(vis[i].q[j]), withPos(bn) ? new THREE.Vector3().fromArray(vis[i].p[j]) : null, f));
    }
    // interpolación de las claves del rango (las de fuera no se tocan)
    for (const bn of bones) {
      for (const id of [`r:${bn.name}`, `t:${bn.name}`]) {
        const ks = (layer.tracks[id] || []).filter((k) => k.f >= a && k.f <= b);
        ks.forEach((k, n) => (k.i = bakedInterp(n, ks.length, interp)));
      }
    }
  };
  write(chosen);
  // comprobación: donde la capa (aditiva, con pesos…) no reproduzca lo muestreado, se añade la clave
  if (!every) {
    const have = new Set(chosen);
    for (let pass = 0; pass < 2; pass++) {
      const extra = [];
      for (const f of frames) {
        if (have.has(f)) continue;
        engine.evaluate(f, { ik: false });
        const j = f - a;
        const bad = bones.some((bn, i) => {
          const q = vis[i].q[j];
          const d = Math.abs(bn.quaternion.x * q[0] + bn.quaternion.y * q[1] + bn.quaternion.z * q[2] + bn.quaternion.w * q[3]);
          return 2 * Math.acos(Math.min(1, d)) > tolDeg * DEG * 1.5;
        });
        if (bad) extra.push(f);
      }
      if (!extra.length) break;
      write(extra);
      extra.forEach((f) => have.add(f));
      chosen = [...have].sort((x, y) => x - y);
    }
  }
  // pistas nuevas que no hacen nada (capa aditiva y giro cero en todo el rango: lo horneado ya era la FK) fuera
  if (layer.mode === 'add') {
    for (const bn of bones) {
      if (had.has(bn.name)) continue;
      for (const id of [`r:${bn.name}`, `t:${bn.name}`]) {
        const ks = layer.tracks[id];
        if (!ks) continue;
        const idle = id.startsWith('r:') ? ks.every((k) => Math.abs(Math.abs(k.v[3]) - 1) < 1e-6) : ks.every((k) => Math.hypot(...k.v) < 1e-6);
        if (idle) delete layer.tracks[id];
      }
    }
  }
  engine.evaluate(engine.frame);
  return { frames: chosen.length, keys: chosen.length * bones.length, of: frames.length };
}

function worldScale(bone) {
  const p = bone.parent;
  if (!p) return 1;
  p.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixScale(p.matrixWorld).x || 1;
}

/** Fotogramas con clave de una lista de pistas en todas las capas activas (para no perder los extremos al hornear). */
export function keyFramesOf(engine, test) {
  const out = new Set();
  for (const l of engine.doc.layers) for (const [id, ks] of Object.entries(l.tracks)) if (test(id)) ks.forEach((k) => out.add(k.f));
  return [...out].sort((a, b) => a - b);
}
