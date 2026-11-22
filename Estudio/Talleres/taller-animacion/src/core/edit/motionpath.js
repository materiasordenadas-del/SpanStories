// Trayectoria editable (reimplementación de «Editable Motion Path» del add-on Herramientas, MIT).
// Se dibuja la posición de mundo de un control a lo largo del tiempo; los puntos con clave se arrastran en el visor
// y el arrastre se traduce al canal que mueve ese control (como get_distance/mp_update_keyframes del add-on):
//   · mano / pie  → objetivo IK de ese fotograma (keyIK; dentro de un IK temporal, su clave absoluta)
//   · cadera      → traslación local de la cadera (t:hips) medida sin IK
//   · otro hueso  → giro del hueso padre para que el hueso llegue al punto (como «Arrastrar»)
import * as THREE from 'three';
import { IK_CHAINS } from '../humanoid.js';
import { limitEdit } from '../limits.js';

/** Qué se dibuja para la selección actual (o null si no tiene trayectoria). */
export function pathTarget(app) {
  const s = app.selection;
  const rig = app.rig;
  if (!s || !rig) return null;
  if (s.kind === 'ik') return { kind: 'ik', chain: s.chain, label: IK_CHAINS[s.chain]?.label || s.chain };
  if (s.kind === 'root') return { kind: 'bone', bone: rig.bone('hips'), label: 'Cadera' };
  if (s.kind === 'bone' && s.bone) {
    const c = rig.canonOf.get(s.bone);
    for (const [chain, def] of Object.entries(IK_CHAINS)) if (def.bones[2] === c) return { kind: 'ik', chain, label: def.label };
    return { kind: 'bone', bone: s.bone, label: c || s.bone.name };
  }
  return null;
}

function pointOf(engine, t, out) {
  const rig = engine.rig;
  if (t.kind === 'ik') return rig.worldPos(rig.bone(IK_CHAINS[t.chain].bones[2]), out);
  return rig.worldPos(t.bone, out);
}

/** Pistas que «tienen clave» para ese control (para marcar los puntos editables). */
export function pathTrackTest(engine, t) {
  if (t.kind === 'ik') {
    const names = IK_CHAINS[t.chain].bones.map((c) => engine.rig.mapping[c]);
    return (id) => id.startsWith(`ik:${t.chain}:`) && !id.endsWith(':w') || names.some((n) => id === `r:${n}`);
  }
  const n = t.bone.name;
  const parent = t.bone.parent?.name;
  return (id) => id === `t:${n}` || id === `r:${n}` || (parent && id === `r:${parent}`);
}

/**
 * Muestrea la trayectoria en [a, b]: { frames, points (Vector3 de mundo), keys (Set de fotogramas con clave) }.
 * Deja el motor evaluado en el fotograma en que estaba.
 */
export function samplePath(engine, t, a, b) {
  const cur = engine.frame;
  const frames = [];
  const points = [];
  for (let f = Math.round(a); f <= Math.round(b); f++) {
    engine.evaluate(f);
    frames.push(f);
    points.push(pointOf(engine, t, new THREE.Vector3()));
  }
  const test = pathTrackTest(engine, t);
  const keys = new Set();
  for (const l of engine.doc.layers) for (const [id, ks] of Object.entries(l.tracks)) if (test(id)) for (const k of ks) if (k.f >= a && k.f <= b) keys.add(k.f);
  for (const tm of engine.doc.temp || []) {
    if (tm.kind === 'world' && t.kind === 'bone' && tm.bone === t.bone.name) for (const k of tm.tracks.q) keys.add(k.f);
  }
  engine.evaluate(cur);
  return { frames, points, keys };
}

/**
 * Lleva el control a `world` en el fotograma f (con clave). Devuelve true si se pudo.
 * limits: aplica los límites naturales al girar el padre.
 */
export function movePathPoint(engine, t, f, world, { limits = true } = {}) {
  const rig = engine.rig;
  if (engine.layer().lock) return false;
  if (t.kind === 'ik') {
    if (!engine.doc.ik[t.chain]) engine.switchIK(t.chain, true, f);
    return engine.keyIK(t.chain, { pos: world.clone() }, f);
  }
  const b = t.bone;
  const tw = engine.tempAt('world', b.name, f);
  if (rig.canonOf.get(b) === 'hips') {
    if (tw && tw.tracks.p) {
      engine.evaluate(f);
      return engine.keyTempWorld(tw, f, b.getWorldQuaternion(new THREE.Quaternion()), world);
    }
    engine.evaluate(f, { ik: false });
    const local = b.parent ? b.parent.worldToLocal(world.clone()) : world.clone();
    return engine.keyBone(b, null, local, f);
  }
  // otro hueso: gira el padre para que el hueso llegue al punto (sin realimentar la pose IK)
  const p = b.parent;
  if (!p || !rig.index.has(p)) return false;
  engine.evaluate(f, { ik: false });
  const o = p.getWorldPosition(new THREE.Vector3());
  const e = b.getWorldPosition(new THREE.Vector3());
  const v0 = e.sub(o);
  const v1 = world.clone().sub(o);
  if (v0.lengthSq() < 1e-12 || v1.lengthSq() < 1e-12) return false;
  const start = p.quaternion.clone();
  const q = new THREE.Quaternion().setFromUnitVectors(v0.normalize(), v1.normalize());
  const pw = p.parent ? p.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  let local = pw.clone().invert().multiply(q.multiply(pw.multiply(p.quaternion)));
  if (limits) local = limitEdit(rig, p, start, local);
  return engine.keyPoseSmart(f, [{ bone: p, q: local }]);
}

/** Peso de la influencia a distancia d (fotogramas) con radio N: 1 en el punto, 0 a partir de N+1 (caída en coseno). */
export const falloffWeight = (d, N) => (N <= 0 ? (d === 0 ? 1 : 0) : d > N ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / (N + 1))));

/**
 * Como movePathPoint, pero las claves vecinas (±falloff fotogramas) acompañan con una caída suave: la edición no
 * deja un pico de un solo fotograma cuando hay claves en casi todos (mocap, controles temporales). Como la edición
 * proporcional de Blender o la transición de iClone.
 */
export function movePathPointSoft(engine, t, f, world, { falloff = 0, limits = true } = {}) {
  const N = Math.max(0, Math.round(falloff));
  if (!N) return movePathPoint(engine, t, f, world, { limits });
  const s = samplePath(engine, t, f - N, f + N);
  const i = s.frames.indexOf(f);
  if (i < 0) return movePathPoint(engine, t, f, world, { limits });
  const delta = world.clone().sub(s.points[i]);
  movePathPoint(engine, t, f, world, { limits });
  for (const g of s.keys) {
    if (g === f) continue;
    const w = falloffWeight(Math.abs(g - f), N);
    if (w <= 1e-4) continue;
    movePathPoint(engine, t, g, s.points[s.frames.indexOf(g)].clone().addScaledVector(delta, w), { limits });
  }
  return true;
}
