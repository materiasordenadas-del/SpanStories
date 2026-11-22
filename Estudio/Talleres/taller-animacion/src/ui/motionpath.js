// Trayectoria editable en el visor (Herramientas · Editable Motion Path, reimplementado).
// Línea: lo ya recorrido en naranja, lo que falta en azul; un punto por fotograma y una bola por clave.
// Clic en una bola: la elige y va a ese fotograma (Mayús: añade). Arrastrar: mueve las elegidas en el plano de la vista
// y las claves vecinas (±«influencia» fotogramas) acompañan con caída suave
// (cada una cambia la clave de su fotograma). Alt + arrastrar: escala las elegidas respecto a su centro.
import * as THREE from 'three';
import { pathTarget, samplePath, movePathPoint, falloffWeight } from '../core/edit/motionpath.js';
import { prefs, setPrefs } from '../io/storage.js';

const C_PAST = new THREE.Color(0xff8a2a);
const C_NEXT = new THREE.Color(0x4aa8ff);
const C_KEY = 0xffc23d;
const C_SEL = 0xffffff;

export class MotionPathView {
  constructor(app) {
    this.app = app;
    this.vp = app.viewport;
    const saved = prefs('motionPath', null) || {};
    this.opts = { on: !!saved.on, mode: saved.mode === 'all' ? 'all' : 'win', win: Math.max(5, Math.min(240, +saved.win || 30)), falloff: Math.max(0, Math.min(60, saved.falloff ?? 6)) };
    this.group = new THREE.Group();
    this.group.renderOrder = 20;
    this.vp.scene.add(this.group);
    this.sel = new Set();
    this.dirty = true;
    this.data = null;
    this._last = 0;
    this._bind();
  }

  save() {
    setPrefs('motionPath', this.opts);
  }

  set(opts) {
    Object.assign(this.opts, opts);
    this.save();
    this.dirty = true;
    if (!this.opts.on) this.clear();
  }

  toggle(on = !this.opts.on) {
    this.set({ on });
    this.app.toast(on ? 'Trayectoria: arrastra las bolas amarillas (claves). Mayús elige varias; Alt escala.' : 'Trayectoria oculta');
    this.app.toolsUI?.render();
    return on;
  }

  invalidate() {
    this.dirty = true;
  }

  clear() {
    for (const o of [...this.group.children]) {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
      this.group.remove(o);
    }
    this.keyMeshes = [];
    this.data = null;
  }

  /** Lo llama el visor en cada render: rehace la línea si hace falta (no mientras se reproduce). */
  tick() {
    const app = this.app;
    if (!this.opts.on || !app.rig) {
      if (this.group.children.length) this.clear();
      return;
    }
    const t = pathTarget(app);
    const key = t ? `${t.kind}:${t.chain || t.bone?.name}` : '';
    if (key !== this._key) {
      this._key = key;
      this.sel.clear();
      this.dirty = true;
    }
    if (!t) {
      if (this.group.children.length) this.clear();
      return;
    }
    const f = Math.round(app.engine.frame);
    if (this.opts.mode === 'win' && this.data && Math.abs(f - this._center) > this.opts.win / 3) this.dirty = true;
    const now = performance.now();
    const busy = app.playing || this._drag || app.dragging;
    if (this.dirty && (!busy || now - this._last > 140) && !(app.playing && this.data)) {
      this._last = now;
      this.build(t);
    }
    this.markFrame(f);
  }

  range() {
    const eng = this.app.engine;
    const [r0, r1] = eng.range();
    if (this.opts.mode === 'all') return [r0, r1];
    const f = Math.round(eng.frame);
    this._center = f;
    return [Math.max(r0, f - this.opts.win), Math.min(r1, f + this.opts.win)];
  }

