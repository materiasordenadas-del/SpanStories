import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioRehearsal } from '../demo.ts';
import { createStudioDirector, sampleSequence } from '../director.ts';
import { validateProject } from '../model.ts';
import { lifeConfigKey, lifeIsStale, defaultLife, validateLife, type SceneLife } from '../life.ts';
// El visor es la otra mitad del contrato: la clave de configuración debe coincidir.
// @ts-expect-error -- motor JavaScript del visor, sin declaraciones de tipos.
import { claveConfiguracion } from '../../../SpanStories-Ciudades/engine/vida/Ambiente.js';
// @ts-expect-error -- motor JavaScript del visor, sin declaraciones de tipos.
import { grabarAmbiente } from '../../../SpanStories-Ciudades/engine/vida/Grabador.js';
// @ts-expect-error -- motor JavaScript del visor, sin declaraciones de tipos.
import { crearNavegacionCuadricula } from '../../../SpanStories-Ciudades/engine/vida/Navegacion.js';

const life = (): SceneLife => ({ ...defaultLife(11), duration: 40, radius: 15,
  cast: [{ id: 'npc-m', roleId: 'mesero', characterId: 'samuel', height: 1.75 }, { id: 'npc-c', roleId: 'cliente', characterId: 'samuel', height: 1.7 }],
  points: [{ id: 'p-barra', kind: 'atender', position: [4, 0, 4], rotation: Math.PI, slots: 1 }, { id: 'p-pedir', kind: 'pedir', position: [4, 0, 2.6], rotation: 0, slots: 1 }] });
const record = (a: SceneLife, zoneId: string) => grabarAmbiente({ ambiente: a, zoneId, centro: [0, 0, 0], navegacion: crearNavegacionCuadricula({ centro: [0, 0, 0], radio: a.radius, ground: () => 0, colliders: () => [] }) });

test('the studio and the viewer compute the same life configuration key', () => {
  const a = life();
  assert.equal(lifeConfigKey(a), claveConfiguracion(a));
  a.recording = record(a, 'zone');
  assert.equal(lifeIsStale(a), false);
  a.cast[1].roleId = 'turista';
  assert.equal(lifeIsStale(a), true);
});

test('recorded ambient life (scene.life) is validated as part of the direction project', () => {
  const { source, project } = buildStudioRehearsal(), scene = project.scenes[0], a = life();
  a.recording = record(a, scene.zoneId);
  scene.life = a;
  validateProject(project, source);
  assert.equal(validateLife(a, 'other-zone'), 'La grabación de la vida ambiental no pertenece a este escenario.');
  const bad = structuredClone(a); bad.cast.push({ id: 'npc-x', roleId: 'vecino', characterId: 'samuel', height: 1.7 });
  assert.throws(() => validateProject({ ...project, scenes: [{ ...scene, life: bad }] }, source), /pistas grabadas/);
  assert.throws(() => validateProject({ ...project, scenes: [{ ...scene, life: { ...a, cast: [{ id: 'npc-m', roleId: 'pirata', characterId: 's', height: 1.7 }] } as unknown as SceneLife }] }, source));
  const empty = structuredClone(a); empty.recording!.lines.push({ id: 'blank', npcId: 'npc-m', at: 1, duration: 1, text: ' ' });
  assert.notEqual(validateLife(empty, scene.zoneId), null);
});

test('scene time accumulates across the moments of a scene for the life clock', () => {
  const { source, project } = buildStudioRehearsal();
  const first = sampleSequence(project, 0, 1.5);
  assert.equal(first.sceneTime, 1.5);
  const director = createStudioDirector(project, source);
  const durations = project.scenes[0].sequences.map(s => Math.max(0, ...s.cues.map(c => c.at + c.duration)));
  const snapshot = director.seek(2, .5);
  assert.equal(Math.round(snapshot.stage.sceneTime * 1000) / 1000, Math.round((durations[0] + durations[1] + .5) * 1000) / 1000);
});
