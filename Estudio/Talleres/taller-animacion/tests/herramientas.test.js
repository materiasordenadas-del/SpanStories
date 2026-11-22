// Herramientas (inspiradas en el add-on de Blender «Herramientas», MIT): IK de miembro con bisagra,
// conmutador IK⇄FK sin saltos, controles temporales, horneado, trayectoria, retimer, desfase, compartir,
// intercalar y copiar/pegar matriz. Núcleo, sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { Rig } from '../src/core/rig.js';
import { Engine } from '../src/core/animation.js';
import { IK_CHAINS } from '../src/core/humanoid.js';
import { proceduralClips } from '../src/core/procedural.js';

function skeleton(file) {
  const bytes = fs.readFileSync(file);
  const data = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const joints = new Set(data.skins.flatMap((s) => s.joints));
  const nodes = data.nodes.map((n, i) => {
    const o = joints.has(i) ? new T.Bone() : new T.Group();
    o.name = n.name || 'node' + i;
    if (n.matrix) new T.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  data.nodes.forEach((n, i) => n.children?.forEach((c) => nodes[i].add(nodes[c])));
  const root = new T.Group();
  data.scenes[data.scene || 0].nodes.forEach((n) => root.add(nodes[n]));
  return new Rig(root);
}
const RIGS = {
  rachel: new URL('../../../../SpanStories-Ciudades/assets/avatar/rachel.glb', import.meta.url),
  anciano: new URL('../biblioteca/personajes/Anciano Meshy (Mixamo).glb', import.meta.url),
};
const LIB = new Map(proceduralClips().map((c) => [c.id, c]));

export function setup(clipId = 'gen_caminar', who = 'rachel', strip = {}) {
  const rig = skeleton(RIGS[who]);
  const eng = new Engine(rig, LIB);
  const c = LIB.get(clipId);
  eng.doc.strips = [{ id: 's', clipId, start: 0, len: c.frames, blend: 0, speed: 1, loop: c.loop, inPlace: false, mirror: false, reverse: false, ...strip }];
  return { rig, eng, H: rig.hipsHeight };
}
const wp = (rig, c) => rig.bone(c).getWorldPosition(new T.Vector3());
const quats = (rig) => rig.bones.map((b) => b.quaternion.toArray());
const maxDiff = (a, b) => Math.max(...a.map((q, i) => Math.max(...q.map((x, k) => Math.abs(x - b[i][k])))));
const DEG = 180 / Math.PI;

/** Ángulo de flexión de la rodilla/codo y cuánto se sale de su plano de bisagra (grados). */
function hingeState(rig, chain) {
  const [cu, cl, ce] = IK_CHAINS[chain].bones;
  const A = wp(rig, cu);
  const B = wp(rig, cl);
  const C = wp(rig, ce);
  const leg = chain.startsWith('foot');
  const sx = chain.endsWith('R') ? -1 : 1;
  const hc = leg ? new T.Vector3(1, 0, 0) : new T.Vector3(0, -sx, 0);
  const lh = hc.applyQuaternion(rig.Fq).applyQuaternion(rig.TwInv[cl]);
  const hW = lh.applyQuaternion(rig.bone(cl).getWorldQuaternion(new T.Quaternion())).normalize();
  const u1 = B.clone().sub(A).normalize();
  const u2 = C.clone().sub(B).normalize();
  const flex = Math.atan2(hW.dot(u1.clone().cross(u2)), u1.dot(u2)) * DEG;
  const off = Math.asin(Math.min(1, Math.abs(u2.dot(hW)))) * DEG;
  return { flex, off, A, B, C, hW };
}

for (const who of ['rachel', 'anciano']) {
  test(`IK de miembro (${who}): la rodilla y el codo solo doblan por su bisagra, hacia donde doblan de verdad`, () => {
    const { rig, eng, H } = setup('gen_caminar', who);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    let reached = 0;
    let total = 0;
    for (const chain of Object.keys(IK_CHAINS)) eng.doc.ik[chain] = true;
    for (let i = 0; i < 120; i++) {
      const f = Math.floor(((rnd() + 1) / 2) * 30);
      for (const chain of Object.keys(IK_CHAINS)) {
        eng.doc.layers[0].tracks = {};
        eng.evaluate(f);
        const fk = hingeState(rig, chain);
        const st = eng.ikState[chain];
        const target = st.target.clone().add(new T.Vector3(rnd(), rnd(), rnd()).multiplyScalar(0.45 * H));
        eng.keyIK(chain, { pos: target }, f);
        if (rnd() > 0.3) eng.keyIK(chain, { pole: eng.ikState[chain].pole.clone().add(new T.Vector3(rnd(), rnd(), rnd()).multiplyScalar(0.4 * H)) }, f);
        eng.evaluate(f);
        const s = hingeState(rig, chain);
        assert.ok(s.flex > Math.min(fk.flex, 0) - 0.5 && s.flex < Math.max(fk.flex, 150) + 0.5, `${chain} flexión ${s.flex.toFixed(1)}° (FK ${fk.flex.toFixed(1)}°)`);
        assert.ok(s.off < fk.off + 1, `${chain} se sale del plano de su bisagra: ${s.off.toFixed(2)}° (FK ${fk.off.toFixed(2)}°)`);
        total++;
        if (eng.ikState[chain].reach < 0.97 && target.distanceTo(s.A) > 0.45 * (s.A.distanceTo(s.B) + s.B.distanceTo(s.C))) {
          if (s.C.distanceTo(eng.ikState[chain].target) < 2e-3 * H) reached++;
          else assert.fail(`${chain}: objetivo al alcance pero el pie/mano queda a ${(s.C.distanceTo(eng.ikState[chain].target) / H).toFixed(4)} H`);
        }
      }
    }
    assert.ok(reached > total * 0.2, `pocos objetivos alcanzables probados (${reached}/${total})`);
  });
}

test('IK: con el personaje girado 180°, arrastrar el pie arriba y adelante deja la rodilla mirando adelante (caso de la captura)', () => {
  for (const yaw of [0, 180, 90]) {
    const { rig, eng, H } = setup('gen_reposo', 'rachel', { root: { x: 0, y: 0, z: 0, yaw } });
    eng.doc.ik.footR = true;
    eng.evaluate(0);
    const hb = rig.bone('hips').getWorldQuaternion(new T.Quaternion()).multiply(rig.TwInv.hips);
    const fwd = rig.frame.fwd.clone().applyQuaternion(hb);
    const left = rig.frame.left.clone().applyQuaternion(hb);
    const up = new T.Vector3(0, 1, 0);
    const st = eng.ikState.footR;
    const target = st.target.clone().addScaledVector(fwd, 0.35 * H).addScaledVector(up, 0.45 * H);
    eng.keyIK('footR', { pos: target }, 0);
    eng.evaluate(0);
    const s = hingeState(rig, 'footR');
    const mid = s.A.clone().add(s.C).multiplyScalar(0.5);
    const knee = s.B.clone().sub(mid);
    assert.ok(knee.dot(fwd) > 0.05 * H, `yaw ${yaw}: la rodilla no mira adelante (${(knee.dot(fwd) / H).toFixed(3)})`);
    assert.ok(Math.abs(s.hW.dot(left)) > 0.85, `yaw ${yaw}: la pierna se retuerce (bisagra·izquierda = ${s.hW.dot(left).toFixed(2)})`);
    assert.ok(s.flex > 20 && s.flex < 150.5, `yaw ${yaw}: flexión ${s.flex.toFixed(1)}`);
    assert.ok(s.C.distanceTo(target) < 2e-3 * H, `yaw ${yaw}: el pie no llega`);
  }
});

test('IK: la pierna recta no voltea la rodilla hacia atrás al bajar la cadera', () => {
  const { rig, eng, H } = setup('gen_reposo');
  eng.doc.ik.footL = eng.doc.ik.footR = true;
  eng.evaluate(0);
  const feet = ['footL', 'footR'].map((c) => eng.ikState[c].target.clone());
  const hips = rig.bone('hips');
  eng.evaluate(0, { ik: false });
  const local = hips.parent.worldToLocal(wp(rig, 'hips').add(new T.Vector3(0, -0.2 * H, 0)));
  eng.keyBone(hips, null, local, 0);
  ['footL', 'footR'].forEach((c, i) => eng.keyIK(c, { pos: feet[i] }, 0));
  eng.evaluate(0);
  const hb = hips.getWorldQuaternion(new T.Quaternion()).multiply(rig.TwInv.hips);
  const fwd = rig.frame.fwd.clone().applyQuaternion(hb);
  for (const c of ['footL', 'footR']) {
    const s = hingeState(rig, c);
    const knee = s.B.clone().sub(s.A.clone().add(s.C).multiplyScalar(0.5));
    assert.ok(knee.dot(fwd) > 0, `${c}: la rodilla dobla hacia atrás`);
    assert.ok(s.flex > 10, `${c}: no dobla (${s.flex.toFixed(1)}°)`);
  }
});

test('IK sin claves reproduce la animación en dos esqueletos (también el Anciano Mixamo)', () => {
  for (const who of ['rachel', 'anciano']) {
    const { rig, eng } = setup('gen_caminar', who);
    for (const f of [0, 7, 13, 22]) {
      eng.doc.ik = { handL: false, handR: false, footL: false, footR: false };
      eng.evaluate(f);
      const fk = quats(rig);
      for (const k of Object.keys(eng.doc.ik)) eng.doc.ik[k] = true;
      eng.evaluate(f);
      assert.ok(maxDiff(fk, quats(rig)) < 2e-3, `${who} f${f}: ${maxDiff(fk, quats(rig))}`);
    }
  }
});

test('IK ⇄ FK sin saltos: cambiar en un fotograma cualquiera no mueve la mano ni el pie', () => {
  for (const chain of ['footL', 'handR']) {
    const { rig, eng, H } = setup('gen_caminar');
    const ee = IK_CHAINS[chain].bones[2];
    // FK → IK con claves IK previas (que antes saltaban al encender)
    eng.doc.ik[chain] = true;
    eng.evaluate(5);
    eng.keyIK(chain, { pos: eng.ikState[chain].target.clone().add(new T.Vector3(0.1 * H, 0.15 * H, 0.05 * H)) }, 5);
    eng.doc.ik[chain] = false;
    for (const f of [9, 14]) {
      eng.evaluate(f);
      const before = wp(rig, ee);
      const knee = wp(rig, IK_CHAINS[chain].bones[1]);
      eng.switchIK(chain, true, f);
      eng.evaluate(f);
      assert.ok(wp(rig, ee).distanceTo(before) < 1e-3 * H, `${chain} FK→IK f${f}: salto ${wp(rig, ee).distanceTo(before) / H}`);
      assert.ok(wp(rig, IK_CHAINS[chain].bones[1]).distanceTo(knee) < 2e-3 * H, `${chain} FK→IK f${f}: la rodilla/codo salta`);
      // IK → FK
      const vis = wp(rig, ee);
      eng.switchIK(chain, false, f);
      eng.evaluate(f);
      assert.ok(wp(rig, ee).distanceTo(vis) < 1e-3 * H, `${chain} IK→FK f${f}: salto ${wp(rig, ee).distanceTo(vis) / H}`);
    }
  }
});

test('sin realimentación: clave de lo seleccionado, espejo y giro con el IK encendido no cambian la pose que se ve', () => {
  const { rig, eng, H } = setup('gen_caminar');
  eng.doc.ik.footR = eng.doc.ik.handL = true;
  eng.evaluate(8);
  eng.keyIK('footR', { pos: eng.ikState.footR.target.clone().add(new T.Vector3(0, 0.2 * H, 0.15 * H)) }, 8);
  eng.evaluate(8);
  const seen = quats(rig);
  // «poner clave» a los huesos de la pierna con IK encendido: se guarda como IK, la pose no cambia
  const leg = IK_CHAINS.footR.bones.map((c) => rig.bone(c));
  eng.keyPoseSmart(8, leg.map((b) => ({ bone: b, q: b.quaternion.clone() })));
  eng.evaluate(8);
  assert.ok(maxDiff(seen, quats(rig)) < 1e-3, `la pose cambió ${maxDiff(seen, quats(rig))}`);
  // dos veces seguidas tampoco (antes cada clave sumaba la corrección otra vez)
  eng.keyPoseSmart(8, leg.map((b) => ({ bone: b, q: b.quaternion.clone() })));
  eng.evaluate(8);
  assert.ok(maxDiff(seen, quats(rig)) < 1e-3, 'segunda clave');
  // girar el muslo con IK encendido mueve el pie (como FK) y la pierna sigue en IK
  const thigh = rig.bone('upperLegR');
  const footBefore = wp(rig, 'footR');
  const q = thigh.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.4));
  eng.keyPoseSmart(8, [{ bone: thigh, q }]);
  eng.evaluate(8);
  assert.ok(eng.doc.ik.footR, 'sigue en IK');
  assert.ok(wp(rig, 'footR').distanceTo(footBefore) > 0.05 * H, 'el pie acompaña al giro del muslo');
  assert.ok(1 - Math.abs(thigh.quaternion.dot(q)) < 1e-4, 'el muslo queda como se giró');
  // espejo L → R con la pierna derecha en IK: la derecha recibe claves IK y queda reflejada (giros de mundo)
  const canonW = (c) => rig.worldToCanonQ(rig.bone(c).getWorldQuaternion(new T.Quaternion()).multiply(rig.TwInv[c]));
  eng.evaluate(8);
  const want = ['upperLegL', 'lowerLegL', 'footL'].map((c) => {
    const q = canonW(c);
    return q.set(q.x, -q.y, -q.z, q.w);
  });
  eng.mirrorSide(8, 'L');
  eng.evaluate(8);
  assert.ok(eng.doc.ik.footR, 'la pierna derecha sigue en IK');
  ['upperLegR', 'lowerLegR', 'footR'].forEach((c, i) => {
    const ang = canonW(c).angleTo(want[i]) * DEG;
    assert.ok(ang < 2, `espejo ${c}: ${ang.toFixed(2)}°`);
  });
});

