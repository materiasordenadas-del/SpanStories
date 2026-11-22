// Copiar / pegar matriz (reimplementación de «Copy/Paste World Matrix» y «Copy/Paste Relative Matrix» del add-on
// Herramientas, MIT).
//   · Mundo: guarda posición y giro de mundo; al pegar, el hueso vuelve a ese sitio exacto aunque el cuerpo esté en
//     otro lugar (manos y pies en IK van por su objetivo; la cadera por su traslación; el resto por giro).
//   · Relativa: guarda la relación de cada elegido con el activo (activo⁻¹ · elegido); al pegar en un rango, esa
//     relación se mantiene fotograma a fotograma aunque el activo se mueva (mano en la cadera, mano en la cabeza…).
import * as THREE from 'three';
import { IK_CHAINS } from '../humanoid.js';
import { pickFrames, bakedInterp } from './bake.js';
import { setKey } from '../animation.js';

const worldM = (b) => {
  b.updateWorldMatrix(true, false);
  return b.matrixWorld.clone();
};

/** Copia la matriz de mundo de los huesos en f. */
export function copyWorld(engine, bones, f) {
  engine.evaluate(f);
  return { kind: 'world', f, items: bones.map((b) => ({ name: b.name, m: worldM(b).toArray() })) };
}

/** Copia la relación de cada hueso con el activo en f. */
export function copyRelative(engine, active, bones, f) {
  engine.evaluate(f);
  const inv = worldM(active).invert();
  return { kind: 'relative', f, active: active.name, items: bones.filter((b) => b !== active).map((b) => ({ name: b.name, m: inv.clone().multiply(worldM(b)).toArray() })) };
}

function decompose(m) {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  new THREE.Matrix4().fromArray(m.toArray ? m.toArray() : m).decompose(p, q, s);
  return { p, q };
}

/**
 * Lleva varios huesos a matrices de mundo en f (sin realimentación).
 * Manos/pies con IK encendido: objetivo IK (y la rodilla/codo si también se pegan). Cadera: traslación.
 */
export function keyWorld(engine, f, targets) {
  const rig = engine.rig;
  const byName = new Map(targets.map((t) => [t.bone.name, t]));
  const done = new Set();
  // cadenas en IK cuyo efector se pega: por su objetivo
  for (const [chain, def] of Object.entries(IK_CHAINS)) {
    const ee = rig.bone(def.bones[2]);
    const t = ee && byName.get(ee.name);
    if (!t) continue;
    // una mano o un pie solo llegan a una posición de mundo por IK: se enciende sin saltos
    if (!engine.doc.ik[chain]) engine.switchIK(chain, true, f);
    const kn = rig.bone(def.bones[1]);
    const knee = kn && byName.get(kn.name);
    engine.keyChainPose(chain, f, { pos: t.p, quat: t.q, knee: knee ? knee.p : null });
    def.bones.forEach((c) => rig.bone(c) && done.add(rig.bone(c).name));
  }
  const rest = targets.filter((t) => !done.has(t.bone.name));
  const entries = rest.map((t) => {
    const e = { bone: t.bone, wq: t.q };
    if (rig.canonOf.get(t.bone) === 'hips') {
      engine.evaluate(f, { ik: false });
      e.p = t.bone.parent ? t.bone.parent.worldToLocal(t.p.clone()) : t.p.clone();
    }
    return e;
  });
  if (entries.length) engine.keyPoseSmart(f, entries);
  return true;
}

