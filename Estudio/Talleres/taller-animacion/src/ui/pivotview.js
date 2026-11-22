// Pivote temporal en el visor (Herramientas · Relative Cursor Pivot, reimplementado).
// Una esfera turquesa con su propio gizmo (independiente de la selección): con «Girar» los huesos que estaban
// elegidos giran a su alrededor (cadera: también se traslada; manos y pies en IK: por su objetivo).
// Con «Mover» se recoloca el pivote. Si va pegado a un hueso, lo acompaña en cada fotograma.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { pivotWorld, makePivot, captureTargets, rotateAroundPivot } from '../core/edit/pivot.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export class PivotView {
  constructor(app) {
    this.app = app;
    const vp = (this.vp = app.viewport);
    this.pivot = null; // { pos } | { bone, local }
    this.targets = []; // huesos que gira
    this.mode = 'rotate';
    this.proxy = new THREE.Object3D();
    vp.scene.add(this.proxy);
    const H = 1;
    this.mark = new THREE.Mesh(new THREE.SphereGeometry(0.025 * H, 16, 10), new THREE.MeshBasicMaterial({ color: 0x3dd8ff, depthTest: false, transparent: true, opacity: 0.95 }));
    this.mark.renderOrder = 30;
    this.mark.visible = false;
    vp.scene.add(this.mark);
    this.gizmo = new TransformControls(vp.camera, vp.renderer.domElement);
    this.gizmo.setSize(1.1);
    this.gizmo.setSpace('world');
    vp.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      vp.orbit.enabled = !e.value;
      this.onDrag(e.value);
    });
    this.gizmo.addEventListener('objectChange', () => this.onChange());
  }

  get active() {
    return !!this.pivot;
  }

  /** Pone el pivote en lo elegido (o en `world`) y guarda qué huesos girará. follow: pegado al hueso. */
  place({ world = null, bone = null, follow = true, targets = null } = {}) {
    const app = this.app;
    const rig = app.rig;
    if (!rig) return false;
    app.engine.evaluate(app.engine.frame);
    const sel = app.selection;
    const at = bone || (sel?.kind === 'bone' ? sel.bone : sel?.kind === 'root' ? rig.bone('hips') : null);
    let w = world;
    if (!w && (sel?.kind === 'ik' || sel?.kind === 'pole')) w = (sel.kind === 'ik' ? app.engine.ikState[sel.chain]?.target : app.engine.ikState[sel.chain]?.pole)?.clone();
    if (!w && at) w = at.getWorldPosition(new THREE.Vector3());
    if (!w) return false;
    this.pivot = makePivot(rig, w, follow ? at : null);
    this.pivotLabel = follow && at ? rig.canonOf.get(at) || at.name : 'mundo';
    if (targets) this.targets = targets;
    this.sync();
    return true;
  }

  /** Huesos que girarán (por defecto, la selección actual). */
  setTargets(bones) {
    this.targets = bones.filter(Boolean);
    this.sync();
  }

  clear() {
    this.pivot = null;
    this.targets = [];
    this.gizmo.detach();
    this.mark.visible = false;
    this.app.attachGizmo();
  }

  setMode(mode) {
    this.mode = mode === 'translate' ? 'translate' : 'rotate';
    this.gizmo.setMode(this.mode);
  }

  /** Coloca la marca y el gizmo donde está el pivote en el fotograma actual. */
  sync() {
    if (!this.pivot || !this.app.rig) return;
    const P = pivotWorld(this.app.rig, this.pivot);
    this.mark.position.copy(P);
    this.mark.scale.setScalar(this.app.rig.hipsHeight || 1);
    this.mark.visible = true;
    if (!this.dragging) {
      this.proxy.position.copy(P);
      this.proxy.quaternion.identity();
      this.proxy.updateMatrixWorld();
      if (this.gizmo.object !== this.proxy) this.gizmo.attach(this.proxy);
      this.gizmo.setMode(this.mode);
      // el gizmo de la selección se aparta mientras el pivote está activo (no se pisan)
      this.vp.gizmo.detach();
    }
  }

  tick() {
    if (this.pivot && !this.dragging) this.sync();
  }

  onDrag(start) {
    const app = this.app;
    const eng = app.engine;
    this.dragging = start;
    if (start) {
      if (eng.layer().lock && this.mode === 'rotate') return app.toast('La capa está bloqueada', true);
      const f = Math.round(eng.frame);
      app.pushUndo();
      eng.evaluate(f);
      this._d = { f, layers: clone(eng.doc.layers), ik: { ...eng.doc.ik }, q0: this.proxy.quaternion.clone(), P: this.proxy.position.clone(), targets: captureTargets(this.targets) };
      return;
    }
    if (this.mode === 'translate' && this._d) {
      // recolocar el pivote (pegado al mismo hueso si lo estaba)
      const bone = this.pivot.bone ? app.rig.byName.get(this.pivot.bone) : null;
      this.pivot = makePivot(app.rig, this.proxy.position.clone(), bone);
    }
    this._d = null;
    app.changed();
    this.sync();
  }

  onChange() {
    const d = this._d;
    if (!d || this.mode !== 'rotate' || !this.targets.length) return;
    const eng = this.app.engine;
    if (eng.layer().lock) return;
    // cada cambio parte del estado al empezar el arrastre: no acumula
    eng.doc.layers = clone(d.layers);
    Object.assign(eng.doc.ik, d.ik);
    const R = this.proxy.quaternion.clone().multiply(d.q0.clone().invert());
    rotateAroundPivot(eng, d.f, d.targets, d.P, R);
    eng.evaluate(d.f);
    this.app.timeline.draw();
  }
}
