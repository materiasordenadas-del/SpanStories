// Motion Planning (grafo con condiciones), Look At y Reach Target: núcleo, sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { Rig } from '../src/core/rig.js';
import { Engine } from '../src/core/animation.js';
import { proceduralClips } from '../src/core/procedural.js';
import { newDirector, compileDirector, checkCondition, sampleRoot } from '../src/core/director.js';

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
function setup() {
  const rig = skeleton(new URL('../../../../SpanStories-Ciudades/assets/avatar/rachel.glb', import.meta.url));
  const lib = new Map(proceduralClips().map((c) => [c.id, c]));
  const eng = new Engine(rig, lib);
  eng.doc.director = newDirector();
  const yawOf = (dx, dz) => {
    const v = new T.Vector3(dx, 0, dz).applyQuaternion(rig.FqInv);
    return Math.atan2(v.x, v.z);
  };
  const compile = (extra = {}) => compileDirector(eng.doc, lib, { H: rig.hipsHeight, yawOf, ...extra });
  return { rig, eng, lib, compile, d: eng.doc.director };
}
/** Hacia dónde mira la cabeza, en el mundo. */
function headForward(rig) {
  const head = rig.bone('head');
  head.updateWorldMatrix(true, false);
  const q = head.getWorldQuaternion(new T.Quaternion()).multiply(rig.restWorldQ.head.clone().invert());
  return rig.frame.fwd.clone().setY(0).normalize().applyQuaternion(q).normalize();
}
const world = (rig, p) => new T.Vector3(p[0] + rig.restWorldPos.hips.x, p[1], p[2] + rig.restWorldPos.hips.z);

test('una lista simple sigue siendo un plan: los pasos se encadenan en orden', () => {
  const { d, compile } = setup();
  d.steps = [{ id: 'a', type: 'goto', to: [0, 2] }, { id: 'b', type: 'wait', seconds: 1 }];
  const out = compile();
  assert.deepEqual(out.order, ['a', 'b']);
  assert.ok(out.steps.every((s) => s.ran));
  assert.equal(out.steps[1].f0, out.steps[0].f1 + 1);
});

test('Check Distance: la condición elige la rama según dónde está el personaje en ese momento', () => {
  const { d, compile } = setup();
  d.targets = [{ id: 'silla', name: 'Silla', pos: [0, 0.45, 3] }];
  d.steps = [
    { id: 'ir', type: 'goto', to: [0, 2.4] },
    { id: 'cerca', type: 'if', check: 'distance', b: 'silla', op: 'lt', value: 1, yes: 'sentar', no: 'esperar' },
    { id: 'esperar', type: 'wait', seconds: 1, next: null },
    { id: 'sentar', type: 'action', clip: 'gen_sentado', seat: 0.45 },
  ];
  let out = compile();
  assert.deepEqual(out.order, ['ir', 'cerca', 'sentar']);
  assert.equal(out.steps[1].result, true);
  assert.equal(out.steps[2].ran, false, 'la rama que no se toma no se ejecuta');
  // el mismo plan con el personaje lejos toma la otra rama
  d.steps[0].to = [0, 0.5];
  out = compile();
  assert.deepEqual(out.order, ['ir', 'cerca', 'esperar']);
  assert.equal(out.steps[3].ran, false);
});

test('Ir a un objetivo deteniéndose antes y mirando hacia él', () => {
  const { d, compile, eng } = setup();
  d.targets = [{ id: 'mateo', name: 'Mateo', pos: [3, 1.5, 0] }];
  d.steps = [{ id: 'ir', type: 'goto', target: 'mateo', stop: 0.8 }];
  const out = compile();
  assert.ok(Math.abs(out.final.x - 2.2) < 0.03, `se queda a 0,8 m: x = ${out.final.x}`);
  assert.ok(Math.abs(out.final.z) < 0.03);
  const r = sampleRoot(eng.doc.root, out.end);
  assert.ok(Math.abs(r.x - 2.2) < 0.03);
});

