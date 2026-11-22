// Motion Director: destinos, caminos y secuencia de acciones (núcleo, sin navegador).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { Rig } from '../src/core/rig.js';
import { Engine } from '../src/core/animation.js';
import { proceduralClips } from '../src/core/procedural.js';
import { newDirector, compileDirector, samplePath, pointAt, nearestOnPath, sampleRoot, angleDiff, clipSpeed } from '../src/core/director.js';

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
  const compile = () => compileDirector(eng.doc, lib, { H: rig.hipsHeight, yawOf });
  return { rig, eng, lib, compile };
}
const hips = (rig) => rig.bone('hips').getWorldPosition(new T.Vector3());
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (±${tol})`);

test('un camino curvo pasa por sus puntos y mide su longitud', () => {
  const sp = samplePath([[0, 0], [2, 0], [2, 2]], { curve: true });
  assert.ok(sp.total > 3.5 && sp.total < 4.6, `longitud ${sp.total}`);
  const mid = nearestOnPath(sp, 2, 0);
  assert.ok(mid.dist < 0.03, 'pasa por el punto intermedio');
  const end = pointAt(sp, sp.total);
  near(end.x, 2, 1e-6);
  near(end.z, 2, 1e-6);
  const recto = samplePath([[0, 0], [3, 4]], { curve: false });
  near(recto.total, 5, 1e-6, 'recta 3-4-5');
  const cerrado = samplePath([[0, 0], [2, 0], [2, 2], [0, 2]], { curve: false, closed: true });
  near(cerrado.total, 8, 1e-6, 'cuadrado cerrado');
});

test('ir a un destino: el personaje llega y mira hacia donde anda', () => {
  const { rig, eng, compile } = setup();
  eng.doc.director.steps = [{ id: 'a', type: 'goto', to: [0, 3] }];
  const out = compile();
  assert.equal(eng.doc.strips.length, 1);
  assert.equal(eng.doc.strips[0].clipId, 'gen_caminar');
  assert.ok(eng.doc.strips[0].loop, 'camina en bucle');
  eng.evaluate(0);
  const p0 = hips(rig);
  eng.evaluate(out.end);
  const p1 = hips(rig);
  const rest = rig.restWorldPos.hips;
  near(p0.x, rest.x, 0.06, 'empieza en su sitio (x)');
  near(p0.z, rest.z, 0.06, 'empieza en su sitio (z)');
  near(p1.x - rest.x, 0, 0.08, 'llega (x)');
  near(p1.z - rest.z, 3, 0.08, 'llega (z)');
  // velocidad natural del paso: sin patinar
  const speed = clipSpeed(eng.library.get('gen_caminar'), rig.hipsHeight);
  near(out.end / eng.doc.fps, 3 / speed, 0.1, 'tarda lo que tarda andando');
});

test('destino a un lado: gira en el sitio antes de andar y acaba mirando al destino', () => {
  const { eng, compile } = setup();
  eng.doc.director.steps = [{ id: 'a', type: 'goto', to: [3, 0] }];
  const out = compile();
  assert.equal(eng.doc.strips.length, 2, 'una tira de giro y otra andando');
  const fin = sampleRoot(eng.doc.root, out.end);
  near(angleDiff(fin.yaw, Math.PI / 2), 0, 0.02, 'mira hacia +X');
  near(fin.x, 3, 1e-3);
  near(fin.z, 0, 1e-3);
  // durante el giro no se desplaza
  const giro = eng.doc.strips[0];
  const a = sampleRoot(eng.doc.root, giro.start);
  const b = sampleRoot(eng.doc.root, giro.start + 3);
  near(a.x, b.x, 1e-6);
  assert.ok(Math.abs(angleDiff(a.yaw, b.yaw)) > 0.05, 'gira');
});

test('caminar, saltar y sentarse: tres pasos encadenados en el destino', () => {
  const { rig, eng, compile } = setup();
  eng.doc.director.steps = [
    { id: 'ir', type: 'goto', to: [1, 2.5] },
    { id: 'salto', type: 'action', clip: 'gen_saltar' },
    { id: 'silla', type: 'action', clip: 'gen_sentado', hold: 1 },
  ];
  const out = compile();
  const [ir, salto, silla] = out.steps;
  assert.equal(ir.f0, 0);
  assert.equal(salto.f0, ir.f1 + 1, 'el salto empieza al llegar');
  assert.equal(silla.f0, salto.f1 + 1, 'se sienta al acabar el salto');
  const clips = eng.doc.strips.map((s) => s.clipId);
  assert.deepEqual(clips.slice(-2), ['gen_saltar', 'gen_sentado']);
  assert.ok(eng.doc.strips.at(-1).anchor && !eng.doc.strips.at(-1).inPlace, 'las acciones empiezan donde está');
  const rest = rig.restWorldPos.hips;
  // en pleno salto está en el destino y más alto que de pie
  let top = -Infinity;
  for (let f = salto.f0; f <= salto.f1; f++) {
    eng.evaluate(f);
    const p = hips(rig);
    top = Math.max(top, p.y);
    near(p.x - rest.x, 1, 0.25, `salta en el destino (x, f${f})`);
    near(p.z - rest.z, 2.5, 0.25, `salta en el destino (z, f${f})`);
  }
  assert.ok(top > rest.y + 0.05, `despega del suelo (${top} > ${rest.y})`);
  // sentado: la cadera baja y sigue en el destino
  eng.evaluate(silla.f1);
  const s = hips(rig);
  assert.ok(s.y < rest.y - 0.15, `sentado, la cadera baja (${s.y} < ${rest.y})`);
  near(s.x - rest.x, 1, 0.3, 'sentado en el destino (x)');
  near(s.z - rest.z, 2.5, 0.3, 'sentado en el destino (z)');
});

test('sentarse en un asiento: la cadera queda a la altura de la silla', () => {
  const { rig, eng, compile } = setup();
  eng.doc.director.steps = [{ id: 'silla', type: 'action', clip: 'gen_sentado', seat: 0.45 }, { id: 'ir', type: 'goto', to: [0, 2] }];
  const out = compile();
  eng.evaluate(out.steps[0].f1);
  near(hips(rig).y, 0.45 + 0.1 * rig.hipsHeight, 0.03, 'cadera sobre el asiento');
  // al levantarse y andar vuelve a su altura
  eng.evaluate(out.end);
  near(hips(rig).y, rig.restWorldPos.hips.y, 0.08, 'de pie otra vez');
});

test('recorrer un camino: sigue la curva y se puede recorrer solo un tramo', () => {
  const { eng, compile } = setup();
  const d = eng.doc.director;
  d.paths = [{ id: 'p1', name: 'Camino', points: [[0, 1], [2, 2], [4, 1]], curve: true }];
  d.steps = [{ id: 'r', type: 'path', path: 'p1' }];
  const out = compile();
  const sp = samplePath(d.paths[0].points, { curve: true });
  // a mitad del recorrido está sobre el camino
  const mitad = sampleRoot(eng.doc.root, Math.round(out.end * 0.6));
  assert.ok(nearestOnPath(sp, mitad.x, mitad.z).dist < 0.06, 'va por el camino');
  const fin = sampleRoot(eng.doc.root, out.end);
  near(fin.x, 4, 1e-3);
  near(fin.z, 1, 1e-3);
  // solo un tramo, y luego vuelta atrás
  d.steps = [{ id: 'r', type: 'path', path: 'p1', from: 0, to: sp.total / 2 }, { id: 'v', type: 'path', path: 'p1', from: sp.total / 2, to: 0 }];
  const out2 = compile();
  const vuelta = sampleRoot(eng.doc.root, out2.end);
  near(vuelta.x, 0, 1e-3, 'vuelve al principio');
  near(vuelta.z, 1, 1e-3);
});

test('sin plan, la raíz no cambia nada', () => {
  const { rig, eng } = setup();
  const c = eng.library.get('gen_caminar');
  eng.doc.strips = [{ id: 's', clipId: 'gen_caminar', start: 0, len: c.frames, blend: 0, speed: 1, loop: true, inPlace: false, mirror: false, reverse: false }];
  eng.evaluate(10);
  const a = rig.bones.map((b) => b.quaternion.toArray());
  eng.doc.root = { v: [] };
  eng.evaluate(10);
  const b = rig.bones.map((x) => x.quaternion.toArray());
  assert.deepEqual(a, b);
});

test('sentarse con transiciones: clip de sentarse, bucle sentado (también en la espera) y levantarse antes de moverse', () => {
  const { eng, lib, rig } = setup();
  // los clips generados hacen de mocap: solo importa el encadenado
  eng.doc.director.steps = [
    { id: 's', type: 'action', clip: 'gen_sentado', hold: 1, seat: 0.45, sitIn: 'gen_saltar', sitOut: 'gen_saludar' },
    { id: 'w', type: 'wait', seconds: 1 },
    { id: 't', type: 'turn', yaw: 1.5 },
  ];
  const yawOf = (dx, dz) => Math.atan2(dx, dz);
  compileDirector(eng.doc, lib, { H: rig.hipsHeight, yawOf });
  const ids = eng.doc.strips.map((s) => s.clipId);
  assert.deepEqual(ids.slice(0, 3), ['gen_saltar', 'gen_sentado', 'gen_saludar'], `orden ${ids}`);
  const loop = eng.doc.strips[1];
  assert.ok(loop.len >= 2 * 30 - 2, 'la espera sigue sentada en el mismo bucle');
  const up = eng.doc.strips[2];
  const ys = eng.doc.root.y;
  assert.ok(ys[loop.start + 5] !== 0, 'sentado: la cadera se ajusta al asiento');
  near(ys[up.start + up.len - 1] || 0, 0, 1e-3, 'de pie al acabar de levantarse');
});

test('ir a un destino con ruta: rodea el obstáculo por los puntos que da el escenario', () => {
  const { eng, lib, rig } = setup();
  eng.doc.director.steps = [{ id: 'a', type: 'goto', to: [0, 4] }];
  const yawOf = (dx, dz) => Math.atan2(dx, dz);
  const route = (from, to) => [from, [1.5, 2], to];
  const recto = compileDirector(eng.doc, lib, { H: rig.hipsHeight, yawOf });
  const rodeo = compileDirector(eng.doc, lib, { H: rig.hipsHeight, yawOf, route });
  near(recto.length, 4, 0.05, 'en línea recta');
  near(rodeo.length, 2 * Math.hypot(1.5, 2), 0.05, 'por el desvío');
  near(rodeo.final.x, 0, 0.02);
  near(rodeo.final.z, 4, 0.02);
});
