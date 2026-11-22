import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildStudioRehearsal } from '../demo.ts';
import { sampleSequence } from '../director.ts';
import { validateProject, type Actor, type StudioProject } from '../model.ts';
import { addScene, deleteActor, duplicateScene } from '../editing.ts';
import { placeActor, mountProblem } from '../mount.ts';
import { checkDirection } from '../checks.ts';
import { replaceBehaviorRefs } from '../facial-usage.ts';
import { newHistoria, validateHistoria } from '../historia.ts';
import type { BehaviorReference } from '../behavior.ts';

/** P1 · C4: jinete ↔ montura explícito; C7: reemplazo limitado a cues marcados; C8: sin tocar historia.json. */
const near = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

function mountedScene() {
  const { source, project } = buildStudioRehearsal('airport');
  const scene = project.scenes[0];
  const actor = (id: string, characterId: string, x: number, z = 2): Actor => ({ id, characterId, name: id, position: [x, 0, z], rotation: 0, height: 1.7 });
  // Quijote monta a Rocinante; Sancho va a pie junto a Rucio (un burro: el nombre ya no decide nada).
  scene.actors = [actor('quijote', 'don-quijote', 0.2, 2.1), actor('rocinante', 'rocinante', 0), actor('sancho', 'sancho', 3), actor('rucio', 'rucio', 4)];
  scene.actors[0].montura = { caballoId: 'rocinante' };
  return { source, project, scene };
}

test('C4 · validación del vínculo', () => {
  const { source, project, scene } = mountedScene();
  validateProject(project, source);
  assert.equal(mountProblem({ id: 'a', montura: { caballoId: 'a' } }, [{ id: 'a' }]), 'Un personaje no puede montarse a sí mismo.');
  const bad = (fn: (p: StudioProject) => void) => { const copy = structuredClone(project); fn(copy); assert.throws(() => validateProject(copy, source)); };
  bad(p => { p.scenes[0].actors[0].montura = { caballoId: 'nadie' }; });
  bad(p => { p.scenes[0].actors[2].montura = { caballoId: 'rocinante' }; }); // dos jinetes en la misma montura
  bad(p => { p.scenes[0].actors[1].montura = { caballoId: 'rucio' }; });     // la montura no puede ir montada
  bad(p => { (p.scenes[0].actors[0] as { montura: unknown }).montura = { caballoId: 'rocinante', extra: 1 }; });
  assert.ok(scene.actors[0].montura);
});

test('C4 · anclaje por la pelvis: el jinete va con el caballo conservando su desfase sobre la silla', () => {
  const { source, project, scene } = mountedScene();
  const seq = scene.sequences[0];
  seq.cues.push({ id: 'cab-anda', kind: 'actor', actorId: 'rocinante', action: 'walk', at: 0, duration: 2, destination: [0, 0, 6], rotation: Math.PI / 2 });
  validateProject(project, source);
  const end = sampleSequence(project, 0, 2.5).actors;
  const horse = end.find(a => a.id === 'rocinante')!, rider = end.find(a => a.id === 'quijote')!;
  assert.ok(near(horse.position, [0, 0, 6]));
  // Desfase local (0.2, 0.1) girado 90°: rotación del motor = atan2(x, z) → (x,z) local (0.2,0.1) pasa a (0.1,-0.2).
  assert.ok(near(rider.position, [0.1, 0, 5.8]), JSON.stringify(rider.position));
  assert.ok(Math.abs(rider.rotation - Math.PI / 2) < 1e-6);
  // A mitad de camino también va pegado (mismo desfase local en cada instante).
  const mid = sampleSequence(project, 0, 1).actors, h = mid.find(a => a.id === 'rocinante')!, r = mid.find(a => a.id === 'quijote')!;
  const dx = r.position[0] - h.position[0], dz = r.position[2] - h.position[2], c = Math.cos(-h.rotation), s = Math.sin(-h.rotation);
  assert.ok(near([dx * c + dz * s, -dx * s + dz * c], [0.2, 0.1]));
  // Sancho (a pie) no se ve afectado.
  assert.ok(near(end.find(a => a.id === 'sancho')!.position, [3, 0, 2]));
  const available = { characters: scene.actors.map(a => a.characterId), scenarios: [scene.zoneId], audio: [] };
  assert.ok(!checkDirection(project, source, available).some(w => w.message.includes('quijote camina')));
  // Una caminata del jinete a la vez que la del caballo se suma: se avisa.
  seq.cues.push({ id: 'qui-anda', kind: 'actor', actorId: 'quijote', action: 'walk', at: 1, duration: 2, destination: [1, 0, 1] });
  assert.ok(checkDirection(project, source, available).some(w => w.message.includes('quijote camina mientras rocinante también anda')));
});