test('condiciones: posición, zona, ocupación y decisión', () => {
  const d = { targets: [{ id: 'p', pos: [1, 0, 1] }, { id: 'z', pos: [0, 0, 0], r: 2 }, { id: 'caja', pos: [1.1, 0, 1], solid: true }] };
  const st = { x: 1, z: 1.2, vars: { saluda: true } };
  assert.equal(checkCondition({ check: 'position', b: 'p' }, st, d), true);
  assert.equal(checkCondition({ check: 'position', b: 'p', value: 0.1 }, st, d), false);
  assert.equal(checkCondition({ check: 'zone', b: 'z' }, st, d), true);
  assert.equal(checkCondition({ check: 'zone', b: 'z', exit: true }, st, d), false);
  assert.equal(checkCondition({ check: 'placement', b: 'p' }, st, d), true, 'la caja ocupa el sitio');
  assert.equal(checkCondition({ check: 'placement', b: 'z' }, st, d), false);
  assert.equal(checkCondition({ check: 'placement', b: 'z' }, st, d, { occupied: () => true }), true);
  assert.equal(checkCondition({ check: 'bool', var: 'saluda' }, st, d), true);
  assert.equal(checkCondition({ check: 'bool', var: 'otra' }, st, d), false);
  assert.equal(checkCondition({ check: 'distance', a: 'p', b: 'caja', op: 'lt', value: 0.2 }, st, d), true);
});

test('una decisión (variable) cambia el camino del plan y un bucle sin fin se corta', () => {
  const { d, compile } = setup();
  d.steps = [
    { id: 'set', type: 'set', var: 'acepta', value: true },
    { id: 'si', type: 'if', check: 'bool', var: 'acepta', yes: 'saluda', no: 'fin' },
    { id: 'saluda', type: 'action', clip: 'gen_saludar' },
    { id: 'fin', type: 'wait', seconds: 0.5 },
  ];
  assert.deepEqual(compile().order, ['set', 'si', 'saluda', 'fin']);
  d.steps[0].value = false;
  assert.deepEqual(compile().order, ['set', 'si', 'fin']);
  // bucle: esperar → esperar → …
  d.steps = [{ id: 'w', type: 'wait', seconds: 0.2, next: 'w' }];
  const out = compile();
  assert.equal(out.cut, true);
  assert.ok(out.end > 0 && out.end < 400);
});

test('Look At: la cabeza gira hacia el objetivo, con tope, y vuelve al soltar', () => {
  const { d, compile, eng, rig } = setup();
  d.targets = [{ id: 'puerta', name: 'Puerta', pos: [2, 1.5, 2] }, { id: 'atras', name: 'Atrás', pos: [0, 1.5, -3] }];
  d.steps = [{ id: 'q', type: 'wait', seconds: 3 }];
  d.aims = [{ id: 'm1', ch: 'look', f: 10, target: 'puerta', blend: 0.4 }, { id: 'm2', ch: 'look', f: 60, target: null, blend: 0.4 }];
  compile();
  assert.equal(eng.doc.aim.look.length, 2);
  eng.evaluate(5);
  const before = headForward(rig);
  eng.evaluate(40);
  const during = headForward(rig);
  const head = rig.bone('head').getWorldPosition(new T.Vector3());
  const want = world(rig, d.targets[0].pos).sub(head).normalize();
  assert.ok(during.dot(want) > before.dot(want) + 0.2, 'mira más hacia la puerta que antes');
  assert.ok(during.dot(want) > 0.93, `casi de frente al objetivo: ${during.dot(want).toFixed(3)}`);
  // mitad de la transición: a medio camino
  eng.evaluate(16);
  const mid = headForward(rig).dot(want);
  assert.ok(mid > before.dot(want) && mid < during.dot(want));
  eng.evaluate(85);
  const released = headForward(rig);
  const aim = eng.doc.aim;
  delete eng.doc.aim;
  eng.evaluate(85);
  assert.ok(headForward(rig).distanceTo(released) < 1e-6, 'al soltar vuelve a la animación');
  eng.doc.aim = aim;
  // un objetivo a la espalda no retuerce el cuello
  d.aims = [{ id: 'm3', ch: 'look', f: 0, target: 'atras', blend: 0 }];
  compile();
  eng.evaluate(30);
  assert.ok(headForward(rig).dot(before) > 0.95, 'no gira hacia atrás');
});