import { createTempIK, createTempWorld, bakeTemp, cancelTemp } from '../src/core/edit/temp.js';
import { pickFrames } from '../src/core/edit/bake.js';

const poseOf = (rig) => rig.bones.map((b) => b.getWorldPosition(new T.Vector3()));
const poseDiff = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));

test('horneado inteligente: pocas claves y la curva no se aparta más de la tolerancia', () => {
  const frames = Array.from({ length: 61 }, (_, i) => i);
  const vals = frames.map((f) => [Math.sin(f / 10), 0.2 * f, 0]);
  const keys = pickFrames(frames, [{ kind: 'vec', vals, tol: 0.01 }]);
  assert.ok(keys.length < 25, `demasiadas claves: ${keys.length}`);
  assert.ok(keys[0] === 0 && keys.at(-1) === 60);
  const lin = frames.map((f) => [0, 0.5 * f, 0]);
  assert.ok(pickFrames(frames, [{ kind: 'vec', vals: lin, tol: 0.01 }]).length <= 3, 'una recta: casi sin claves');
});

test('IK temporal: crear no cambia nada, mover el control cambia solo ese tramo, hornear deja lo que se veía', () => {
  const { rig, eng, H } = setup('gen_caminar');
  const before = {};
  for (let f = 0; f <= 25; f++) {
    eng.evaluate(f);
    before[f] = poseOf(rig);
  }
  const t = createTempIK(eng, 'footR', 4, 22);
  assert.ok(t && eng.doc.ik.footR);
  assert.ok(t.keys < 19, `claves inteligentes: ${t.keys} de 19`);
  for (const f of [4, 9, 13, 22]) {
    eng.evaluate(f);
    assert.ok(poseDiff(poseOf(rig), before[f]) < 3e-3 * H, `f${f}: crear el control cambió la pose ${poseDiff(poseOf(rig), before[f]) / H}`);
  }
  // mover el pie en f13: solo cambia alrededor de f13
  eng.evaluate(13);
  const goal = eng.ikState.footR.target.clone().add(new T.Vector3(0, 0.15 * H, 0.1 * H));
  eng.keyIK('footR', { pos: goal }, 13);
  eng.evaluate(13);
  assert.ok(wp(rig, 'footR').distanceTo(goal) < 2e-3 * H, 'el pie llega al control');
  for (const f of [4, 22]) {
    eng.evaluate(f);
    assert.ok(poseDiff(poseOf(rig), before[f]) < 3e-3 * H, `f${f}: la edición en f13 se extendió hasta f${f}`);
  }
  const seen = {};
  for (let f = 0; f <= 25; f++) {
    eng.evaluate(f);
    seen[f] = poseOf(rig);
  }
  const r = bakeTemp(eng, t.id);
  assert.ok(r.frames < 19, `horneado: ${r.frames} claves`);
  assert.equal(eng.doc.temp.length, 0);
  assert.equal(eng.doc.ik.footR, false, 'la pierna vuelve a FK');
  for (let f = 0; f <= 25; f++) {
    eng.evaluate(f);
    assert.ok(poseDiff(poseOf(rig), seen[f]) < 0.012 * H, `f${f}: el horneado no reproduce lo que se veía (${(poseDiff(poseOf(rig), seen[f]) / H).toFixed(4)})`);
  }
});