test('C4 · el jinete tiene movimiento propio (giro y recolocación) sin soltar el vínculo', () => {
  const { source, project, scene } = mountedScene();
  const seq = scene.sequences[0];
  // 1) El jinete gira 45°: se aplica (antes se ignoraba).
  seq.cues.push({ id: 'qui-gira', kind: 'actor', actorId: 'quijote', action: 'idle', at: 0, duration: 1, rotation: Math.PI / 4 });
  validateProject(project, source);
  const turned = sampleSequence(project, 0, 1.5).actors.find(a => a.id === 'quijote')!;
  assert.ok(Math.abs(turned.rotation - Math.PI / 4) < 1e-6, String(turned.rotation));
  assert.ok(near(turned.position, [0.2, 0, 2.1]));
  // 2) Después anda el caballo y gira 90°: el jinete conserva su giro relativo (45° + 90°) y su desfase local.
  seq.cues.push({ id: 'cab-anda', kind: 'actor', actorId: 'rocinante', action: 'walk', at: 2, duration: 2, destination: [0, 0, 6], rotation: Math.PI / 2 });
  const end = sampleSequence(project, 0, 5).actors, rider = end.find(a => a.id === 'quijote')!;
  assert.ok(Math.abs(rider.rotation - 3 * Math.PI / 4) < 1e-6, String(rider.rotation));
  assert.ok(near(rider.position, [0.1, 0, 5.8]), JSON.stringify(rider.position));
  assert.ok(end.find(a => a.id === 'quijote')!.montura?.caballoId === 'rocinante');
  // 3) Una caminata corta del jinete con el caballo quieto mueve solo al jinete.
  const still = mountedScene();
  still.scene.sequences[0].cues.push({ id: 'qui-ajusta', kind: 'actor', actorId: 'quijote', action: 'walk', at: 0, duration: 1, destination: [0, 0, 2.3] });
  validateProject(still.project, still.source);
  const s = sampleSequence(still.project, 0, 2).actors;
  assert.ok(near(s.find(a => a.id === 'quijote')!.position, [0, 0, 2.3]));
  assert.ok(near(s.find(a => a.id === 'rocinante')!.position, [0, 0, 2]));
});

test('C4 · editar en el Estudio: mover o girar la montura arrastra al jinete; borrarla suelta el vínculo', () => {
  const { source, project, scene } = mountedScene();
  placeActor(scene.actors, 'rocinante', { position: [5, 0, 5] });
  assert.ok(near(scene.actors[0].position, [5.2, 0, 5.1]));
  placeActor(scene.actors, 'rocinante', { rotation: Math.PI });
  assert.ok(near(scene.actors[0].position, [4.8, 0, 4.9]));
  // Mover al jinete solo cambia su desfase sobre la silla, no al caballo.
  placeActor(scene.actors, 'quijote', { position: [5, 0, 5] });
  assert.ok(near(scene.actors[1].position, [5, 0, 5]));
  assert.ok(near(scene.actors[0].position, [5, 0, 5]));
  // Girar al jinete solo cambia su rumbo; el caballo no se mueve. Después, mover el caballo lo lleva con el nuevo desfase.
  placeActor(scene.actors, 'quijote', { rotation: 0.5 });
  assert.equal(scene.actors[1].rotation, Math.PI);
  // Desfase no nulo: el jinete 0.4 m a un lado de la silla. Al girar el caballo de π a π/2 el desfase gira con él.
  placeActor(scene.actors, 'quijote', { position: [5.4, 0, 5] });
  placeActor(scene.actors, 'rocinante', { position: [6, 0, 5], rotation: Math.PI / 2 });
  assert.ok(near(scene.actors[0].position, [6, 0, 5.4]), JSON.stringify(scene.actors[0].position));
  assert.ok(Math.abs(scene.actors[0].rotation - (0.5 - Math.PI / 2)) < 1e-9);
  const after = deleteActor(project, scene.id, 'rocinante');
  assert.equal(after.scenes[0].actors.find(a => a.id === 'quijote')!.montura, undefined);
  validateProject(after, source);
});

test('C4 · una historia sin vínculos se comporta igual que antes', () => {
  const { source, project, scene } = mountedScene();
  delete scene.actors[0].montura;
  scene.sequences[0].cues.push({ id: 'qui-anda', kind: 'actor', actorId: 'quijote', action: 'walk', at: 0, duration: 2, destination: [-10, 0, -10] });
  validateProject(project, source);
  assert.ok(near(sampleSequence(project, 0, 3).actors.find(a => a.id === 'quijote')!.position, [-10, 0, -10]));
});

test('C4 · duplicar o copiar una escena conserva la pareja con los ids nuevos', () => {
  const { source, project, scene } = mountedScene();
  for (const next of [duplicateScene(project, scene.id), addScene(project, scene.id, 'copy').project]) {
    validateProject(next, source);
    const copy = next.scenes[1], rider = copy.actors.find(a => a.montura)!;
    assert.notEqual(rider.id, 'quijote');
    assert.equal(copy.actors.find(a => a.id === rider.montura!.caballoId)?.characterId, 'rocinante');
  }
});

