import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendPoses, slerpDirection } from '../camera-eval.ts';
import { createStudioDirector, sampleSequence } from '../director.ts';
import { sequenceDuration, sequenceList, validateProject, type Cue, type Shot, type StudioProject, type StudioSnapshot } from '../model.ts';
import { studentRoutes } from './fixtures/camera-baseline-cases.ts';
import { buildMiniHistoria, buildMiniSwitcher, MINI_SHOTS } from './fixtures/mini-historia.ts';

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dir = (s: Shot) => { const d = [s.target[0] - s.position[0], s.target[1] - s.position[1], s.target[2] - s.position[2]], l = Math.hypot(...d); return d.map(v => v / l); };
const angle = (a: Shot, b: Shot) => { const x = dir(a), y = dir(b); return Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))); };
function sane(s: StudioSnapshot, label: string) {
  for (const v of [...s.shot.position, ...s.shot.target, s.shot.fov]) assert(Number.isFinite(v), `${label}: número no finito`);
  assert(dist(s.shot.position, s.shot.target) > 1e-4, `${label}: position == target`);
  assert(s.shot.fov >= 10 && s.shot.fov <= 100, `${label}: fov fuera de rango`);
}
/** Recorre una ruta de estudiante cada `dt` y devuelve los snapshots (con la caché del director, como en la app). */
function walk(project: StudioProject, route: number[], dt: number) {
  const out: StudioSnapshot[] = [], cache = new Map();
  route.forEach((index, step) => {
    const d = sequenceDuration(sequenceList(project)[index].sequence);
    for (let k = 0; k * dt <= d + 1e-9; k++) out.push(sampleSequence(project, index, Math.min(d, k * dt), route.slice(0, step), cache));
    out.push(sampleSequence(project, index, d, route.slice(0, step), cache));
  });
  return out;
}

test('la minihistoria con Switcher es válida y lleva metadatos de cámara solo cuando usa el Switcher', () => {
  const h = buildMiniSwitcher();
  validateProject(h.project, h.source);
  const s = sampleSequence(h.project, 0, 1.2);
  assert.equal(s.camera?.id, 'cam-sigue-mia'); assert.equal(s.camera?.cut, false); assert(s.camera!.blend > 0 && s.camera!.blend < 1);
  assert.equal(sampleSequence(buildMiniHistoria().project, 0, 1.2).camera, undefined);
});

test('reproducir hasta un instante y saltar a él dan la misma cámara (ε = 1e-6)', () => {
  const h = buildMiniSwitcher();
  for (const choice of ['cafe', 'te']) {
    const director = createStudioDirector(h.project, h.source);
    let state = director.play(), seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list = sequenceList(h.project);
    for (let guard = 0; guard < 2000 && state.state !== 'finished'; guard++) {
      if (state.state === 'waiting') { state = director.respond(state.gate.kind === 'choice' ? { kind: 'choice', value: choice } : { kind: state.gate.kind }).snapshot; continue; }
      state = director.tick(rnd() * .2);
      if (state.state === 'finished') break;
      const path = state.path.map(id => list.findIndex(x => x.sequence.id === id));
      const direct = sampleSequence(h.project, state.index, state.time, path);
      assert(dist(direct.shot.position, state.stage.shot.position) < 1e-6 && dist(direct.shot.target, state.stage.shot.target) < 1e-6, `${choice} t=${state.time}`);
      assert.deepEqual(direct.camera, state.stage.camera);
    }
  }
});