test('Look At es estable: el mismo fotograma da la misma pose sin importar el orden', () => {
  const { d, compile, eng, rig } = setup();
  d.targets = [{ id: 't', name: 'T', pos: [-1.5, 1.2, 1.5] }];
  d.steps = [{ id: 'q', type: 'wait', seconds: 2 }, { id: 'l', type: 'look', target: 't' }, { id: 'q2', type: 'wait', seconds: 2 }];
  compile();
  eng.evaluate(80);
  const a = headForward(rig);
  eng.evaluate(10);
  eng.evaluate(110);
  eng.evaluate(80);
  assert.ok(headForward(rig).distanceTo(a) < 1e-6);
});

test('Reach Target: la mano llega al objetivo y lo sigue si se mueve', () => {
  const { d, compile, eng, rig } = setup();
  const H = rig.hipsHeight;
  d.targets = [{ id: 'libro', name: 'Libro', pos: [-0.25 * H, H * 1.2, 0.5 * H] }];
  d.steps = [{ id: 'q', type: 'wait', seconds: 1 }, { id: 'r', type: 'reach', hand: 'R', target: 'libro', hold: 1 }, { id: 's', type: 'reach', hand: 'R', target: null, hold: 1 }];
  const out = compile();
  assert.equal(eng.doc.aim.handR.length, 2);
  const hand = rig.bone('handR');
  const palm = () => hand.getWorldPosition(new T.Vector3());
  eng.evaluate(out.steps[0].f1);
  const far = palm().distanceTo(world(rig, d.targets[0].pos));
  eng.evaluate(out.steps[1].f1);
  const near = palm().distanceTo(world(rig, d.targets[0].pos));
  assert.ok(near < 0.12 * H, `la muñeca queda junto al objetivo: ${near.toFixed(3)} (antes ${far.toFixed(3)})`);
  // el objetivo se mueve: la mano va detrás
  const here = palm();
  const to = [d.targets[0].pos[0] - 0.05 * H, d.targets[0].pos[1] + 0.1 * H, d.targets[0].pos[2] + 0.05 * H];
  eng.resolveTarget = (t, o) => o.copy(world(rig, to));
  eng.evaluate(out.steps[1].f1);
  assert.ok(palm().distanceTo(world(rig, to)) < 0.12 * H, `sigue al objetivo movido: ${palm().distanceTo(world(rig, to)).toFixed(3)}`);
  assert.ok(palm().distanceTo(here) > 0.08 * H);
  eng.resolveTarget = null;
  // al soltar vuelve a la animación
  eng.evaluate(out.end);
  assert.ok(palm().distanceTo(world(rig, d.targets[0].pos)) > near + 0.1 * H);
  assert.equal(eng.doc.ik.handR, false, 'no enciende el IK del documento');
});

test('los nodos narrativos dejan marcas con su fotograma', () => {
  const { d, compile, eng } = setup();
  d.steps = [{ id: 'a', type: 'wait', seconds: 1 }, { id: 'n', type: 'note', kind: 'dialog', text: '¿Cómo te llamas?', seconds: 2 }, { id: 'e', type: 'note', kind: 'emotion', text: 'alegría' }];
  const out = compile();
  assert.equal(eng.doc.cues.length, 2);
  assert.equal(eng.doc.cues[0].f, out.steps[1].f0);
  assert.equal(eng.doc.cues[0].frames, 60);
});

test('sin pasos, la mirada puesta a mano se compila sin tocar las tiras', () => {
  const { d, compile, eng } = setup();
  eng.doc.strips = [{ id: 's', clipId: 'gen_reposo', start: 0, len: 60, blend: 0, speed: 1, loop: true }];
  d.targets = [{ id: 't', name: 'T', pos: [1, 1.4, 1] }];
  d.aims = [{ id: 'm', ch: 'look', f: 0, target: 't' }];
  compile();
  assert.equal(eng.doc.strips.length, 1);
  assert.equal(eng.doc.aim.look.length, 1);
  assert.equal(eng.doc.root, undefined);
});
