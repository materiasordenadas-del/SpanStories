// Edición FK/IK, anclas, mezcla IK↔FK, curvas propias y suelo (núcleo, sin navegador).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { Rig } from '../src/core/rig.js';
import { Engine, bezierEase, sampleTrack, setKey } from '../src/core/animation.js';
import { proceduralClips } from '../src/core/procedural.js';
import { docToHash, hashToDoc } from '../src/io/url.js';

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

function setup(clipId = 'gen_caminar', inPlace = false) {
  const rig = skeleton(new URL('../../../../SpanStories-Ciudades/assets/avatar/rachel.glb', import.meta.url));
  const lib = new Map(proceduralClips().map((c) => [c.id, c]));
  const eng = new Engine(rig, lib);
  const c = lib.get(clipId);
  eng.doc.strips = [{ id: 's', clipId, start: 0, len: c.frames, blend: 0, speed: 1, loop: c.loop, inPlace, mirror: false, reverse: false }];
  return { rig, eng };
}
const wp = (rig, c) => rig.bone(c).getWorldPosition(new T.Vector3());
const quats = (rig) => rig.bones.map((b) => b.quaternion.toArray());
// por componentes: los cuaterniones del GLB no son exactamente unitarios y 1-|dot| daría falsos cambios
const maxDiff = (a, b) => Math.max(...a.map((q, i) => Math.max(...q.map((x, k) => Math.abs(x - b[i][k])))));

test('IK encendido sin claves reproduce la animación tal cual', () => {
  const { rig, eng } = setup();
  eng.evaluate(12);
  const fk = quats(rig);
  for (const k of Object.keys(eng.doc.ik)) eng.doc.ik[k] = true;
  eng.evaluate(12);
  assert.ok(maxDiff(fk, quats(rig)) < 2e-3, String(maxDiff(fk, quats(rig))));
});

test('arrastrar la mano por IK: llega al objetivo y no toca el resto del cuerpo', () => {
  const { rig, eng } = setup();
  eng.evaluate(10);
  const before = quats(rig);
  const names = rig.bones.map((b) => b.name);
  eng.doc.ik.handR = true;
  eng.evaluate(10);
  const H = rig.hipsHeight;
  const target = eng.ikState.handR.target.clone().add(new T.Vector3(0, 0.12 * H, 0.1 * H));
  assert.ok(eng.keyIK('handR', { pos: target }, 10));
  eng.evaluate(10);
  assert.ok(eng.ikState.handR.reach <= 1, 'el objetivo de la prueba está al alcance');
  assert.ok(wp(rig, 'handR').distanceTo(target) < 1e-3 * H, `mano a ${wp(rig, 'handR').distanceTo(target)}`);
  const arm = new Set(['upperArmR', 'lowerArmR', 'handR'].map((c) => rig.mapping[c]));
  const after = quats(rig);
  names.forEach((n, i) => {
    if (arm.has(n)) return;
    assert.ok(maxDiff([before[i]], [after[i]]) < 1e-9, `${n} cambió`);
  });
  // la corrección acompaña a la animación en los demás fotogramas (se suma encima)
  eng.evaluate(25);
  const st = eng.ikState.handR;
  assert.ok(Math.abs(st.target.distanceTo(st.fkEnd) - target.distanceTo(wpAt(eng, rig, 10))) < 1e-6 * H || st.target.distanceTo(st.fkEnd) > 0.1 * H);
});
function wpAt(eng, rig, f) {
  const saved = eng.doc.ik.handR;
  eng.doc.ik.handR = false;
  eng.evaluate(f);
  const p = wp(rig, 'handR');
  eng.doc.ik.handR = saved;
  return p;
}

test('mezcla IK↔FK: 0 es FK puro, 1 es IK puro y en medio queda entre los dos', () => {
  const { rig, eng } = setup();
  const H = rig.hipsHeight;
  eng.evaluate(10);
  const fkPos = wp(rig, 'handL');
  eng.doc.ik.handL = true;
  eng.evaluate(10);
  const target = eng.ikState.handL.target.clone().add(new T.Vector3(0, 0.15 * H, 0.08 * H));
  eng.keyIK('handL', { pos: target }, 10);
  eng.keyIKWeight('handL', 0, 10);
  eng.evaluate(10);
  assert.ok(wp(rig, 'handL').distanceTo(fkPos) < 1e-6);
  eng.keyIKWeight('handL', 0.5, 10);
  eng.evaluate(10);
  const half = wp(rig, 'handL');
  assert.ok(half.distanceTo(fkPos) > 0.03 * H && half.distanceTo(target) > 0.03 * H);
  eng.keyIKWeight('handL', 1, 10);
  eng.evaluate(10);
  assert.ok(wp(rig, 'handL').distanceTo(target) < 1e-3 * H);
});