test('continuidad: cada 1/60 s no hay saltos salvo en los cortes, tampoco en las fronteras de momento', () => {
  const { project } = buildMiniSwitcher();
  for (const route of studentRoutes(project)) {
    const frames = walk(project, route, 1 / 60);
    frames.forEach((s, i) => sane(s, `${s.sequenceId}@${s.time}`));
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      const cut = b.camera?.switchId !== a.camera?.switchId && b.camera?.cut;
      const legacyCut = b.sequenceId !== a.sequenceId && b.camera?.switchId !== a.camera?.switchId && b.camera?.id === null;
      if (cut || legacyCut) continue;
      // A 60 Hz: más de 0,6 m o 0,35 rad entre fotogramas es un salto visible.
      assert(dist(a.shot.position, b.shot.position) < .6, `salto de posición ${b.sequenceId}@${b.time.toFixed(3)}: ${dist(a.shot.position, b.shot.position).toFixed(3)} m`);
      assert(angle(a.shot, b.shot) < .35, `salto de orientación ${b.sequenceId}@${b.time.toFixed(3)}: ${angle(a.shot, b.shot).toFixed(3)} rad`);
    }
  }
});

test('una escena con cámaras pero sin Switcher se reproduce idéntica; con Switcher, los cues antiguos dan la misma pose', () => {
  const plain = buildMiniHistoria(), withRigs = buildMiniHistoria();
  withRigs.project.scenes[0].cameras = structuredClone(buildMiniSwitcher().project.scenes[0].cameras);
  const lastLegacy = buildMiniHistoria();
  // Un cambio de cámara al final de «Despedida»: activa el programa nuevo para toda la visita.
  const desp = lastLegacy.project.scenes[0].sequences[5], end = sequenceDuration(desp);
  lastLegacy.project.scenes[0].cameras = structuredClone(withRigs.project.scenes[0].cameras);
  desp.cues.push({ id: 'sw-final', kind: 'cameraSwitch', at: end, duration: .5, cameraId: 'cam-general', label: 'General', transition: { kind: 'cut' } } as Cue);
  for (const route of studentRoutes(plain.project)) {
    const a = walk(plain.project, route, .1), b = walk(withRigs.project, route, .1), c = walk(lastLegacy.project, route, .1);
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
    a.forEach((s, i) => { if (s.sequenceId !== desp.id || s.time < end) assert.deepEqual(c[i].shot, s.shot, `${s.sequenceId}@${s.time}`); });
  }
});

test('las mezclas nunca dejan position == target y slerp es unitario incluso con direcciones opuestas', () => {
  const a = MINI_SHOTS.general as Shot, b: Shot = { position: a.target, target: a.position, fov: 30, transition: 0 };
  for (let k = 0; k <= 1; k += .05) for (const route of ['linear', 'arc'] as const) {
    const s = blendPoses(a, b, k, route);
    assert(dist(s.position, s.target) > 1e-4 && [...s.position, ...s.target].every(Number.isFinite));
  }
  const d = slerpDirection([0, 0, 1], [0, 0, -1], .5);
  assert(Math.abs(Math.hypot(...d) - 1) < 1e-9 && Math.abs(d[1]) < 1e-9);
});

test('validateProject rechaza referencias de cámara colgantes y datos fuera de rango', () => {
  const bad = (mutate: (p: StudioProject) => void) => { const h = buildMiniSwitcher(); mutate(h.project); assert.throws(() => validateProject(h.project, h.source)); };
  bad(p => { (p.scenes[0].cameras![1].body as { actorId: string }).actorId = 'nadie'; });
  bad(p => { p.scenes[0].cameras!.push({ ...structuredClone(p.scenes[0].cameras![0]) }); });
  bad(p => { p.scenes[0].cameras![0].id = 'mh-1-saludo'; });
  bad(p => { (p.scenes[0].sequences[0].cues.find(c => c.kind === 'cameraSwitch') as { cameraId: string }).cameraId = 'cam-borrada'; });
  bad(p => { (p.scenes[0].sequences[1].cues.find(c => c.kind === 'cameraMove') as { to: number }).to = 1.5; });
  bad(p => { (p.scenes[0].sequences[0].cues.find(c => c.id === 'sw-1-mia') as { transition: { duration: number } }).transition.duration = 31; });
  bad(p => { p.scenes[0].cameras = Array.from({ length: 65 }, (_, i) => ({ ...structuredClone(p.scenes[0].cameras![0]), id: 'c' + i })); });
});
