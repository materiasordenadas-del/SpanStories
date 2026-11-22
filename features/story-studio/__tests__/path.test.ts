import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioRehearsal } from '../demo.ts';
import { sampleSequence } from '../director.ts';
import { validateProject, type Vec3 } from '../model.ts';
import { routeLength, routePoint } from '../path.ts';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

test('a route passes through its points at constant speed and reports the heading', () => {
  const start: Vec3 = [0, 0, 0], points: Vec3[] = [[0, 0, 4], [3, 0, 4]];
  near(routeLength(start, points, false), 7, 1e-6, 'straight length');
  const corner = routePoint(start, points, 4 / 7, false);
  near(corner.position[0], 0, 1e-6); near(corner.position[2], 4, 1e-6);
  near(routePoint(start, points, 0.2, false).heading!, 0, 1e-6, 'walks towards +Z');
  near(routePoint(start, points, 0.9, false).heading!, Math.PI / 2, 1e-6, 'then towards +X');
  const end = routePoint(start, points, 1);
  near(end.position[0], 3, 1e-6); near(end.position[2], 4, 1e-6);
  assert.equal(routePoint(start, [start], 0.5).heading, null);
});

test('a walk cue with a path follows it, faces its travel and ends at the destination', () => {
  const { source, project } = buildStudioRehearsal();
  const scene = project.scenes[0], sequence = scene.sequences[0];
  if (!scene.actors.length) scene.actors.push({ id: 'walker', characterId: 'rachel', name: 'Caminante', position: [1, 0, 2], rotation: 0, height: 1.7 });
  const actor = scene.actors[0];
  const [x, y, z] = actor.position;
  sequence.cues.push({ id: 'walk-path', kind: 'actor', actorId: actor.id, action: 'walk', at: 0, duration: 4, path: [[x, y, z + 4]], destination: [x + 3, y, z + 4] });
  validateProject(project, source);
  const at = (t: number) => sampleSequence(project, 0, t).actors.find(a => a.id === actor.id)!;
  const mid = at(2);
  assert.ok(Math.abs(mid.position[0] - x) < 1.2 && mid.position[2] > z + 1, 'goes along the first leg, not straight to the destination');
  const done = at(4);
  near(done.position[0], x + 3, 1e-6); near(done.position[2], z + 4, 1e-6);
  near(Math.atan2(Math.sin(done.rotation - Math.PI / 2), Math.cos(done.rotation - Math.PI / 2)), 0, 0.35, 'ends facing its travel');
  // seeking back reconstructs the same pose: nothing accumulates
  assert.deepEqual(at(2), mid);
  sequence.cues.at(-1)!.kind === 'actor' && ((sequence.cues.at(-1) as { path?: unknown }).path = [[1, 2]]);
  assert.throws(() => validateProject(project, source));
});