test('IK temporal: cancelar devuelve el documento exactamente como estaba', () => {
  const { eng, H } = setup('gen_caminar');
  eng.doc.ik.handL = true;
  eng.evaluate(6);
  eng.keyIK('handL', { pos: eng.ikState.handL.target.clone().add(new T.Vector3(0, 0.1 * H, 0)) }, 6);
  const snap = JSON.stringify(eng.doc);
  const t = createTempIK(eng, 'handL', 2, 18);
  eng.evaluate(10);
  eng.keyIK('handL', { pos: eng.ikState.handL.target.clone().add(new T.Vector3(0.1 * H, 0, 0)) }, 10);
  cancelTemp(eng, t.id);
  const after = JSON.parse(JSON.stringify(eng.doc));
  delete after.temp;
  const orig = JSON.parse(snap);
  delete orig.temp;
  assert.deepEqual(after, orig);
});

test('control en espacio mundo: la cabeza mantiene su giro de mundo aunque gire el cuerpo, y se hornea igual', () => {
  const { rig, eng } = setup('gen_caminar');
  const head = rig.bone('head');
  eng.evaluate(10);
  const hq = head.getWorldQuaternion(new T.Quaternion());
  const t = createTempWorld(eng, head, 0, 20);
  eng.evaluate(10);
  hq.copy(head.getWorldQuaternion(new T.Quaternion()));
  // girar la cadera 40° en f10
  const hips = rig.bone('hips');
  eng.evaluate(10, { ik: false });
  eng.keyBone(hips, hips.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.7)), null, 10);
  eng.evaluate(10);
  assert.ok(head.getWorldQuaternion(new T.Quaternion()).angleTo(hq) < 1e-3, 'la cabeza giró con el cuerpo');
  const seen = head.getWorldQuaternion(new T.Quaternion());
  bakeTemp(eng, t.id);
  eng.evaluate(10);
  assert.ok(head.getWorldQuaternion(new T.Quaternion()).angleTo(seen) < 0.6 / DEG * 1.6, 'el horneado no conserva el giro');
});