test('ancla: el pie queda fijo en el mundo durante el tramo y se suelta fuera', () => {
  const { rig, eng } = setup('gen_caminar', false);
  const H = rig.hipsHeight;
  eng.evaluate(6);
  assert.ok(eng.pinIK('footL', 6, 12, 2));
  eng.evaluate(6);
  const p0 = wp(rig, 'footL');
  const q0 = rig.bone('footL').getWorldQuaternion(new T.Quaternion());
  for (let f = 6; f <= 12; f++) {
    eng.evaluate(f);
    if (eng.ikState.footL.reach > 1) continue; // fuera de alcance: se estira lo que puede
    assert.ok(wp(rig, 'footL').distanceTo(p0) < 2e-3 * H, `f${f}: ${wp(rig, 'footL').distanceTo(p0) / H}`);
    assert.ok(Math.abs(rig.bone('footL').getWorldQuaternion(new T.Quaternion()).dot(q0)) > 0.9999);
  }
  eng.evaluate(20);
  assert.equal(eng.ikState.footL.pin, 0);
  assert.ok(eng.ikState.footL.target.distanceTo(eng.ikState.footL.fkEnd) < 1e-9);
  assert.ok(eng.unpinIK('footL') > 0);
  assert.ok(!Object.keys(eng.layer().tracks).some((k) => k.includes(':abs')));
});

test('la evaluación no depende del orden: cualquier fotograma da siempre la misma pose', () => {
  const { rig, eng } = setup();
  eng.doc.floor = true;
  eng.pinIK('footR', 3, 9);
  eng.doc.ik.handR = true;
  eng.evaluate(8);
  eng.keyIK('handR', { pos: eng.ikState.handR.target.clone().add(new T.Vector3(0.05, 0.1, 0)) }, 8);
  eng.keyIKWeight('handR', 0.7, 8);
  eng.evaluate(8);
  const a = quats(rig);
  for (const f of [30, 0, 17, 3]) eng.evaluate(f);
  eng.evaluate(8);
  assert.ok(maxDiff(a, quats(rig)) < 1e-12, String(maxDiff(a, quats(rig))));
});

test('suelo: con la cadera hundida los pies no bajan de su altura de reposo', () => {
  const { rig, eng } = setup('gen_reposo');
  const hips = rig.bone('hips');
  eng.evaluate(0);
  const drop = hips.position.clone();
  drop.y -= 0.25 * rig.hipsHeight * (hips.position.y / (wp(rig, 'hips').y || 1));
  eng.keyBone(hips, null, drop, 0);
  eng.evaluate(0);
  const restY = rig.restWorldPos.footL.y;
  assert.ok(wp(rig, 'footL').y < restY - 0.05 * rig.hipsHeight, 'sin suelo, el pie se hunde');
  eng.doc.floor = true;
  eng.evaluate(0);
  for (const s of ['L', 'R']) assert.ok(wp(rig, 'foot' + s).y > rig.restWorldPos['foot' + s].y - 2e-3 * rig.hipsHeight, 'pie ' + s);
});

test('fijar pies: ancla los pies apoyados y la cadera se mueve sin arrastrarlos', () => {
  const { rig, eng } = setup('gen_reposo');
  const H = rig.hipsHeight;
  for (const ch of ['footL', 'footR']) assert.ok(eng.footContacts(ch).length > 0, 'de pie, ' + ch + ' está apoyado');
  assert.ok(eng.lockFeet() >= 2);
  eng.evaluate(10);
  // el punto anclado (de pie, con la pierna estirada, el pie puede quedarse a milímetros: no llega)
  const feet = ['footL', 'footR'].map((c) => eng.ikState[c].target.clone());
  // bajar y desplazar la cadera: las piernas se doblan, los pies no se mueven
  const hips = rig.bone('hips');
  eng.evaluate(10, { ik: false });
  const local = hips.parent.worldToLocal(wp(rig, 'hips').add(new T.Vector3(0.05 * H, -0.12 * H, 0)));
  eng.keyBone(hips, null, local, 10);
  eng.evaluate(10);
  assert.ok(eng.ikState.footL.reach < 1 && eng.ikState.footR.reach < 1, 'las piernas llegan');
  ['footL', 'footR'].forEach((c, i) => assert.ok(wp(rig, c).distanceTo(feet[i]) < 2e-3 * H, c + ' se movió ' + wp(rig, c).distanceTo(feet[i]) / H));
  eng.unpinIK('footL');
  eng.unpinIK('footR');
  eng.evaluate(10);
  assert.ok(wp(rig, 'footL').distanceTo(feet[0]) > 0.05 * H, 'sin anclas, el pie sigue a la cadera');
});