/** Pega lo copiado en el fotograma f (o en [a, b] para la relativa, con claves solo donde hacen falta). */
export function pasteMatrix(engine, clip, a, b = a, { tolDeg = 0.6, tolPos = 0.003 } = {}) {
  const rig = engine.rig;
  if (!clip || engine.layer().lock) return 0;
  const items = clip.items.map((it) => ({ ...it, bone: rig.byName.get(it.name) })).filter((it) => it.bone);
  if (!items.length) return 0;
  if (clip.kind === 'world') {
    for (let f = Math.round(a); f <= Math.round(b); f++) keyWorld(engine, f, items.map((it) => ({ bone: it.bone, ...decompose(it.m) })));
    return items.length;
  }
  const active = rig.byName.get(clip.active);
  if (!active) return 0;
  const frames = [];
  for (let f = Math.round(a); f <= Math.round(b); f++) frames.push(f);
  // manos y pies: van por ancla absoluta en el mundo (como el IK temporal); se enciende su IK sin saltos
  const chainOf = items.map((it) => Object.entries(IK_CHAINS).find(([, d]) => rig.bone(d.bones[2]) === it.bone)?.[0] || null);
  for (const ch of chainOf) if (ch && !engine.doc.ik[ch]) engine.switchIK(ch, true, frames[0]);
  // destino de cada hueso en cada fotograma: activo(f) · relación. Para las anclas se guarda ya el valor que se
  // escribe (ancla = destino − lo que suman las capas), y sobre eso se eligen las claves: así el error queda acotado.
  const activeChain = Object.entries(IK_CHAINS).find(([, d]) => d.bones.some((c) => rig.bone(c) === active))?.[0];
  const pasted = [...new Set(chainOf.filter((c) => c && c !== activeChain))];
  const want = frames.map((f) => {
    // el activo se mide sin la influencia de lo que se va a pegar (un brazo que no llega inclina la columna y
    // movería la cabeza a la que se quiere pegar la mano)
    const saved = pasted.map((c) => engine.doc.ik[c]);
    pasted.forEach((c) => (engine.doc.ik[c] = false));
    engine.evaluate(f);
    const A = worldM(active);
    pasted.forEach((c, k) => (engine.doc.ik[c] = saved[k]));
    engine.evaluate(f);
    return items.map((it, i) => {
      const d = decompose(A.clone().multiply(new THREE.Matrix4().fromArray(it.m)));
      const ch = chainOf[i];
      if (ch) {
        const st = engine.ikState[ch];
        d.abs = engine.worldToAbs(d.p.clone().sub(st.off));
        d.absq = rig.worldToCanonQ(st.rotW.clone().invert().multiply(d.q));
      }
      return d;
    });
  });
  let keys = frames;
  if (frames.length > 2) {
    const H = rig.hipsHeight || 1;
    const chans = [];
    items.forEach((_, i) => {
      if (chainOf[i]) {
        chans.push({ kind: 'vec', vals: want.map((w) => w[i].abs.toArray()), tol: tolPos });
        chans.push({ kind: 'quat', vals: want.map((w) => w[i].absq.toArray()), tol: tolDeg });
      } else {
        chans.push({ kind: 'vec', vals: want.map((w) => w[i].p.toArray()), tol: tolPos * H });
        chans.push({ kind: 'quat', vals: want.map((w) => w[i].q.toArray()), tol: tolDeg });
      }
    });
    keys = pickFrames(frames, chans);
  }
  const layer = engine.layer();
  const [r0, r1] = engine.range();
  chainOf.forEach((chain, i) => {
    if (!chain) return;
    for (const f of [frames[0] - 1, frames[frames.length - 1] + 1]) {
      if (f < r0 || f > r1 || layer.tracks[`ik:${chain}:absw`]?.some((k) => k.f === f)) continue;
      setKey(layer, `ik:${chain}:absw`, f, [0, 0, 0], 'auto');
    }
    for (const f of keys) {
      const w = want[f - frames[0]][i];
      setKey(layer, `ik:${chain}:abs`, f, w.abs.toArray(), 'auto');
      setKey(layer, `ik:${chain}:absq`, f, w.absq.toArray(), 'auto');
      setKey(layer, `ik:${chain}:absw`, f, [1, 0, 0], 'auto');
    }
    for (const k of ['abs', 'absq', 'absw']) {
      const ks = (layer.tracks[`ik:${chain}:${k}`] || []).filter((x) => x.f >= frames[0] && x.f <= frames[frames.length - 1]);
      ks.forEach((x, n) => (x.i = bakedInterp(n, ks.length, 'auto')));
    }
  });
  const restIdx = items.map((_, i) => i).filter((i) => !chainOf[i]);
  if (restIdx.length) {
    for (const f of keys) {
      const w = want[f - frames[0]];
      keyWorld(engine, f, restIdx.map((i) => ({ bone: items[i].bone, p: w[i].p, q: w[i].q })));
    }
  }
  engine.evaluate(engine.frame);
  return keys.length;
}