import { pathTarget, samplePath, movePathPoint } from '../src/core/edit/motionpath.js';
import { offsetCascade, shareKeys, snapshotTracks } from '../src/core/edit/keyops.js';
import { addMarker, retimeMarker, warpFn } from '../src/core/edit/retime.js';
import { prepareBlend } from '../src/core/edit/inbetween.js';
import { copyWorld, copyRelative, pasteMatrix } from '../src/core/edit/matrix.js';
import { setKey, sampleTrack } from '../src/core/animation.js';

test('trayectoria: arrastrar un punto con clave cambia solo esa clave (pie en IK y cadera)', () => {
  const { rig, eng, H } = setup('gen_caminar');
  eng.doc.ik.footL = true;
  for (const f of [4, 12, 20]) {
    eng.evaluate(f);
    eng.keyIK('footL', { pos: eng.ikState.footL.target.clone() }, f);
  }
  const t = pathTarget({ selection: { kind: 'ik', chain: 'footL' }, rig });
  const p0 = samplePath(eng, t, 0, 24);
  assert.ok(p0.keys.has(4) && p0.keys.has(12) && p0.keys.has(20));
  const goal = p0.points[12].clone().add(new T.Vector3(0, 0.12 * H, 0));
  movePathPoint(eng, t, 12, goal);
  const p1 = samplePath(eng, t, 0, 24);
  assert.ok(p1.points[12].distanceTo(goal) < 2e-3 * H, 'el punto llega a donde se soltó');
  for (const f of [4, 20]) assert.ok(p1.points[f].distanceTo(p0.points[f]) < 1e-3 * H, `la clave ${f} se movió`);
  // cadera
  const th = { kind: 'bone', bone: rig.bone('hips') };
  const h0 = samplePath(eng, th, 0, 24);
  const hg = h0.points[8].clone().add(new T.Vector3(0.1 * H, 0, 0));
  movePathPoint(eng, th, 8, hg);
  const h1 = samplePath(eng, th, 0, 24);
  assert.ok(h1.points[8].distanceTo(hg) < 2e-3 * H, 'la cadera llega');
});