test('curva propia: respeta los extremos, puede pasarse y se guarda en el enlace', () => {
  assert.ok(Math.abs(bezierEase([0.42, 0, 0.58, 1], 0)) < 1e-6 && Math.abs(bezierEase([0.42, 0, 0.58, 1], 1) - 1) < 1e-6);
  assert.ok(Math.abs(bezierEase([0.42, 0, 0.58, 1], 0.5) - 0.5) < 1e-3);
  let peak = 0;
  for (let u = 0; u <= 1; u += 0.02) peak = Math.max(peak, bezierEase([0.3, 0, 0.4, 1.35], u));
  assert.ok(peak > 1.02, 'se pasa del valor');
  const keys = [{ f: 0, v: [0, 0, 0, 1], i: 'bezier', b: [0.3, 0, 0.4, 1.35] }, { f: 10, v: new T.Quaternion().setFromEuler(new T.Euler(0, 0, 1)).toArray(), i: 'smooth' }];
  let maxAng = 0;
  for (let f = 0; f <= 10; f += 0.5) maxAng = Math.max(maxAng, 2 * Math.acos(Math.min(1, Math.abs(sampleTrack(keys, f, new T.Quaternion()).w))));
  assert.ok(maxAng > 1.02 && maxAng < 1.5, `giro máximo ${maxAng}`);
  // enlace: ancla, mezcla, curva propia, curva de tiempo y suelo sobreviven
  const { rig, eng } = setup();
  eng.pinIK('footL', 6, 12);
  eng.keyIKWeight('handR', 0.25, 4);
  const l = eng.layer();
  setKey(l, `r:${rig.mapping.head}`, 0, [0, 0, 0, 1], 'bezier');
  l.tracks[`r:${rig.mapping.head}`][0].b = [0.4, -0.35, 0.6, 1];
  setKey(l, `r:${rig.mapping.head}`, 9, [0, 0.2, 0, 0.98], 'out');
  eng.doc.strips[0].warp = [0.7, 0, 0.3, 1];
  eng.doc.floor = true;
  const back = hashToDoc('#' + docToHash(eng.doc, rig), rig);
  const bl = back.layers[0];
  assert.deepEqual(bl.tracks[`r:${rig.mapping.head}`][0].b, [0.4, -0.35, 0.6, 1]);
  assert.equal(bl.tracks[`r:${rig.mapping.head}`][1].i, 'out');
  assert.equal(bl.tracks['ik:handR:w'][0].v[0], 0.25);
  assert.equal(bl.tracks['ik:footL:absq'][0].v.length, 4);
  const q = new T.Quaternion().fromArray(bl.tracks['ik:footL:absq'][0].v);
  assert.ok(Math.abs(q.dot(new T.Quaternion().fromArray(l.tracks['ik:footL:absq'][0].v))) > 0.9999);
  assert.deepEqual(back.strips[0].warp, [0.7, 0, 0.3, 1]);
  assert.equal(back.floor, true);
});

// ---------- límites, cuerpo entero, tangentes por canal, pies en el sitio ----------
import { clampRel, limitDef, limitLocal } from '../src/core/limits.js';

test('límites: la rodilla dobla hacia atrás hasta 150° y casi nada hacia delante; el hombro no se retuerce', () => {
  const X = new T.Vector3(1, 0, 0);
  const knee = limitDef('lowerLegL');
  assert.equal(clampRel(new T.Quaternion().setFromAxisAngle(X, 1.5), knee).over, 0, 'flexión normal, intacta');
  const hyper = clampRel(new T.Quaternion().setFromAxisAngle(X, -0.7), knee);
  assert.ok(hyper.over > 0.5);
  assert.ok(2 * Math.acos(Math.abs(hyper.q.w)) < 0.08, 'queda casi recta');
  const tooMuch = clampRel(new T.Quaternion().setFromAxisAngle(X, 3), knee);
  assert.ok(Math.abs(2 * Math.acos(Math.abs(tooMuch.q.w)) - 150 * Math.PI / 180) < 1e-3);
  const twist = clampRel(new T.Quaternion().setFromAxisAngle(X, 2.6), limitDef('upperArmL'));
  assert.ok(Math.abs(2 * Math.acos(Math.abs(twist.q.w)) - 95 * Math.PI / 180) < 1e-3, 'torsión del brazo recortada a 95°');
  // sobre un personaje real: la pose de reposo está dentro de los límites
  const { rig, eng } = setup('gen_reposo');
  eng.evaluate(0);
  for (const c of ['lowerLegL', 'lowerArmR', 'head', 'spine', 'upperLegR']) assert.ok(limitLocal(rig, rig.bone(c), rig.bone(c).quaternion).over < 0.05, c);
});

