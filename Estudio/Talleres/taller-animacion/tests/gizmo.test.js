import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { Rig } from '../src/core/rig.js';
import { Engine } from '../src/core/animation.js';
import { buildMannequin } from '../src/core/mannequin.js';

// Exercise the application's handlers without starting its DOM/browser bootstrap.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('  setTool(t) {'), source.indexOf('  mirrorKey(bone, f) {'));
const App = runInNewContext(`class App { ${handlers} }\nApp`, { THREE });

function setup(canon) {
  const rig = new Rig(buildMannequin());
  const app = Object.create(App.prototype);
  Object.assign(app, {
    rig, engine: new Engine(rig, new Map()), selection: { kind: 'bone', bone: rig.bone(canon) },
    tool: 'move', space: 'local', snap: 0, autoKey: true,
    viewport: {
      gizmo: { setRotationSnap() {} },
      attachGizmo(object, mode, space) { Object.assign(this.gizmo, { object, mode, space }); },
    },
    panels: { refreshTools() {}, refreshTransform() {} }, timeline: { draw() {} },
    pushUndo() {}, changed() {},
  });
  return app;
}

test('Mover conserva traslación en huesos mapeados; Rotar y Escalar conservan su modo', () => {
  for (const canon of ['hips', 'head', 'handL', 'upperLegR', 'lowerLegR']) {
    const app = setup(canon);
    for (const space of ['local', 'global']) {
      app.space = space;
      for (const [tool, expected] of [['move', 'translate'], ['rotate', 'rotate'], ['scale', 'scale']]) {
        app.setTool(tool);
        assert.equal(app.viewport.gizmo.mode, expected, `${canon}: ${tool}`);
        assert.equal(app.viewport.gizmo.object, app.selection.bone);
        assert.equal(app.viewport.gizmo.space, space);
      }
    }
  }
});

test('el arrastre de Mover crea una clave de posición que sobrevive a reevaluar', () => {
  const app = setup('lowerLegR');
  app.engine.evaluate(0);
  const bone = app.selection.bone;
  const originalQ = bone.quaternion.clone();
  const target = bone.position.clone().add(new THREE.Vector3(0.02, 0.03, -0.01));
  app.setTool('move');
  app.onGizmoDrag(true);
  bone.position.copy(target);
  app.onGizmoChange();
  app.onGizmoDrag(false);
  app.engine.evaluate(0);
  assert.ok(bone.position.distanceTo(target) < 1e-8);
  assert.ok(bone.quaternion.angleTo(originalQ) < 1e-8);
  assert.ok(app.engine.layer().tracks[`t:${bone.name}`]?.length);
  assert.equal(app.engine.layer().tracks[`r:${bone.name}`], undefined);
});