test('desfase en cascada y compartir claves', () => {
  const layer = { tracks: {} };
  setKey(layer, 'r:a', 0, [0, 0, 0, 1]);
  setKey(layer, 'r:a', 10, [0, 0.38, 0, 0.92]);
  setKey(layer, 'r:b', 0, [0, 0, 0, 1]);
  setKey(layer, 'r:b', 10, [0.38, 0, 0, 0.92]);
  setKey(layer, 't:c', 5, [1, 2, 3]);
  const snap = snapshotTracks(layer, ['r:a', 'r:b']);
  offsetCascade(layer, [['r:a'], ['r:b']], 2, snap);
  assert.deepEqual(layer.tracks['r:a'].map((k) => k.f), [0, 10], 'el primero no se mueve');
  assert.deepEqual(layer.tracks['r:b'].map((k) => k.f), [2, 12], 'el segundo +2');
  offsetCascade(layer, [['r:a'], ['r:b']], 4, snap);
  assert.deepEqual(layer.tracks['r:b'].map((k) => k.f), [4, 14], 'el deslizador parte siempre del original');
  const before = sampleTrack(layer.tracks['r:a'], 4, new T.Quaternion()).toArray();
  const r = shareKeys(layer, ['r:a', 'r:b']);
  assert.ok(r.added >= 2);
  assert.deepEqual(layer.tracks['r:a'].map((k) => k.f), [0, 4, 10, 14]);
  const after = sampleTrack(layer.tracks['r:a'], 4, new T.Quaternion()).toArray();
  assert.ok(after.every((x, i) => Math.abs(x - before[i]) < 1e-5), 'la clave nueva tiene el valor exacto de la curva');
});

test('retimer: monótono, conserva los extremos y estira la animación de base', () => {
  const w = warpFn([0, 30, 60], [0, 40, 60]);
  let prev = -Infinity;
  for (let f = 0; f <= 60; f += 0.5) {
    assert.ok(w(f) > prev);
    prev = w(f);
  }
  assert.equal(w(0), 0);
  assert.equal(w(60), 60);
  const { rig, eng } = setup('gen_caminar');
  eng.doc.rangeMode = 'manual';
  eng.doc.start = 0;
  eng.doc.end = 60;
  eng.doc.strips[0].loop = true;
  eng.doc.strips[0].len = 61;
  setKey(eng.layer(), `r:${rig.mapping.head}`, 30, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.3).toArray());
  eng.evaluate(15);
  const at15 = quats(rig);
  const m = addMarker(eng.doc, 30);
  const r = retimeMarker(eng, m.id, 40);
  assert.ok(r && eng.doc.markers[0].f === 40);
  assert.equal(eng.layer().tracks[`r:${rig.mapping.head}`][0].f, 40, 'la clave del marcador va con él');
  // lo que pasaba en f15 ahora pasa en f20 (el tramo 0–30 se estiró a 0–40)
  eng.evaluate(20);
  assert.ok(maxDiff(at15, quats(rig)) < 2e-3, `la base no se estiró: ${maxDiff(at15, quats(rig))}`);
  // no se puede cruzar el extremo
  assert.equal(retimeMarker(eng, m.id, 999)?.to, 59);
});

test('intercalar: 0 no cambia, −1/1 llevan a la clave anterior/siguiente; espejo y base', () => {
  const { rig, eng } = setup('gen_reposo');
  const head = rig.bone('head');
  const arm = rig.bone('upperArmL');
  eng.evaluate(0, { ik: false });
  eng.keyBone(head, head.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.5)), null, 0);
  eng.evaluate(20, { ik: false });
  eng.keyBone(head, head.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.6)), null, 20);
  eng.evaluate(0);
  const q0 = head.getWorldQuaternion(new T.Quaternion());
  eng.evaluate(20);
  const q20 = head.getWorldQuaternion(new T.Quaternion());
  const bl = prepareBlend(eng, [head], 10);
  bl.apply(0);
  bl.apply(-1);
  eng.evaluate(10);
  assert.ok(head.getWorldQuaternion(new T.Quaternion()).angleTo(q0) < 1e-3, 'intercalar −1 = clave anterior');
  bl.apply(1);
  eng.evaluate(10);
  assert.ok(head.getWorldQuaternion(new T.Quaternion()).angleTo(q20) < 1e-3, 'intercalar 1 = clave siguiente');
  bl.restore();
  // espejo del brazo izquierdo hacia el derecho
  eng.evaluate(5, { ik: false });
  eng.keyBone(arm, arm.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.8)), null, 5);
  const armR = rig.bone('upperArmR');
  const mb = prepareBlend(eng, [armR], 5, { mode: 'mirror' });
  mb.apply(1);
  eng.evaluate(5);
  const canonW = (c) => rig.worldToCanonQ(rig.bone(c).getWorldQuaternion(new T.Quaternion()).multiply(rig.TwInv[c]));
  const l = canonW('upperArmL');
  const rr = canonW('upperArmR');
  assert.ok(new T.Quaternion(l.x, -l.y, -l.z, l.w).angleTo(rr) < 2e-3, 'espejo 1 = el otro lado reflejado');
});

