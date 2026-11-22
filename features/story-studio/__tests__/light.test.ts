import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LIGHT, LIGHT_PRESETS, lightCueProblem, sampleLight } from '../light.ts';

const dusk = { id: 'l1', kind: 'light', at: 2, duration: 4, light: LIGHT_PRESETS.anochecer.light, label: 'Anochecer' };

test('a light cue blends from the light in place to its own over its duration', () => {
  assert.deepEqual(sampleLight([dusk], 1, DEFAULT_LIGHT), DEFAULT_LIGHT);
  const mid = sampleLight([dusk], 4, DEFAULT_LIGHT);
  assert.ok(Math.abs(mid.sol - (DEFAULT_LIGHT.sol + LIGHT_PRESETS.anochecer.light.sol) / 2) < 1e-9);
  assert.deepEqual(sampleLight([dusk], 9, DEFAULT_LIGHT), LIGHT_PRESETS.anochecer.light);
});

test('a later transition starts where the interrupted one was', () => {
  const night = { ...dusk, id: 'l2', at: 4, duration: 2, light: LIGHT_PRESETS.nocheCerrada.light };
  const cut = sampleLight([dusk], 4, DEFAULT_LIGHT);
  assert.deepEqual(sampleLight([dusk, night], 4, DEFAULT_LIGHT), cut);
  assert.deepEqual(sampleLight([night, dusk], 10, DEFAULT_LIGHT), LIGHT_PRESETS.nocheCerrada.light);
});

test('light cues are validated', () => {
  assert.equal(lightCueProblem(dusk), null);
  assert.ok(lightCueProblem({ ...dusk, light: { sol: 3, luna: 0 } }));
  assert.ok(lightCueProblem({ ...dusk, easing: 'bounce' }));
});
