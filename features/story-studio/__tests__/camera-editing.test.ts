import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimFor, bodyFor, cameraPoseAt, createCamera, deleteCamera, duplicateCamera, editCamera, placeCameraMove, placeCameraSwitch } from '../camera-editing.ts';
import { addScene, changeSceneZone, deleteActor, deleteCue, duplicateCue, duplicateMoment, duplicateScene, moveSceneToZone, resizeScene } from '../editing.ts';
import { sampleSequence } from '../director.ts';
import { sceneDuration, sequenceList, validateProject, type StudioProject } from '../model.ts';
import { buildMiniSwitcher, MINI_SHOTS } from './fixtures/mini-historia.ts';

test('crear, editar, duplicar y colocar cámaras deja un proyecto válido', () => {
  const { project, source } = buildMiniSwitcher();
  let p = createCamera(project, 'mh-escena', MINI_SHOTS.conjunto, 'Conjunto').project;
  const id = p.scenes[0].cameras!.at(-1)!.id;
  p = editCamera(p, 'mh-escena', id, c => { c.body = bodyFor('orbit', p.scenes[0], c, 'mh-mia'); c.aim = aimFor('actor', p.scenes[0], c, 'mh-mia'); });
  p = placeCameraSwitch(p, 'mh-2-respuesta', id, 1, { kind: 'blend', duration: .8, route: 'arc' }).project;
  p = placeCameraMove(p, 'mh-2-respuesta', id, 1, 2).project;
  p = duplicateCamera(p, 'mh-escena', id).project;
  validateProject(p, source);
  assert.equal(p.scenes[0].cameras!.length, 6);
  assert.throws(() => placeCameraMove(p, 'mh-1-saludo', 'cam-general', 0), /camino u órbita/);
});

test('borrar una cámara: quitar, reasignar o congelar; congelar conserva la pose exacta en ese instante', () => {
  const { project, source } = buildMiniSwitcher();
  const before = sampleSequence(project, 0, 1.8);
  for (const strategy of [{ kind: 'remove-cues' }, { kind: 'reassign', cameraId: 'cam-general' }, { kind: 'freeze' }] as const) {
    const p = deleteCamera(project, 'mh-escena', 'cam-sigue-mia', strategy);
    validateProject(p, source);
    assert(!JSON.stringify(p).includes('"cam-sigue-mia"'));
    if (strategy.kind === 'freeze') {
      const cue = p.scenes[0].sequences[0].cues.find(c => c.id === 'sw-1-mia')!;
      assert.equal(cue.kind, 'camera');
      // A 1,8 s la mezcla ya terminó: el plano congelado es la pose de la cámara a 0,8 s, distinta pero válida.
      assert.notDeepEqual(sampleSequence(p, 0, 1.8).shot, before.shot);
    }
  }
  assert.throws(() => deleteCamera(project, 'mh-escena', 'cam-general', { kind: 'reassign', cameraId: 'cam-general' }));
});

test('borrar un actor seguido por cámaras las fija con su pose; duplicar escena reasigna cámaras y actores', () => {
  const { project, source } = buildMiniSwitcher();
  const pose = cameraPoseAt(project, 'mh-1-saludo', 2, 'cam-sigue-mia')!;
  const p = deleteActor(project, 'mh-escena', 'mh-mia', { sequenceId: 'mh-1-saludo', time: 2 });
  validateProject(p, source);
  const cam = p.scenes[0].cameras!.find(c => c.id === 'cam-sigue-mia')!;
  assert.equal(cam.body.kind, 'static'); assert.equal(cam.aim.kind, 'fixed'); assert.deepEqual(cam.base.position, pose.position);
  const travelling = p.scenes[0].cameras!.find(c => c.id === 'cam-travelling')!;
  assert.deepEqual(travelling.aim.kind === 'group' && travelling.aim.actorIds, ['mh-rachel']);
  let n = 0; const uid = () => `copia-${n++}`;
  for (const copy of [duplicateScene(project, 'mh-escena', uid), addScene(project, 'mh-escena', 'copy').project]) {
    validateProject(copy, source);
    const [a, b] = copy.scenes;
    assert.equal(b.cameras!.length, a.cameras!.length);
    assert(b.cameras!.every(c => !a.cameras!.some(o => o.id === c.id)));
    const used = b.sequences.flatMap(s => s.cues).flatMap(c => c.kind === 'cameraSwitch' || c.kind === 'cameraMove' ? [c.cameraId] : []);
    assert(used.length && used.every(id => b.cameras!.some(c => c.id === id)));
  }
});