test('copiar/pegar matriz: mundo vuelve al mismo sitio; relativa mantiene la mano pegada a la cabeza', () => {
  const { rig, eng, H } = setup('gen_caminar');
  const hand = rig.bone('handR');
  const head = rig.bone('head');
  // mundo: copiar la mano en f5 y pegarla en f15
  const cw = copyWorld(eng, [hand], 5);
  const p5 = wp(rig, 'handR');
  pasteMatrix(eng, cw, 15);
  eng.evaluate(15);
  assert.ok(wp(rig, 'handR').distanceTo(p5) < 2e-3 * H, `mundo: ${wp(rig, 'handR').distanceTo(p5) / H}`);
  // relativa: en f0 la mano a 15 cm delante de la cabeza; pegar en 0–30 y la relación se mantiene
  eng.doc.ik.handR = true;
  eng.evaluate(0);
  // la mano junto a la cabeza (con el brazo doblado: sin que la columna tenga que inclinarse para llegar)
  const hp = wp(rig, 'head');
  eng.keyIK('handR', { pos: hp.clone().add(rig.frame.fwd.clone().multiplyScalar(0.15 * H)).add(rig.frame.left.clone().multiplyScalar(-0.12 * H)) }, 0);
  eng.evaluate(0);
  assert.ok(eng.ikState.handR.reach < 0.95);
  const rel0 = head.worldToLocal(wp(rig, 'handR'));
  const cr = copyRelative(eng, head, [hand], 0);
  const n = pasteMatrix(eng, cr, 0, 30);
  assert.ok(n < 31, `claves: ${n}`);
  for (const f of [7, 18, 29]) {
    eng.evaluate(f);
    const rel = head.worldToLocal(wp(rig, 'handR'));
    assert.ok(rel.distanceTo(rel0) * head.getWorldScale(new T.Vector3()).x < 0.01 * H, `f${f}: la mano se separa de la cabeza`);
  }
});

test('IK → FK con una sola clave IK: no salta en ningún fotograma (caso del verificador)', () => {
  const { rig, eng, H } = setup('gen_caminar');
  eng.doc.ik.footR = true;
  eng.evaluate(15);
  eng.keyIK('footR', { pos: eng.ikState.footR.target.clone().add(new T.Vector3(0, 0.3 * H, 0.3 * H)) }, 15);
  const seen = {};
  for (const f of [0, 6, 15, 22, 29]) {
    eng.evaluate(f);
    seen[f] = wp(rig, 'footR');
  }
  eng.switchIK('footR', false, 15);
  assert.equal(eng.doc.ik.footR, false);
  for (const f of [0, 6, 15, 22, 29]) {
    eng.evaluate(f);
    assert.ok(wp(rig, 'footR').distanceTo(seen[f]) < 0.01 * H, `f${f}: salto ${(wp(rig, 'footR').distanceTo(seen[f]) / H).toFixed(4)} H`);
  }
});

import { docToHash, hashToDoc } from '../src/io/url.js';

test('el retimer y los marcadores viajan en el enlace', () => {
  const { rig, eng } = setup('gen_caminar');
  eng.doc.rangeMode = 'manual';
  eng.doc.start = 0;
  eng.doc.end = 60;
  eng.doc.strips[0].loop = true;
  eng.doc.strips[0].len = 61;
  const m = addMarker(eng.doc, 30, 'Golpe');
  retimeMarker(eng, m.id, 40);
  eng.evaluate(20);
  const a = quats(rig);
  const d2 = hashToDoc(docToHash(eng.doc, rig), rig);
  assert.deepEqual(d2.markers.map((x) => [x.f, x.name]), [[40, 'Golpe']]);
  assert.ok(d2.strips[0].timeMap?.k?.length >= 2, 'falta el mapa de tiempo');
  const e2 = new Engine(rig, LIB);
  e2.doc = d2;
  e2.evaluate(20);
  assert.ok(maxDiff(a, quats(rig)) < 2e-3, 'la tira no reproduce el retimer tras el enlace');
});

import { groupKeys, multikeyScale, multikeyRandom } from '../src/core/edit/keyops.js';
import { makePivot, pivotWorld, captureTargets, rotateAroundPivot } from '../src/core/edit/pivot.js';

