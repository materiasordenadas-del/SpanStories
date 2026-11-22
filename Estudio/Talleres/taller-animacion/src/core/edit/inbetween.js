// Intercalar y mezclar poses (reimplementación de «Inbetween World Matrix» y «Blend To Mirror» del add-on
// Herramientas, MIT). Un deslizador de −1 a 1 en el fotograma actual:
//   · intercalar: −1 = la pose de la clave anterior, 0 = como está, 1 = la de la clave siguiente (breakdown)
//   · espejo: 0 = como está, 1 = la pose reflejada del otro lado
//   · base: 0 = como está, 1 = la pose de debajo (sin esta capa)
// En espacio mundo (como el add-on) o local. Los brazos y piernas en IK reciben claves IK (sin realimentación).
import * as THREE from 'three';
import { IK_CHAINS } from '../humanoid.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

function readPose(engine, bones) {
  return bones.map((b) => ({ q: b.quaternion.clone(), wq: b.getWorldQuaternion(new THREE.Quaternion()), p: b.position.clone(), wp: b.getWorldPosition(new THREE.Vector3()) }));
}

/** Claves vecinas (de estos huesos o, si no tienen, de la capa activa) alrededor de f. */
export function neighborKeys(engine, bones, f) {
  const rig = engine.rig;
  const names = new Set(bones.map((b) => b.name));
  const chains = new Set(Object.entries(IK_CHAINS).filter(([, d]) => d.bones.some((c) => names.has(rig.mapping[c]))).map(([k]) => k));
  const own = (id) => (/^[rts]:/.test(id) && names.has(id.slice(2))) || [...chains].some((c) => id.startsWith(`ik:${c}:`));
  let frames = engine.keyFrames(engine.layer().id, own);
  if (!frames.length) frames = engine.keyFrames(engine.layer().id);
  const prev = [...frames].reverse().find((x) => x < f);
  const next = frames.find((x) => x > f);
  const [r0, r1] = engine.range();
  return [prev ?? r0, next ?? r1];
}

/**
 * Prepara una mezcla interactiva: devuelve una función apply(t) que deja la pose mezclada con clave en f
 * (cada llamada parte del documento original, así el deslizador se puede mover adelante y atrás).
 * mode: 'inbetween' | 'mirror' | 'base'; space: 'world' | 'local'.
 */
export function prepareBlend(engine, bones, f, { mode = 'inbetween', space = 'world' } = {}) {
  const rig = engine.rig;
  f = Math.round(f);
  bones = bones.filter(Boolean);
  if (!bones.length || engine.layer().lock) return null;
  const snap = clone(engine.doc.layers);
  const snapIK = { ...engine.doc.ik };
  engine.evaluate(f);
  const cur = readPose(engine, bones);
  let A = null;
  let B = null;
  if (mode === 'inbetween') {
    const [p, n] = neighborKeys(engine, bones, f);
    engine.evaluate(p);
    A = readPose(engine, bones);
    engine.evaluate(n);
    B = readPose(engine, bones);
  } else if (mode === 'mirror') {
    engine.evaluate(f);
    B = bones.map((b, i) => {
      const c = rig.canonOf.get(b);
      if (!c || !rig.Tw[c]) return cur[i];
      const c2 = /[LR]$/.test(c) && c !== 'upperChest' ? c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L') : c;
      const src = rig.bone(c2);
      if (!src || !rig.Tw[c2]) return cur[i];
      const W = src.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.TwInv[c2]);
      const cq = rig.worldToCanonQ(W);
      cq.set(cq.x, -cq.y, -cq.z, cq.w);
      const wq = rig.canonToWorldQ(cq).multiply(rig.Tw[c]);
      // posición (cadera): reflejada respecto al plano medio del personaje
      const wp = cur[i].wp.clone();
      if (c === 'hips') {
        const o = rig.restWorldPos.hips;
        const local = wp.clone().sub(o).applyQuaternion(rig.FqInv);
        local.x = -local.x;
        wp.copy(local.applyQuaternion(rig.Fq).add(o));
      }
      return { wq, wp, q: null, p: null };
    });
  } else {
    // la pose de debajo de la capa activa
    const idx = engine.doc.layers.indexOf(engine.layer());
    engine.evaluate(f, { stopAt: idx });
    B = readPose(engine, bones);
  }
  engine.evaluate(f);
  const isHips = (b) => rig.canonOf.get(b) === 'hips';
  const apply = (t) => {
    engine.doc.layers = clone(snap);
    Object.assign(engine.doc.ik, snapIK);
    t = Math.max(-1, Math.min(1, t));
    const other = t < 0 ? A : B;
    const u = Math.abs(t);
    if (!other || u < 1e-4) {
      engine.evaluate(f);
      return;
    }
    const entries = bones.map((b, i) => {
      const e = { bone: b };
      const o = other[i];
      if (space === 'local' && o.q) e.q = cur[i].q.clone().slerp(o.q, u);
      else e.wq = cur[i].wq.clone().slerp(o.wq, u);
      if (isHips(b)) {
        const wp = cur[i].wp.clone().lerp(o.wp, u);
        engine.evaluate(f, { ik: false });
        e.p = b.parent ? b.parent.worldToLocal(wp) : wp;
      }
      return e;
    });
    engine.keyPoseSmart(f, entries);
  };
  return { apply, restore: () => { engine.doc.layers = clone(snap); Object.assign(engine.doc.ik, snapIK); engine.evaluate(f); } };
}