const ref = (id: string, characterId = 'don-quijote'): BehaviorReference => ({ id, name: 'Saludo', characterId, duration: 2, url: `http://127.0.0.1:5189/ecosystem/assets/${id}.json`, review: { status: 'unreviewed' }, revision: 0 });
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';

test('C7 · el reemplazo solo toca los cues marcados (y sin cueIds, todos, como antes)', () => {
  const { project, scene } = mountedScene();
  scene.sequences[0].cues.push({ id: 'c1', kind: 'actor', actorId: 'quijote', action: 'idle', at: 0, duration: 2, behavior: ref(A) },
    { id: 'c2', kind: 'actor', actorId: 'quijote', action: 'idle', at: 3, duration: 2, behavior: ref(A) });
  const scoped = structuredClone(project);
  assert.equal(replaceBehaviorRefs(scoped, [{ from: A, to: ref(B), cueIds: ['c1'] }]), 1);
  const cues = scoped.scenes[0].sequences[0].cues.filter(c => c.kind === 'actor');
  assert.deepEqual(cues.map(c => c.kind === 'actor' && c.behavior?.id), [B, A]);
  const all = structuredClone(project);
  assert.equal(replaceBehaviorRefs(all, [{ from: A, to: ref(B) }]), 2);
});

test('C8 · el reemplazo en disco no toca historia.json ni su revisión; escribe el autoguardado', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spanstories-usos-')), cwd = process.cwd();
  process.chdir(dir);
  const { POST } = await import('../../../app/api/historias/usos-faciales/route.ts');
  process.chdir(cwd);
  const env = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'development' });
  t.after(async () => { Object.assign(process.env, { NODE_ENV: env }); await rm(dir, { recursive: true, force: true }); });
  const h = newHistoria({ name: 'Quijote', plantilla: 'aeropuerto', id: 'quijote-p1-abcd' });
  const scene = h.project.scenes[0];
  scene.actors = [{ id: 'quijote', characterId: 'don-quijote', name: 'Quijote', position: [0, 0, 0], rotation: 0, height: 1.7 }];
  scene.sequences[0].cues.push({ id: 'c1', kind: 'actor', actorId: 'quijote', action: 'idle', at: 0, duration: 2, behavior: ref(A) },
    { id: 'c2', kind: 'actor', actorId: 'quijote', action: 'idle', at: 3, duration: 2, behavior: ref(A) });
  h.revision = 4; h.project.revision = 4;
  validateHistoria(JSON.parse(JSON.stringify(h)));
  const folder = path.join(dir, 'Estudio/Historias', h.id);
  await mkdir(folder, { recursive: true });
  const saved = JSON.stringify(h);
  await writeFile(path.join(folder, 'historia.json'), saved);
  const post = (body: unknown) => POST(new Request('http://localhost:3000/api/historias/usos-faciales', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) }));
  const r = await post({ id: h.id, pares: [{ from: A, to: ref(B), cueIds: ['c2'] }] });
  assert.equal(r.status, 200); assert.equal((await r.json()).count, 1);
  assert.equal(await readFile(path.join(folder, 'historia.json'), 'utf8'), saved, 'historia.json intacto');
  const auto = validateHistoria(JSON.parse(await readFile(path.join(folder, 'autoguardado.json'), 'utf8')));
  assert.equal(auto.revision, 4, 'misma revisión: el autoguardado de una pestaña abierta no queda «antiguo»');
  const ids = auto.project.scenes[0].sequences[0].cues.flatMap(c => c.kind === 'actor' ? [c.behavior?.id] : []);
  assert.deepEqual(ids, [A, B]);
  // Segunda pasada parte del autoguardado (no pierde la primera).
  await post({ id: h.id, pares: [{ from: A, to: ref(B), cueIds: ['c1'] }] });
  const auto2 = validateHistoria(JSON.parse(await readFile(path.join(folder, 'autoguardado.json'), 'utf8')));
  assert.deepEqual(auto2.project.scenes[0].sequences[0].cues.flatMap(c => c.kind === 'actor' ? [c.behavior?.id] : []), [B, B]);
  assert.equal((await post({ id: h.id, pares: [{ from: A, to: ref(B), cueIds: [1] }] })).status, 400);
  // Autoguardado obsoleto (revisión menor que el guardado): se parte del guardado y no se le cambia savedAt.
  const stale = structuredClone(h); stale.revision = 2; stale.project.revision = 2; stale.savedAt = '2020-01-01T00:00:00.000Z';
  await writeFile(path.join(folder, 'autoguardado.json'), JSON.stringify(stale));
  await post({ id: h.id, pares: [{ from: A, to: ref(B), cueIds: ['c1'] }] });
  const auto3 = validateHistoria(JSON.parse(await readFile(path.join(folder, 'autoguardado.json'), 'utf8')));
  assert.equal(auto3.revision, 4); assert.equal(auto3.savedAt, h.savedAt);
});