test('Multikey: escalar 1 no cambia, 0 lleva al neutro, 2 dobla; variar es repetible', () => {
  const layer = { id: 'base', mode: 'add', tracks: {} };
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.4);
  setKey(layer, 'r:a', 0, q.toArray());
  setKey(layer, 'r:a', 10, q.toArray());
  setKey(layer, 'ik:footL:pos', 5, [0.1, 0.2, 0]);
  const groups = groupKeys(layer, ['base|r:a|0', 'base|r:a|10', 'base|ik:footL:pos|5']);
  const snap = snapshotTracks(layer, [...groups.keys()]);
  multikeyScale(layer, groups, 1, snap);
  assert.ok(new T.Quaternion().fromArray(layer.tracks['r:a'][0].v).angleTo(q) < 1e-6);
  multikeyScale(layer, groups, 0, snap);
  assert.ok(new T.Quaternion().fromArray(layer.tracks['r:a'][0].v).angleTo(new T.Quaternion()) < 1e-6, 'a la identidad');
  assert.deepEqual(layer.tracks['ik:footL:pos'][0].v, [0, 0, 0]);
  multikeyScale(layer, groups, 2, snap);
  assert.ok(Math.abs(new T.Quaternion().fromArray(layer.tracks['r:a'][0].v).angleTo(new T.Quaternion()) - 0.8) < 1e-5, 'el doble de giro');
  multikeyRandom(layer, groups, 0.5, snap, { seed: 7 });
  const a = JSON.stringify(layer.tracks);
  multikeyRandom(layer, groups, 0.5, snap, { seed: 7 });
  assert.equal(JSON.stringify(layer.tracks), a, 'misma semilla, mismo resultado');
  multikeyRandom(layer, groups, 0.5, snap, { seed: 8 });
  assert.notEqual(JSON.stringify(layer.tracks), a);
});

test('pivote temporal: girar la cadera alrededor del pie deja ese punto quieto; pegado a un hueso lo acompaña', () => {
  const { rig, eng, H } = setup('gen_reposo');
  const hips = rig.bone('hips');
  const foot = rig.bone('footL');
  eng.evaluate(0);
  const P0 = wp(rig, 'footL');
  const pv = makePivot(rig, P0, foot);
  const P = pivotWorld(rig, pv);
  assert.ok(P.distanceTo(P0) < 1e-6);
  const before = hips.getWorldPosition(new T.Vector3());
  const t = captureTargets([hips]);
  const R = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
  rotateAroundPivot(eng, 0, t, P, R);
  eng.evaluate(0);
  const after = hips.getWorldPosition(new T.Vector3());
  // la cadera gira 90° alrededor de la vertical que pasa por el pie: misma distancia horizontal al pivote
  const dh = (v) => Math.hypot(v.x - P.x, v.z - P.z);
  assert.ok(Math.abs(dh(after) - dh(before)) < 2e-3 * H, 'la distancia al pivote se conserva');
  assert.ok(after.distanceTo(before) > 0.01 * H || dh(before) < 0.02 * H, 'la cadera se movió alrededor del pivote');
  const fwd0 = rig.frame.fwd.clone();
  const fwd1 = rig.frame.fwd.clone().applyQuaternion(hips.getWorldQuaternion(new T.Quaternion()).multiply(rig.TwInv.hips));
  assert.ok(Math.abs(fwd0.dot(fwd1)) < 0.05, 'el cuerpo mira 90° a un lado');
  // pegado al pie: tras girar, el pivote sigue al pie
  assert.ok(pivotWorld(rig, pv).distanceTo(wp(rig, 'footL')) < 1e-6);
});

import { limitLocal } from '../src/core/limits.js';

test('muñeca natural: al mover la mano por IK sigue al antebrazo, sin salirse de rango; la pronación la hace el antebrazo', () => {
  for (const who of ['rachel', 'anciano']) {
    const { rig, eng, H } = setup('gen_reposo', who);
    const fore = rig.bone('lowerArmR');
    const hand = rig.bone('handR');
    const rel = () => fore.getWorldQuaternion(new T.Quaternion()).invert().multiply(hand.getWorldQuaternion(new T.Quaternion()));
    eng.evaluate(0);
    const rel0 = rel();
    eng.doc.ik.handR = true;
    for (const d of [[0, 0.35, 0.45], [0, 0.8, 0.2], [0.4, 0.4, 0.3]]) {
      eng.doc.layers[0].tracks = {};
      eng.evaluate(0);
      const tgt = eng.ikState.handR.target.clone().add(new T.Vector3(...d).multiplyScalar(H).applyQuaternion(rig.Fq));
      eng.keyIK('handR', { pos: tgt }, 0);
      eng.evaluate(0);
      assert.ok(rel().angleTo(rel0) * DEG < 1, `${who} ${d}: la muñeca se dobla ${(rel().angleTo(rel0) * DEG).toFixed(1)}° (la mano no sigue al antebrazo)`);
      assert.ok(limitLocal(rig, hand, hand.quaternion.clone()).over * DEG < 0.5, `${who}: muñeca fuera de rango`);
      assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(tgt) < 2e-3 * H, `${who}: la mano no llega`);
    }
    // pronación de 80°: la mano gira lo pedido y la muñeca solo una parte (el resto, el antebrazo)
    eng.doc.layers[0].tracks = {};
    eng.evaluate(0);
    const ax = hand.getWorldPosition(new T.Vector3()).sub(fore.getWorldPosition(new T.Vector3())).normalize();
    const q = new T.Quaternion().setFromAxisAngle(ax, 80 / DEG).multiply(hand.getWorldQuaternion(new T.Quaternion()));
    eng.keyIK('handR', { quat: q }, 0);
    eng.evaluate(0);
    assert.ok(hand.getWorldQuaternion(new T.Quaternion()).angleTo(q) * DEG < 1, `${who}: la mano no gira lo pedido`);
    assert.ok(rel().angleTo(rel0) * DEG < 30, `${who}: la muñeca se retuerce ${(rel().angleTo(rel0) * DEG).toFixed(1)}°`);
    // doblar la muñeca más allá de lo natural (120°): se queda en su tope
    eng.doc.layers[0].tracks = {};
    eng.evaluate(0);
    const side = new T.Vector3().crossVectors(ax, new T.Vector3(0, 1, 0)).normalize();
    eng.keyIK('handR', { quat: new T.Quaternion().setFromAxisAngle(side, 120 / DEG).multiply(hand.getWorldQuaternion(new T.Quaternion())) }, 0);
    eng.evaluate(0);
    assert.ok(limitLocal(rig, hand, hand.quaternion.clone()).over * DEG < 0.5, `${who}: la muñeca pasó de su tope`);
  }
});

