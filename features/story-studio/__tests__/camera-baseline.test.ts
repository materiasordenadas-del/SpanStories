import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { checkDirection } from '../checks.ts';
import { createStudioDirector } from '../director.ts';
import { validateHistoria } from '../historia.ts';
import { validateProject } from '../model.ts';
import { baselineCases, collectBaseline, studentRoutes, type Baseline } from './fixtures/camera-baseline-cases.ts';
import { buildMiniHistoria } from './fixtures/mini-historia.ts';

/**
 * Invariante 2 del plan de cámaras: las historias de hoy se reproducen idénticas.
 * Regenerar la referencia SOLO cuando un cambio de comportamiento sea intencionado y esté revisado:
 *   UPDATE_CAMERA_BASELINE=1 node --test features/story-studio/__tests__/camera-baseline.test.ts
 */
const FILE = new URL('./fixtures/camera-baseline.json', import.meta.url);

test('la minihistoria de cámaras es una historia válida que se recorre entera por sus dos ramas', () => {
  const h = validateHistoria(buildMiniHistoria());
  const routes = studentRoutes(h.project).map(route => route.map(i => h.project.scenes[0].sequences[i].id));
  assert.deepEqual(routes, [
    ['mh-1-saludo', 'mh-2-respuesta', 'mh-3-pregunta', 'mh-4-cafe', 'mh-6-despedida'],
    ['mh-1-saludo', 'mh-2-respuesta', 'mh-3-pregunta', 'mh-5-te', 'mh-6-despedida'],
  ]);
  for (const choice of ['cafe', 'te']) {
    const director = createStudioDirector(h.project, h.source);
    let state = director.play();
    for (let guard = 0; guard < 500 && state.state !== 'finished'; guard++) {
      if (state.state === 'waiting') state = director.respond(state.gate.kind === 'choice' ? { kind: 'choice', value: choice } : { kind: state.gate.kind }).snapshot;
      else state = director.tick(.25);
    }
    assert.equal(state.state, 'finished', `la rama «${choice}» debe terminar`);
  }
});

test('checks.ts avisa de dos cambios de cámara simultáneos, y no en la minihistoria normal', () => {
  const available = { characters: ['rachel', 'mia'], scenarios: ['aeropuerto-entrada'], audio: [] };
  const tie = (name: string) => { const c = baselineCases().find(x => x.name === name)!; return checkDirection(c.project, c.source, available).filter(x => x.message.includes('mismo instante')); };
  assert.equal(tie('mini-historia').length, 0);
  assert.deepEqual(tie('mini-empates').map(x => x.sequenceId), ['mh-2-respuesta']);
});

for (const mode of ['directo', 'cache', 'cache-inverso'] as const) test(`las instantáneas de referencia de cámara y actores no cambian (${mode})`, () => {
  for (const { name, project, source } of baselineCases()) assert.doesNotThrow(() => validateProject(project, source), name);
  const current = collectBaseline(baselineCases(), mode);
  if (mode === 'directo' && (process.env.UPDATE_CAMERA_BASELINE === '1' || !existsSync(FILE))) {
    writeFileSync(FILE, JSON.stringify(current, null, 1) + '\n');
    if (process.env.UPDATE_CAMERA_BASELINE !== '1') assert.fail('No había referencia: se ha creado. Revísala y vuelve a ejecutar las pruebas.');
    return;
  }
  const expected = JSON.parse(readFileSync(FILE, 'utf8')) as Baseline;
  assert.deepEqual(Object.keys(current), Object.keys(expected), 'casos de referencia');
  for (const [name, tracks] of Object.entries(expected)) {
    assert.equal(current[name].length, tracks.length, `${name}: número de recorridos`);
    tracks.forEach((track, n) => {
      const now = current[name][n];
      assert.deepEqual(now.route, track.route, `${name} ${track.label}: recorrido`);
      // Primero los extremos de cada momento, que dan un diff legible; después cada muestra.
      // Se compara como JSON, igual que los hashes: el snapshot vivo puede llevar claves con valor undefined.
      assert.deepEqual(JSON.parse(JSON.stringify(now.edges)), track.edges,`${name} ${track.label}: snapshot al principio o al final de un momento`);
      const first = track.hashes.findIndex((h, i) => h !== now.hashes[i]);
      assert.equal(first, -1, `${name} ${track.label}: el snapshot de la muestra ${first} cambió`);
      assert.equal(now.hashes.length, track.hashes.length, `${name} ${track.label}: número de muestras`);
    });
  }
});