test('reescalar escena escala las mezclas; mover de zona desplaza las cámaras; cambiar de zona avisa', () => {
  const { project } = buildMiniSwitcher(), scene = project.scenes[0];
  const scaled = resizeScene(scene, sceneDuration(scene) * 2, 'scale');
  const blend = scaled.sequences[0].cues.find(c => c.id === 'sw-1-mia')!;
  assert.equal(blend.kind === 'cameraSwitch' && blend.transition.kind === 'blend' && blend.transition.duration, 2);
  const moved = moveSceneToZone(project, 'mh-escena', 'otra', [10, 0, 0]).project.scenes[0];
  assert.equal(moved.cameras![0].base.position[0], scene.cameras![0].base.position[0] + 10);
  assert.equal(changeSceneZone(project, 'mh-escena', 'otra').camerasToReframe, 4);
});

test('propiedad: secuencias aleatorias de operaciones siempre producen proyectos válidos', () => {
  const { project: start, source } = buildMiniSwitcher();
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  for (let run = 0; run < 40; run++) {
    let p: StudioProject = structuredClone(start);
    for (let step = 0; step < 25; step++) {
      const scene = pick(p.scenes), seq = pick(scene.sequences), cams = scene.cameras ?? [], actors = scene.actors;
      const ops: (() => StudioProject)[] = [
        () => createCamera(p, scene.id, pick([MINI_SHOTS.general, MINI_SHOTS.mia])).project,
        () => cams.length ? duplicateCamera(p, scene.id, pick(cams).id).project : p,
        () => cams.length ? deleteCamera(p, scene.id, pick(cams).id, pick([{ kind: 'remove-cues' }, { kind: 'freeze' }] as const)) : p,
        () => cams.length > 1 ? deleteCamera(p, scene.id, cams[0].id, { kind: 'reassign', cameraId: cams[1].id }) : p,
        () => cams.length ? placeCameraSwitch(p, seq.id, pick(cams).id, rnd() * 3, rnd() < .5 ? { kind: 'cut' } : { kind: 'blend', duration: .2 + rnd() * 2, route: pick(['linear', 'arc'] as const) }).project : p,
        () => actors.length ? deleteActor(p, scene.id, pick(actors).id, rnd() < .5 ? { sequenceId: seq.id, time: rnd() * 2 } : undefined) : p,
        () => p.scenes.length < 6 ? duplicateScene(p, scene.id) : p,
        () => p.scenes.length < 6 ? addScene(p, scene.id, 'copy').project : p,
        () => scene.sequences.length < 20 ? duplicateMoment(p, scene.id, seq.id) : p,
        () => seq.cues.length ? duplicateCue(p, seq.id, pick(seq.cues).id).project : p,
        () => seq.cues.length ? deleteCue(p, seq.id, pick(seq.cues).id) : p,
        () => { const copy = structuredClone(p), i = copy.scenes.findIndex(s => s.id === scene.id); try { copy.scenes[i] = resizeScene(scene, Math.max(1, sceneDuration(scene)) * (1 + rnd()), 'scale'); } catch { return p; } return copy; },
        () => moveSceneToZone(p, scene.id, scene.zoneId === 'a' ? 'b' : 'a', [rnd() * 5, 0, rnd() * 5]).project,
      ];
      p = pick(ops)();
      assert.doesNotThrow(() => validateProject(p, source), `run ${run} paso ${step}`);
      for (const [i] of sequenceList(p).entries()) if (rnd() < .1) assert.doesNotThrow(() => sampleSequence(p, i, rnd() * 2));
    }
  }
});