  build(t) {
    this.dirty = false;
    this.clear();
    const eng = this.app.engine;
    const [a, b] = this.range();
    const d = (this.data = { t, ...samplePath(eng, t, a, b) });
    const H = this.app.rig.hipsHeight || 1;
    const f0 = Math.round(eng.frame);
    // línea con color por tramo
    const pos = new Float32Array(d.points.length * 3);
    const col = new Float32Array(d.points.length * 3);
    d.points.forEach((p, i) => {
      p.toArray(pos, i * 3);
      const c = d.frames[i] <= f0 ? C_PAST : C_NEXT;
      const fade = 0.45 + 0.55 * (1 - Math.min(1, Math.abs(d.frames[i] - f0) / Math.max(10, b - a)));
      col.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }));
    line.renderOrder = 20;
    const dots = new THREE.Points(g.clone(), new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true }));
    dots.renderOrder = 21;
    this.group.add(line, dots);
    // bolas de las claves
    this.keyMeshes = [];
    const geo = new THREE.SphereGeometry(H * 0.016, 12, 8);
    d.frames.forEach((f, i) => {
      if (!d.keys.has(f)) return;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.sel.has(f) ? C_SEL : C_KEY, depthTest: false, transparent: true }));
      m.position.copy(d.points[i]);
      m.renderOrder = 22;
      m.userData.f = f;
      this.group.add(m);
      this.keyMeshes.push(m);
    });
    // fotograma actual
    const cur = new THREE.Mesh(new THREE.RingGeometry(H * 0.02, H * 0.028, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, side: THREE.DoubleSide, transparent: true }));
    cur.renderOrder = 23;
    this.cur = cur;
    this.group.add(cur);
  }

  markFrame(f) {
    const d = this.data;
    if (!d || !this.cur) return;
    const i = d.frames.indexOf(f);
    this.cur.visible = i >= 0;
    if (i >= 0) {
      this.cur.position.copy(d.points[i]);
      this.cur.quaternion.copy(this.vp.camera.quaternion);
    }
  }

  // ---------- Interacción ----------
  _screen(p, rect) {
    const v = p.clone().project(this.vp.camera);
    return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height, v.z];
  }

  _hit(e) {
    if (!this.opts.on || !this.keyMeshes?.length) return null;
    const rect = this.vp.renderer.domElement.getBoundingClientRect();
    let best = null;
    let bd = 10;
    for (const m of this.keyMeshes) {
      const [x, y, z] = this._screen(m.position, rect);
      if (z > 1) continue;
      const dd = Math.hypot(x - e.clientX, y - e.clientY);
      if (dd < bd) [best, bd] = [m, dd];
    }
    return best;
  }

  _ray(e, plane) {
    const rect = this.vp.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.vp.camera);
    return rc.ray.intersectPlane(plane, new THREE.Vector3());
  }

  _bind() {
    const el = this.vp.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.vp.gizmo.axis || this.vp._box) return;
      const m = this._hit(e);
      if (!m) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const f = m.userData.f;
      if (e.shiftKey) this.sel.has(f) ? this.sel.delete(f) : this.sel.add(f);
      else if (!this.sel.has(f)) {
        this.sel.clear();
        this.sel.add(f);
      }
      this._paintSel();
      const d = this.data;
      const n = new THREE.Vector3();
      this.vp.camera.getWorldDirection(n);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, m.position);
      const start = this._ray(e, plane);
      const orig = new Map([...this.sel].map((k) => [k, d.points[d.frames.indexOf(k)]?.clone()]).filter(([, p]) => p));
      const center = [...orig.values()].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(orig.size || 1);
      // influencia: las claves vecinas (±N fotogramas) acompañan con caída suave; así no queda un pico
      const neigh = [];
      const N = this.opts.falloff || 0;
      if (N > 0) {
        for (const k of d.keys) {
          if (orig.has(k)) continue;
          let w = 0;
          for (const s of orig.keys()) w = Math.max(w, falloffWeight(Math.abs(k - s), N));
          if (w > 1e-4) neigh.push([k, d.points[d.frames.indexOf(k)].clone(), w]);
        }
      }
      this._drag = { start, plane, orig, center, neigh, moved: false, f, x: e.clientX, y: e.clientY, alt: e.altKey };
      this.vp.orbit.enabled = false;
      el.setPointerCapture?.(e.pointerId);
    }, true);
    el.addEventListener('pointermove', (e) => {
      const g = this._drag;
      if (!g) return;
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
      if (!g.moved) {
        if (this.app.engine.layer().lock) return this.app.toast('La capa está bloqueada', true);
        this.app.pushUndo();
        g.moved = true;
      }
      g.pending = e;
      if (!g.raf) g.raf = requestAnimationFrame(() => this._apply());
    }, true);
    const up = (e) => {
      const g = this._drag;
      if (!g) return;
      e.stopImmediatePropagation();
      cancelAnimationFrame(g.raf);
      if (g.pending) this._apply(true);
      this._drag = null;
      this.vp.orbit.enabled = true;
      el.releasePointerCapture?.(e.pointerId);
      if (g.moved) {
        this.dirty = true;
        this.app.changed();
      } else this.app.setFrame(g.f);
    };
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
  }

  _apply(final = false) {
    const g = this._drag;
    if (!g || !g.pending) return;
    g.raf = 0;
    const e = g.pending;
    g.pending = null;
    const p = this._ray(e, g.plane);
    if (!p || !g.start) return;
    const eng = this.app.engine;
    const t = this.data?.t;
    if (!t) return;
    const delta = p.clone().sub(g.start);
    // Alt: escala respecto al centro de las elegidas (según cuánto se aleja el ratón del centro)
    const k = g.alt ? Math.max(0.05, p.distanceTo(g.center) / Math.max(1e-6, g.start.distanceTo(g.center))) : 1;
    const cur = eng.frame;
    for (const [f, o] of g.orig) {
      const w = g.alt ? o.clone().sub(g.center).multiplyScalar(k).add(g.center) : o.clone().add(delta);
      movePathPoint(eng, t, f, w, { limits: this.app.limits !== false });
    }
    if (!g.alt) for (const [f, o, w] of g.neigh || []) movePathPoint(eng, t, f, o.clone().addScaledVector(delta, w), { limits: this.app.limits !== false });
    eng.evaluate(cur);
    this.dirty = true;
    if (final) return;
    this.app.timeline?.draw();
  }

  _paintSel() {
    for (const m of this.keyMeshes || []) m.material.color.setHex(this.sel.has(m.userData.f) ? C_SEL : C_KEY);
  }
}
