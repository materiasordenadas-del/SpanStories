// Controles temporales (reimplementación de «Temp IK Ctrls», «World Space Ctrls» y «Bake Temp Ctrls»
// del add-on Herramientas, MIT). Sobre un rango de fotogramas:
//   · IK temporal: la mano o el pie se convierten en un objetivo absoluto en el mundo, con claves solo donde
//     hacen falta. Mover el control cambia la clave de ese fotograma; las demás se quedan (edición local).
//   · Mundo temporal: un hueso conserva su giro (y la cadera su posición) de mundo aunque el cuerpo se mueva.
//   · Hornear: lo que se ve pasa a claves FK de la capa activa (pocas, inteligentes) y el control desaparece.
//   · Cancelar: todo vuelve a como estaba antes de crear el control.
import * as THREE from 'three';
import { IK_CHAINS } from '../humanoid.js';
import { setKey, sampleTrack, uid } from '../animation.js';
import { pickFrames, bakeBones, bakedInterp } from './bake.js';

/** Primer y último tramo lineales dentro del rango (como las claves horneadas). */
function tidy(keys, a, b) {
  const ks = (keys || []).filter((k) => k.f >= a && k.f <= b);
  ks.forEach((k, n) => (k.i = bakedInterp(n, ks.length, 'auto')));
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const rangeFrames = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

function rangeOf(engine, a, b) {
  const [r0, r1] = engine.range();
  a = Math.round(a ?? r0);
  b = Math.round(b ?? r1);
  return a <= b ? [a, b] : [b, a];
}

/** IK temporal para una mano o un pie en [a, b]. Devuelve el control creado. */
export function createTempIK(engine, chain, a, b, { tolDeg = 0.8, tolPos = 0.004 } = {}) {
  const def = IK_CHAINS[chain];
  const layer = engine.layer();
  if (!def || layer.lock) return null;
  [a, b] = rangeOf(engine, a, b);
  removeTemp(engine, (t) => t.kind === 'ik' && t.chain === chain, true);
  const rig = engine.rig;
  const H = rig.hipsHeight || 1;
  const frames = [];
  for (let f = a; f <= b; f++) frames.push(f);
  // lo que se ve ahora: posición y giro del efector, y lo que suman las capas (para que el objetivo dé lo mismo)
  const prevIK = !!engine.doc.ik[chain];
  const ee = rig.bone(def.bones[2]);
  const pos = [];
  const rot = [];
  for (const f of frames) {
    engine.evaluate(f);
    const st = engine.ikState[chain];
    const wp = rig.worldPos(ee, new THREE.Vector3());
    const wq = ee.getWorldQuaternion(new THREE.Quaternion());
    pos.push(engine.worldToAbs(wp.sub(st.off)).toArray());
    rot.push(rig.worldToCanonQ(st.rotW.clone().invert().multiply(wq)).toArray());
  }
  const prev = Object.fromEntries(Object.entries(layer.tracks).filter(([k]) => k.startsWith(`ik:${chain}:`)).map(([k, v]) => [k, clone(v)]));
  // el ancla anterior (si la había) se respeta fuera del rango
  const outside = (k, f, size) => {
    const t = prev[`ik:${chain}:${k}`];
    if (!t?.length) return null;
    return sampleTrack(t, f, size === 4 ? new THREE.Quaternion() : new THREE.Vector3()).toArray();
  };
  const keys = pickFrames(frames, [
    { kind: 'vec', vals: pos, tol: tolPos / 1 },
    { kind: 'quat', vals: rot, tol: tolDeg },
  ]);
  engine.doc.ik[chain] = true;
  const [r0, r1] = engine.range();
  for (const [f, side] of [[a - 1, 'in'], [b + 1, 'out']]) {
    if (f < r0 || f > r1) continue;
    setKey(layer, `ik:${chain}:absw`, f, outside('absw', f) || [prev[`ik:${chain}:abs`] ? 1 : 0, 0, 0], 'auto');
    const p = outside('abs', f);
    const q = outside('absq', f, 4);
    if (p) setKey(layer, `ik:${chain}:abs`, f, p, 'auto');
    if (q) setKey(layer, `ik:${chain}:absq`, f, q, 'auto');
    void side;
  }
  for (const f of keys) {
    const j = f - a;
    setKey(layer, `ik:${chain}:abs`, f, pos[j], 'auto');
    setKey(layer, `ik:${chain}:absq`, f, rot[j], 'auto');
    setKey(layer, `ik:${chain}:absw`, f, [1, 0, 0], 'auto');
  }
  for (const k of ['abs', 'absq', 'absw']) tidy(layer.tracks[`ik:${chain}:${k}`], a, b);
  const t = { id: uid('tmp'), kind: 'ik', chain, a, b, layer: layer.id, label: def.label, prev: { ik: prevIK, tracks: prev }, keys: keys.length };
  (engine.doc.temp ||= []).push(t);
  engine.evaluate(engine.frame);
  void H;
  return t;
}

/** Control temporal en espacio mundo para un hueso (la cadera también guarda su posición). */
export function createTempWorld(engine, bone, a, b, { tolDeg = 0.6, tolPos = 0.003 } = {}) {
  const rig = engine.rig;
  if (!bone) return null;
  [a, b] = rangeOf(engine, a, b);
  removeTemp(engine, (t) => t.kind === 'world' && t.bone === bone.name, true);
  const isHips = rig.canonOf.get(bone) === 'hips';
  const frames = [];
  for (let f = a; f <= b; f++) frames.push(f);
  const q = [];
  const p = [];
  for (const f of frames) {
    engine.evaluate(f);
    q.push(bone.getWorldQuaternion(new THREE.Quaternion()).toArray());
    if (isHips) p.push(bone.getWorldPosition(new THREE.Vector3()).toArray());
  }
  const H = rig.hipsHeight || 1;
  const chans = [{ kind: 'quat', vals: q, tol: tolDeg }];
  if (isHips) chans.push({ kind: 'vec', vals: p, tol: tolPos * H });
  const keys = pickFrames(frames, chans);
  const t = { id: uid('tmp'), kind: 'world', bone: bone.name, a, b, layer: engine.layer().id, label: rig.canonOf.get(bone) || bone.name, tracks: { q: [], ...(isHips ? { p: [] } : {}) } };
  for (const f of keys) {
    setKey(t, 'q', f, q[f - a], 'auto');
    if (isHips) setKey(t, 'p', f, p[f - a], 'auto');
  }
  tidy(t.tracks.q, a, b);
  tidy(t.tracks.p, a, b);
  t.keys = keys.length;
  (engine.doc.temp ||= []).push(t);
  engine.evaluate(engine.frame);
  return t;
}

/** Quita controles temporales (sin hornear: deshace lo que añadieron). */
export function removeTemp(engine, test, quiet = false) {
  const list = (engine.doc.temp || []).filter(test);
  for (const t of list) cancelTemp(engine, t.id);
  if (!quiet) engine.evaluate(engine.frame);
  return list.length;
}

/** Cancelar: vuelve exactamente a como estaba antes de crear el control. */
export function cancelTemp(engine, id) {
  const doc = engine.doc;
  const t = (doc.temp || []).find((x) => x.id === id);
  if (!t) return false;
  if (t.kind === 'ik') {
    const layer = doc.layers.find((l) => l.id === t.layer);
    if (layer) {
      for (const k of Object.keys(layer.tracks)) if (k.startsWith(`ik:${t.chain}:`)) delete layer.tracks[k];
      Object.assign(layer.tracks, clone(t.prev.tracks));
    }
    doc.ik[t.chain] = t.prev.ik;
  }
  doc.temp = doc.temp.filter((x) => x !== t);
  return true;
}

/**
 * Hornear y quitar: lo que se ve en el rango pasa a claves FK (las justas) de la capa del control.
 * Fuera del rango no cambia nada: si el miembro estaba en IK, se apaga solo dentro del rango (clave de mezcla).
 */
export function bakeTemp(engine, id, opts = {}) {
  const doc = engine.doc;
  const t = (doc.temp || []).find((x) => x.id === id);
  if (!t) return null;
  const rig = engine.rig;
  const prevActive = doc.activeLayer;
  if (doc.layers.some((l) => l.id === t.layer)) doc.activeLayer = t.layer;
  let res;
  if (t.kind === 'ik') {
    // con la columna y el hombro si el IK los inclinaba para llegar (si no, cambiaría lo que se ve)
    const bones = engine.doc.ik[t.chain] ? engine.ikBakeBones(t.chain, rangeFrames(t.a, t.b)) : IK_CHAINS[t.chain].bones.map((c) => rig.bone(c)).filter(Boolean);
    res = bakeBones(engine, bones, [t.a, t.b], {
      ...opts,
      before: () => {
        cancelTemp(engine, t.id);
        if (t.prev.ik) {
          // fuera del rango el miembro sigue en IK como antes; dentro manda la FK horneada
          const layer = engine.layer();
          const [r0, r1] = engine.range();
          const wPrev = (f) => {
            const w = layer.tracks[`ik:${t.chain}:w`];
            return w?.length ? sampleTrack(w, f, new THREE.Vector3()).x : 1;
          };
          const edges = [[t.a - 1, wPrev(t.a - 1)], [t.b + 1, wPrev(t.b + 1)]].filter(([f]) => f >= r0 && f <= r1);
          for (const [f, w] of edges) setKey(layer, `ik:${t.chain}:w`, f, [w, 0, 0], 'linear');
          setKey(layer, `ik:${t.chain}:w`, t.a, [0, 0, 0], 'step');
          setKey(layer, `ik:${t.chain}:w`, t.b, [0, 0, 0], 'linear');
          for (const k of layer.tracks[`ik:${t.chain}:w`]) if (k.f > t.a && k.f < t.b) k.v = [0, 0, 0];
        } else doc.ik[t.chain] = false;
      },
    });
  } else {
    const bone = rig.byName.get(t.bone);
    res = bone ? bakeBones(engine, [bone], [t.a, t.b], { ...opts, before: () => cancelTemp(engine, t.id) }) : null;
  }
  doc.activeLayer = prevActive;
  engine.evaluate(engine.frame);
  return res;
}

/** Hornea un miembro en IK a FK en un rango (sin control temporal): «Convertir a FK» de Herramientas. */
export function bakeChainToFK(engine, chain, a, b, opts = {}) {
  const t = { id: uid('tmp'), kind: 'ik', chain, a, b, layer: engine.layer().id, prev: { ik: !!engine.doc.ik[chain], tracks: Object.fromEntries(Object.entries(engine.layer().tracks).filter(([k]) => k.startsWith(`ik:${chain}:`)).map(([k, v]) => [k, clone(v)])) } };
  [t.a, t.b] = rangeOf(engine, a, b);
  (engine.doc.temp ||= []).push(t);
  return bakeTemp(engine, t.id, opts);
}