test('cuerpo entero: si la mano no llega, la columna se inclina para que llegue', () => {
  const { rig, eng } = setup('gen_reposo');
  const H = rig.hipsHeight;
  eng.doc.ik.handR = true;
  eng.evaluate(0);
  const fwd = new T.Vector3(0, 0, 1).applyQuaternion(rig.Fq);
  const shoulder = wp(rig, 'upperArmR');
  const target = shoulder.clone().addScaledVector(fwd, eng.ikState.handR.length + 0.12 * H);
  eng.keyIK('handR', { pos: target }, 0);
  eng.doc.reach = false;
  eng.evaluate(0);
  const miss = wp(rig, 'handR').distanceTo(target);
  const spine0 = rig.bone('chest').quaternion.clone();
  eng.doc.reach = true;
  eng.evaluate(0);
  const hit = wp(rig, 'handR').distanceTo(target);
  assert.ok(miss > 0.08 * H, 'sin ayuda no llega');
  assert.ok(hit < miss * 0.5, `con el cuerpo llega mucho más cerca (${(hit / H).toFixed(3)} frente a ${(miss / H).toFixed(3)})`);
  assert.ok(rig.bone('chest').quaternion.angleTo(spine0) > 0.02, 'la columna se inclinó');
  // y sin objetivo nuevo no se inclina nada
  eng.layer().tracks = {};
  eng.evaluate(0);
  assert.ok(maxDiff([rig.bone('chest').quaternion.toArray()], [spine0.toArray()]) < 1e-12);
});

test('tangentes por canal: cada eje avanza con su curva, los extremos no cambian y viajan en el enlace', () => {
  const keys = [{ f: 0, v: [0, 0, 0], i: 'linear', bc: { 1: [0.9, 0, 1, 0.1] } }, { f: 10, v: [1, 1, 1], i: 'linear' }];
  const mid = sampleTrack(keys, 5, new T.Vector3());
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9 && Math.abs(mid.z - 0.5) < 1e-9, 'X y Z siguen uniformes');
  assert.ok(mid.y < 0.15, 'Y va con retraso');
  assert.deepEqual(sampleTrack(keys, 10, new T.Vector3()).toArray(), [1, 1, 1]);
  const q1 = new T.Quaternion().setFromEuler(new T.Euler(0.4, 0.8, -0.3));
  const qk = [{ f: 0, v: [0, 0, 0, 1], i: 'smooth', bc: { 0: [0.2, 0.8, 0.4, 1] } }, { f: 8, v: q1.toArray(), i: 'smooth' }];
  assert.ok(sampleTrack(qk, 8, new T.Quaternion()).angleTo(q1) < 1e-9);
  const e = new T.Euler().setFromQuaternion(sampleTrack(qk, 2, new T.Quaternion()));
  assert.ok(e.x / 0.4 > e.y / 0.8 + 0.2, 'el canal X va por delante del Y');
  const { rig, eng } = setup();
  const l = eng.layer();
  l.tracks[`r:${rig.mapping.head}`] = qk.map((k) => ({ ...k }));
  eng.doc.collide = true;
  const back = hashToDoc('#' + docToHash(eng.doc, rig), rig);
  assert.deepEqual(back.layers[0].tracks[`r:${rig.mapping.head}`][0].bc, { 0: [0.2, 0.8, 0.4, 1] });
  assert.equal(back.collide, true);
});

test('pies en clips «en el sitio»: se detectan los apoyos y el ancla solo fija la altura', () => {
  const { rig, eng } = setup('gen_reposo', true);
  assert.ok(eng.lockFeet() >= 2);
  assert.equal(eng.doc.pinY.footL, true);
  eng.evaluate(20);
  const st = eng.ikState.footL;
  assert.ok(st.pin > 0.99);
  assert.ok(Math.abs(st.target.x - st.fkEnd.x) < 1e-9 && Math.abs(st.target.z - st.fkEnd.z) < 1e-9, 'en horizontal sigue a la animación');
});
