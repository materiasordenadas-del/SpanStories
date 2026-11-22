import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralClips } from '../src/core/procedural.js';
import { processClip, reverseClip, retime } from '../src/core/motionlab.js';
import { sampleTrack } from '../src/core/animation.js';
import * as THREE from 'three';

const walk = proceduralClips().find((c) => c.id === 'gen_caminar');

test('retime cambia la duración', () => {
  const r = retime(walk, 2);
  assert.ok(Math.abs(r.duration - walk.duration / 2) < 0.05);
});

test('dirección 90° gira el avance hacia la izquierda', () => {
  const r = processClip(walk, { direction: 90 });
  const n = r.frames - 1;
  const dx = r.hips[n * 3] - r.hips[0];
  const dz = r.hips[n * 3 + 2] - r.hips[2];
  assert.ok(dx > 0.5 && Math.abs(dz) < 0.05, `dx=${dx} dz=${dz}`);
});

test('al revés y otra vez al revés es el original', () => {
  const r = reverseClip(reverseClip(walk));
  assert.deepEqual(Array.from(r.tracks.head.slice(0, 8)), Array.from(walk.tracks.head.slice(0, 8)));
});

test('interpolación automática pasa por las claves', () => {
  const keys = [{ f: 0, v: [0, 0, 0], i: 'auto' }, { f: 10, v: [1, 2, 3], i: 'auto' }, { f: 20, v: [0, 0, 0], i: 'auto' }];
  const v = sampleTrack(keys, 10, new THREE.Vector3());
  assert.deepEqual(v.toArray(), [1, 2, 3]);
  const m = sampleTrack(keys, 5, new THREE.Vector3());
  assert.ok(m.x > 0.4 && m.x < 0.8);
});