import { insertKeyExact } from '../src/core/edit/keyops.js';
import { movePathPointSoft } from '../src/core/edit/motionpath.js';

test('compartir claves exacto: insertar una clave no cambia la curva entre claves (todas las interpolaciones)', () => {
  for (const [i, b] of [['smooth'], ['linear'], ['in'], ['out'], ['bezier', [0.3, 0, 0.4, 1.35]]]) {
    for (const quat of [false, true]) {
      const v0 = quat ? [0, 0, 0, 1] : [0, 0, 0];
      const v1 = quat ? new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 1.2).toArray() : [1, 2, -1];
      const keys = [{ f: 0, v: v0, i, ...(b ? { b } : {}) }, { f: 20, v: v1, i: 'smooth' }];
      const out = () => (quat ? new T.Quaternion() : new T.Vector3());
      const before = Array.from({ length: 21 }, (_, f) => sampleTrack(keys, f, out()).toArray());
      insertKeyExact(keys, 7, quat);
      insertKeyExact(keys, 13, quat);
      const err = Math.max(...before.map((x, f) => Math.max(...sampleTrack(keys, f, out()).toArray().map((y, c) => Math.abs(y - x[c]) * (quat && x[3] * y < 0 ? 0 : 1)))));
      assert.ok(err < 2e-3, `${i}${quat ? ' (giro)' : ''}: la curva cambió ${err}`);
    }
  }
  // giros «auto» también
  const keys = [{ f: 0, v: [0, 0, 0, 1], i: 'auto' }, { f: 10, v: new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.9).toArray(), i: 'auto' }];
  const before = Array.from({ length: 11 }, (_, f) => sampleTrack(keys, f, new T.Quaternion()).clone());
  insertKeyExact(keys, 4, true);
  for (let f = 0; f <= 10; f++) assert.ok(sampleTrack(keys, f, new T.Quaternion()).angleTo(before[f]) < 2e-3, `auto f${f}`);
});

test('hornear / pasar a FK un brazo que no llega: la columna y el hombro también se hornean (no cambia lo que se ve)', () => {
  const { rig, eng, H } = setup('gen_reposo');
  eng.doc.ik.handL = true;
  eng.evaluate(10);
  // objetivo lejos: el brazo no llega y el cuerpo se inclina
  eng.keyIK('handL', { pos: eng.ikState.handL.target.clone().add(new T.Vector3(0.6, 0.5, 0.6).multiplyScalar(H).applyQuaternion(rig.Fq)) }, 10);
  eng.evaluate(10);
  const seen = wp(rig, 'handL');
  const bones = eng.ikBakeBones('handL');
  assert.ok(bones.length > 3, 'debería incluir la columna y el hombro');
  eng.switchIK('handL', false, 10);
  eng.evaluate(10);
  assert.ok(wp(rig, 'handL').distanceTo(seen) < 0.01 * H, `la mano se movió ${(wp(rig, 'handL').distanceTo(seen) / H).toFixed(3)} H al pasar a FK`);
});

test('trayectoria con influencia: las claves vecinas acompañan con caída suave (sin pico de un fotograma)', () => {
  const { rig, eng, H } = setup('gen_caminar');
  const t = createTempIK(eng, 'footR', 0, 30, { tolDeg: 0.01, tolPos: 0.00001 }); // claves en casi todos los fotogramas
  assert.ok(t.keys > 25);
  const tg = { kind: 'ik', chain: 'footR' };
  const p0 = samplePath(eng, tg, 0, 30);
  const goal = p0.points[15].clone().add(new T.Vector3(0, 0.2 * H, 0));
  movePathPointSoft(eng, tg, 15, goal, { falloff: 6 });
  const p1 = samplePath(eng, tg, 0, 30);
  const lift = (f) => p1.points[f].y - p0.points[f].y;
  assert.ok(Math.abs(lift(15) - 0.2 * H) < 3e-3 * H, 'el punto llega');
  assert.ok(lift(12) > 0.05 * H && lift(12) < lift(15), 'las vecinas acompañan');
  assert.ok(lift(18) > 0.05 * H && lift(18) < lift(15));
  assert.ok(Math.abs(lift(5)) < 2e-3 * H && Math.abs(lift(25)) < 2e-3 * H, 'lejos no cambia');
});
