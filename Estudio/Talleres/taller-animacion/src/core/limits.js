// Límites naturales de cada articulación, en espacio canónico (pose T: x = izquierda del personaje, y = arriba, z = delante).
// Cada giro se parte en «balanceo» (hacia dónde apunta el hueso) y «torsión» (giro sobre su propio eje) y se recorta por separado.
// Solo se aplican a lo que edita la persona; la animación de base no se toca.
import * as THREE from 'three';
import { anatomicalSystem } from './anatomical-constraints.js';

const D = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** a: eje del hueso · u, v: direcciones de balanceo · lim: máximo hacia [+u, −u, +v, −v] (grados) · tw: torsión [mín, máx] · ball: ángulo total. */
function defFor(canon) {
  const side = /[LR]$/.test(canon) && canon !== 'upperChest' ? canon.slice(-1) : '';
  const base = side ? canon.slice(0, -1) : canon;
  const sx = side === 'R' ? -1 : 1;
  switch (base) {
    case 'upperArm': return { a: V(sx, 0, 0), u: V(0, 1, 0), v: V(0, 0, 1), lim: [100, 100, 135, 60], tw: [-95, 95] };
    case 'lowerArm': return { a: V(sx, 0, 0), u: V(0, 1, 0), v: V(0, 0, 1), lim: [10, 10, 150, 4], tw: [-95, 95] };
    case 'hand': return { a: V(sx, 0, 0), u: V(0, 1, 0), v: V(0, 0, 1), lim: [70, 80, 30, 30], tw: [-25, 25] };
    case 'shoulder': return { ball: 35 };
    case 'upperLeg': return { a: V(0, -1, 0), u: V(0, 0, 1), v: V(sx, 0, 0), lim: [125, 40, 60, 30], tw: [-50, 50] };
    case 'lowerLeg': return { a: V(0, -1, 0), u: V(0, 0, 1), v: V(sx, 0, 0), lim: [4, 150, 6, 6], tw: [-15, 15] };
    case 'foot': return { ball: 55 };
    case 'toes': return { ball: 50 };
    case 'spine': case 'chest': case 'upperChest': return { a: V(0, 1, 0), u: V(0, 0, 1), v: V(1, 0, 0), lim: [35, 20, 25, 25], tw: [-30, 30] };
    case 'neck': return { a: V(0, 1, 0), u: V(0, 0, 1), v: V(1, 0, 0), lim: [40, 35, 30, 30], tw: [-45, 45] };
    case 'head': return { a: V(0, 1, 0), u: V(0, 0, 1), v: V(1, 0, 0), lim: [40, 40, 30, 30], tw: [-60, 60] };
    default: return null;
  }
}
const DEFS = new Map();
export const limitDef = (canon) => (DEFS.has(canon) ? DEFS.get(canon) : (DEFS.set(canon, defFor(canon)), DEFS.get(canon)));

const _a = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tw = new THREE.Quaternion();
const _sw = new THREE.Quaternion();

/** Recorta un giro relativo (canónico) a su rango. Devuelve { q, over } (over: cuánto se salía, en radianes). */
export function clampRel(rel, def) {
  const q = rel.clone();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  let over = 0;
  if (def.ball) {
    const ang = 2 * Math.acos(Math.min(1, q.w));
    const max = def.ball * D;
    if (ang > max) {
      over = ang - max;
      _n.set(q.x, q.y, q.z).normalize();
      q.setFromAxisAngle(_n, max);
    }
    return { q, over };
  }
  // torsión sobre el eje del hueso, balanceo = lo demás (rel = balanceo · torsión)
  const d = q.x * def.a.x + q.y * def.a.y + q.z * def.a.z;
  _tw.set(def.a.x * d, def.a.y * d, def.a.z * d, q.w);
  if (_tw.lengthSq() < 1e-12) _tw.identity();
  else _tw.normalize();
  _sw.copy(q).multiply(_tw.clone().invert());
  let tw = 2 * Math.atan2(d, q.w);
  if (tw > Math.PI) tw -= 2 * Math.PI;
  if (tw < -Math.PI) tw += 2 * Math.PI;
  const tc = Math.min(def.tw[1] * D, Math.max(def.tw[0] * D, tw));
  over = Math.max(over, Math.abs(tw - tc));
  _a.copy(def.a).applyQuaternion(_sw);
  const ang = Math.acos(Math.min(1, Math.max(-1, _a.dot(def.a))));
  let sc = ang;
  if (ang > 1e-5) {
    const du = _a.dot(def.u);
    const dv = _a.dot(def.v);
    const len = Math.hypot(du, dv) || 1;
    const lu = (du >= 0 ? def.lim[0] : def.lim[1]) * D;
    const lv = (dv >= 0 ? def.lim[2] : def.lim[3]) * D;
    const max = 1 / Math.sqrt((du / len / lu) ** 2 + (dv / len / lv) ** 2);
    if (ang > max) {
      sc = max;
      over = Math.max(over, ang - max);
    }
  }
  if (over > 0) {
    if (ang > 1e-5) {
      _n.crossVectors(def.a, _a).normalize();
      _sw.setFromAxisAngle(_n, sc);
    }
    _tw.setFromAxisAngle(def.a, tc);
    q.copy(_sw).multiply(_tw);
  }
  return { q, over };
}

const _pw = new THREE.Quaternion();
const _cp = new THREE.Quaternion();

/** Marco canónico del antepasado mapeado más cercano (identidad si no hay). Requiere matrixWorld al día. */
function parentCanon(rig, bone, out) {
  let p = bone.parent;
  while (p && !rig.canonOf.get(p)) p = p.parent;
  if (!p) return out.identity();
  const c = rig.canonOf.get(p);
  return out.copy(rig.FqInv).multiply(p.getWorldQuaternion(_pw)).multiply(rig.TwInv[c]).multiply(rig.Fq);
}

/**
 * Giro local `localQ` de un hueso llevado a su rango natural. Devuelve { q, over }.
 * Los huesos sin límite definido (cadera, dedos, huesos sueltos) salen tal cual.
 */
export function limitLocal(rig, bone, localQ) {
  const c = rig.canonOf.get(bone);
  const def = c && limitDef(c);
  if (!def || !rig.Tw[c]) return { q: localQ.clone(), over: 0 };
  const Pw = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  parentCanon(rig, bone, _cp);
  const C = rig.FqInv.clone().multiply(Pw.clone().multiply(localQ)).multiply(rig.TwInv[c]).multiply(rig.Fq);
  const r = clampRel(_cp.clone().invert().multiply(C), def);
  if (r.over <= 1e-6) return { q: localQ.clone(), over: 0 };
  const W = rig.Fq.clone().multiply(_cp.clone().multiply(r.q)).multiply(rig.FqInv).multiply(rig.Tw[c]);
  return { q: Pw.invert().multiply(W), over: r.over };
}

/**
 * Para una edición: si el hueso ya estaba fuera de rango antes de tocarlo (la animación lo trae así),
 * no se corrige; si estaba dentro, lo nuevo no puede salirse.
 */
export function limitEdit(rig, bone, startQ, newQ) {
  if (rig.kind === 'quadruped') return anatomicalSystem(rig).constrain(bone,newQ,true);
  if (limitLocal(rig, bone, startQ).over > 2 * D) return newQ;
  return limitLocal(rig, bone, newQ).q;
}
