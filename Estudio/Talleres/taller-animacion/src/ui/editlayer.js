// «Editar capa de movimiento» (como Edit Motion Layer de iClone): lo que el panel Editar movimiento necesita además
// de arrastrar y girar. Pose de reposo, puño desde la palma, puntillas, pines T/R con preajustes, Títere directo
// (el ratón lleva un control en tiempo real, en vista previa o grabando), mantener una edición en toda la tira
// y copiar/pegar las claves de un fotograma. Se instala como métodos de la app: el panel y la IA los llaman igual.
import * as THREE from 'three';
import { IK_CHAINS } from '../core/humanoid.js';
import { newLayer, uid, setKey } from '../core/animation.js';
import { prefs, setPrefs } from '../io/storage.js';

export const LIMB_CHAINS = ['handL', 'handR', 'footL', 'footR'];
/** Preajustes de pines: [id, nombre, cadenas con pin TR]. */
export const PIN_PRESETS = [
  ['none', 'Sin pines', []],
  ['hands', 'Ambas manos', ['handL', 'handR']],
  ['feet', 'Ambos pies', ['footL', 'footR']],
  ['limbs', 'Miembros', LIMB_CHAINS],
];
/** Orden al pulsar el candado: libre → T y R → solo T (posición) → solo R (giro) → libre. */
const CYCLE = [false, 'TR', 'T', 'R'];
export const pinOf = (v) => (v === true ? 'TR' : v || '');

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function installEditLayer(app) {
  app.holdStrip = !!prefs('holdStrip', false);
  // Direct Puppet: cómo lleva el ratón el control. Mover: según la pantalla, horizontal (suelo) o vertical.
  // Girar: nada (mueve), según la pantalla, principal (eje vertical) o secundario (eje lateral). Reflejar: la mano o
  // el pie del otro lado hace lo mismo en espejo.
  const pz = prefs('puppetOpts', {});
  app.puppetMove = ['screen', 'horizontal', 'vertical'].includes(pz.move) ? pz.move : 'screen';
  app.puppetRot = ['screen', 'primary', 'secondary'].includes(pz.rot) ? pz.rot : null;
  app.puppetMirror = !!pz.mirror;
  app.setPuppetOpts = function (o = {}) {
    if (o.move !== undefined) this.puppetMove = ['screen', 'horizontal', 'vertical'].includes(o.move) ? o.move : 'screen';
    if (o.rot !== undefined) this.puppetRot = ['screen', 'primary', 'secondary'].includes(o.rot) ? o.rot : null;
    if (o.mirror !== undefined) this.puppetMirror = !!o.mirror;
    setPrefs('puppetOpts', { move: this.puppetMove, rot: this.puppetRot, mirror: this.puppetMirror });
    this.panels?.refreshMotion?.();
  };
  // Espacio en la pestaña Títere: empieza o para la vista previa (como «Press Space to preview» de iClone).
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || app.motionMode !== 'puppet' || e.repeat) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!app.puppet && !app.puppetTarget()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (app.puppet) app.puppetStop();
    else app.puppetStart({ record: false });
  }, { capture: true });
  /** Candado de una cadena: libre, TR, T o R (antes era sí/no; «true» se lee como TR). */
  app.cycleLock = function (chain) {
    const cur = pinOf(this.locks[chain]) || false;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    this.setLock(chain, next);
  };
  app.setLock = function (chain, v) {
    this.locks = { ...this.locks, [chain]: v || false };
    setPrefs('locks', this.locks);
    this.panels?.refreshMotion?.();
  };
  app.pinPreset = function (id) {
    const p = PIN_PRESETS.find((x) => x[0] === id);
    if (!p) return false;
    this.locks = Object.fromEntries(LIMB_CHAINS.map((c) => [c, p[2].includes(c) ? 'TR' : false]));
    setPrefs('locks', this.locks);
    this.panels?.refreshMotion?.();
    this.toast?.(`Pines: ${p[1]}`);
    return true;
  };

  /**
   * Pose de reposo (Reset Pose): de pie, brazos relajados a los lados, en el fotograma actual y como clave de la
   * capa activa. La cadera conserva dónde está sobre el suelo y vuelve a su altura de reposo.
   */
  app.resetPose = function () {
    const rig = this.rig;
    const eng = this.engine;
    if (!rig || eng.layer().lock) return this.toast?.('La capa está bloqueada', true);
    const f = Math.round(eng.frame);
    this.pushUndo();
    eng.evaluate(f, { ik: false });
    const hb = rig.bone('hips');
    const hipW = hb.getWorldPosition(new THREE.Vector3());
    // Pose T ideal del espacio canónico (no la pose de enlace del modelo: en algunos personajes, como Mia, la de
    // enlace trae los pies en punta y los dedos atravesaban el suelo).
    rig.applyCanonical({ q: Object.fromEntries(Object.keys(rig.Tw || {}).map((c) => [c, new THREE.Quaternion()])), hips: new THREE.Vector3() });
    rig.root.updateMatrixWorld(true);
    const restY = hb.getWorldPosition(new THREE.Vector3()).y;
    // brazos: de la T a colgar relajados (≈ 72° bajo la horizontal, algo hacia delante)
    for (const s of ['L', 'R']) {
      const ua = rig.bone(`upperArm${s}`);
      const la = rig.bone(`lowerArm${s}`);
      if (!ua || !la || !ua.parent) continue;
      const a = ua.getWorldPosition(new THREE.Vector3());
      const dir = la.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
      const out = dir.clone().setY(0);
      if (out.lengthSq() < 1e-6) continue;
      out.normalize();
      const fwd = rig.frame?.fwd ? rig.frame.fwd.clone().setY(0).normalize() : new THREE.Vector3(0, 0, 1);
      const want = out.multiplyScalar(0.3).addScaledVector(UP, -0.95).addScaledVector(fwd, 0.06).normalize();
      _q.setFromUnitVectors(dir, want);
      const pw = ua.parent.getWorldQuaternion(new THREE.Quaternion());
      ua.quaternion.copy(pw.clone().invert().multiply(_q.clone().multiply(pw.multiply(ua.quaternion))));
      ua.updateMatrixWorld(true);
    }
    const bones = Object.values(rig.mapping).map((n) => rig.byName.get(n)).filter(Boolean);
    const locals = new Map(bones.map((b) => [b, b.quaternion.clone()]));
    const hipLocal = hb.parent ? hb.parent.worldToLocal(new THREE.Vector3(hipW.x, restY, hipW.z)) : null;
    // Las cadenas en IK reciben su efector en la pose nueva (sin pasar a FK).
    eng.evaluate(f, { ik: false });
    const inIK = [];
    for (const b of bones) {
      if (eng.chainOfBone(b)) inIK.push(b);
      else eng.keyBone(b, locals.get(b), b === hb ? hipLocal : null, f);
    }
    if (inIK.length) {
      eng.evaluate(f, { ik: false });
      for (const b of inIK) b.quaternion.copy(locals.get(b));
      rig.root.updateMatrixWorld(true);
      for (const chain of Object.keys(IK_CHAINS)) {
        if (!eng.doc.ik[chain]) continue;
        const end = rig.bone(IK_CHAINS[chain].bones[2]);
        if (!end) continue;
        const pos = end.getWorldPosition(new THREE.Vector3());
        const quat = end.getWorldQuaternion(new THREE.Quaternion());
        eng.keyIK(chain, { pos, quat }, f);
      }
    }
    this.changed();
    this.toast?.(`Pose de reposo en el fotograma ${f}`);
    return true;
  };

  /** Puño desde la palma: 0 = mano abierta, 90 = puño cerrado (todos los dedos y el pulgar). */
  app.palm = function (side, curl) {
    const v = THREE.MathUtils.clamp(+curl || 0, -10, 95);
    return this.setFingers(side, { all: v });
  };

  /**
   * De puntillas (efector IK del pie): el pie gira alrededor de los dedos, que se quedan en el suelo; el talón sube.
   * deg = ángulo del talón (0 = pie plano). Con «start» se fija la pose de partida (para un deslizador).
   */
  app.tiptoe = function (side, deg, { start = true } = {}) {
    const rig = this.rig;
    const eng = this.engine;
    const chain = `foot${side}`;
    const f = Math.round(eng.frame);
    if (!rig?.bone(chain === 'footL' ? 'footL' : 'footR')) return false;
    if (start || !this._tiptoe || this._tiptoe.chain !== chain || this._tiptoe.f !== f) {
      this.pushUndo();
      this.setIK(chain, true, { undo: false, quiet: true });
      eng.evaluate(f);
      rig.root.updateMatrixWorld(true); // el IK deja al día la cadena, no los dedos: sin esto el giro no era sobre los dedos
      const st = eng.ikState[chain];
      const foot = rig.bone(`foot${side}`);
      const toes = rig.bone(`toes${side}`);
      const fp = foot.getWorldPosition(new THREE.Vector3());
      const pivot = toes ? toes.getWorldPosition(new THREE.Vector3()) : fp.clone().addScaledVector(rig.frame?.fwd || new THREE.Vector3(0, 0, 1), rig.hipsHeight * 0.14);
      const fdir = pivot.clone().sub(fp).setY(0);
      if (fdir.lengthSq() < 1e-8) fdir.set(0, 0, 1);
      fdir.normalize();
      this._tiptoe = {
        chain, f, side, pivot,
        axis: new THREE.Vector3().crossVectors(UP, fdir).normalize(),
        pos: st.target.clone(), quat: st.targetQ.clone(),
        toes, toesW: toes ? toes.getWorldQuaternion(new THREE.Quaternion()) : null,
      };
    }
    const T = this._tiptoe;
    const R = new THREE.Quaternion().setFromAxisAngle(T.axis, THREE.MathUtils.degToRad(+deg || 0));
    const pos = T.pos.clone().sub(T.pivot).applyQuaternion(R).add(T.pivot);
    const quat = R.clone().multiply(T.quat);
    eng.keyIK(chain, { pos, quat }, f);
    if (T.toes) {
      // los dedos se quedan planos en el suelo: compensan el giro del pie
      eng.evaluate(f);
      rig.root.updateMatrixWorld(true);
      const local = T.toes.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(T.toesW);
      eng.keyBone(T.toes, local, null, f);
    }
    eng.evaluate(f);
    this.changed();
    return true;
  };

  // ---------- Títere directo ----------
  /** Control que lleva el títere según lo elegido: la cadera o una mano / un pie (su cadena IK). */
  app.puppetTarget = function () {
    const s = this.selection;
    const rig = this.rig;
    if (!s || !rig) return null;
    if (s.kind === 'root') return { kind: 'hips' };
    if (s.kind === 'ik') return { kind: 'chain', chain: s.chain };
    if (s.kind === 'bone') {
      const c = rig.canonOf.get(s.bone);
      if (c === 'hips') return { kind: 'hips' };
      const chain = Object.keys(IK_CHAINS).find((k) => IK_CHAINS[k].bones[2] === c);
      if (chain) return { kind: 'chain', chain };
    }
    return null;
  };

  /**
   * Empieza el títere. record = false: vista previa (el ratón mueve el control en este fotograma).
   * record = true: reproduce desde aquí y graba una clave por fotograma hasta pulsar en el visor, Esc o el final.
   * Los pines (candados) se respetan: con «Ambas manos» las manos se quedan donde estaban.
   */
  app.puppetStart = function ({ record = false, sens = this.puppetSens || 1 } = {}) {
    this.puppetStop(false);
    const tgt = this.puppetTarget();
    if (!tgt) return this.toast?.('Títere: elige la cadera, una mano o un pie', true), false;
    if (this.engine.layer().lock) return this.toast?.('La capa está bloqueada', true), false;
    const eng = this.engine;
    const rig = this.rig;
    const f0 = Math.round(eng.frame);
    this.pushUndo();
    eng.evaluate(f0);
    if (tgt.kind === 'chain') this.setIK(tgt.chain, true, { undo: false, quiet: true });
    const hb = rig.bone('hips');
    const start = tgt.kind === 'hips' ? hb.getWorldPosition(new THREE.Vector3()) : eng.ikState[tgt.chain].target.clone();
    const locks = tgt.kind === 'hips' ? this.lockStart({ kind: 'root' }) : [];
    const vp = this.viewport;
    const canvas = vp.renderer.domElement;
    const P = (this.puppet = { tgt, start, locks, record, sens, reach: rig.hipsHeight ? rig.hipsHeight * 1.1 : 1, f: f0, lastF: -1, offset: new THREE.Vector3(), origin: null, plane: new THREE.Plane(), ray: new THREE.Raycaster() });
    const cam = vp.camera;
    const look = cam.getWorldDirection(new THREE.Vector3());
    // Mover según la pantalla (plano de cara a la cámara), horizontal (plano del suelo) o vertical (de pie, de cara)
    let normal = look.clone().negate();
    if (this.puppetMove === 'horizontal') normal = UP.clone();
    else if (this.puppetMove === 'vertical') {
      normal = look.clone().setY(0);
      if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
      normal.normalize().negate();
    }
    P.plane.setFromNormalAndCoplanarPoint(normal, start);
    // Girar: en lugar de mover, el ratón gira el control sobre un eje
    P.rot = this.puppetRot;
    if (P.rot) {
      P.rotAxis = P.rot === 'primary' ? UP.clone() : P.rot === 'secondary' ? new THREE.Vector3().crossVectors(look, UP).normalize() : look.clone().negate();
      if (P.rotAxis.lengthSq() < 1e-6) P.rotAxis.set(1, 0, 0);
      P.startQ = tgt.kind === 'hips' ? hb.getWorldQuaternion(new THREE.Quaternion()) : eng.ikState[tgt.chain].targetQ.clone();
      P.ang = 0;
    }
    // Reflejar: la cadena del otro lado copia el movimiento en espejo
    P.mirror = tgt.kind === 'chain' && this.puppetMirror ? { chain: tgt.chain.slice(0, -1) + (tgt.chain.endsWith('L') ? 'R' : 'L') } : null;
    if (P.mirror) {
      this.setIK(P.mirror.chain, true, { undo: false, quiet: true });
      eng.evaluate(f0);
      P.mirror.start = eng.ikState[P.mirror.chain].target.clone();
      P.mirror.startQ = eng.ikState[P.mirror.chain].targetQ.clone();
    }
    const hit = (e) => {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      P.ray.setFromCamera(ndc, vp.camera);
      return P.ray.ray.intersectPlane(P.plane, new THREE.Vector3());
    };
    P.onMove = (e) => {
      if (P.rot) {
        if (!P.mouse0) P.mouse0 = [e.clientX, e.clientY];
        const dx = e.clientX - P.mouse0[0];
        const dy = e.clientY - P.mouse0[1];
        P.ang = THREE.MathUtils.clamp((P.rot === 'secondary' ? dy : dx) * 0.008 * P.sens, -Math.PI * 0.9, Math.PI * 0.9);
        if (!P.record) this.puppetKey(Math.round(eng.frame));
        return;
      }
      const p = hit(e);
      if (!p) return;
      if (!P.origin) P.origin = p.clone();
      P.offset.copy(p).sub(P.origin).multiplyScalar(P.sens);
      // un control nunca se va lejos del cuerpo (antes podía salir disparado si el rayo rozaba el plano)
      if (P.offset.length() > P.reach) P.offset.setLength(P.reach);
      if (!P.record) this.puppetKey(Math.round(eng.frame));
    };
    P.onDown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.puppetStop();
    };
    P.onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.puppetStop();
      }
    };
    canvas.addEventListener('pointermove', P.onMove);
    canvas.addEventListener('pointerdown', P.onDown, { capture: true });
    window.addEventListener('keydown', P.onKey, { capture: true });
    this.viewport.attachGizmo?.(null);
    if (record) {
      this.playOnce = true;
      this.playDir = 1;
      this.playing = true;
      this.panels?.refreshTransport?.();
    }
    this.panels?.refreshMotion?.();
    this.toast?.(record ? 'Títere grabando: mueve el ratón sobre el visor · clic o Esc para parar' : 'Títere en vista previa: mueve el ratón sobre el visor · clic o Esc para parar');
    return true;
  };

  /** Clave del títere en el fotograma f (con los pines aplicados). Lo llama el bucle al grabar. */
  app.puppetKey = function (f) {
    const P = this.puppet;
    if (!P) return;
    const eng = this.engine;
    const rig = this.rig;
    const target = P.start.clone().add(P.offset);
    if (P.rot) {
      const R = new THREE.Quaternion().setFromAxisAngle(P.rotAxis, P.ang);
      const wq = R.clone().multiply(P.startQ);
      if (P.tgt.kind === 'hips') {
        const hb = rig.bone('hips');
        eng.evaluate(f, { ik: false });
        const local = hb.parent ? hb.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq) : wq;
        eng.keyBone(hb, local, null, f);
        this._locks = P.locks;
        this.applyLocks(f);
      } else {
        eng.keyIK(P.tgt.chain, { quat: wq }, f);
        if (P.mirror) {
          // giro reflejado: mismo ángulo con el eje reflejado en el plano medio del personaje
          const ax = rig.worldToCanonVec(P.rotAxis.clone());
          ax.x = -ax.x;
          const Rm = new THREE.Quaternion().setFromAxisAngle(rig.canonToWorldVec(ax).normalize(), -P.ang);
          eng.keyIK(P.mirror.chain, { quat: Rm.multiply(P.mirror.startQ.clone()) }, f);
        }
      }
    } else if (P.tgt.kind === 'hips') {
      const hb = rig.bone('hips');
      eng.evaluate(f, { ik: false });
      eng.keyBone(hb, null, hb.parent ? hb.parent.worldToLocal(target.clone()) : target, f);
      this._locks = P.locks;
      this.applyLocks(f);
    } else {
      eng.keyIK(P.tgt.chain, { pos: target }, f);
      if (P.mirror) {
        const d = rig.worldToCanonVec(P.offset.clone());
        d.x = -d.x;
        eng.keyIK(P.mirror.chain, { pos: P.mirror.start.clone().add(rig.canonToWorldVec(d)) }, f);
      }
    }
    P.lastF = f;
    eng.evaluate(eng.frame);
  };

  /** Lo llama el bucle de reproducción antes de evaluar cada fotograma. */
  app.puppetTick = function (f) {
    const P = this.puppet;
    if (!P?.record) return;
    const fi = Math.round(f);
    if (fi < P.lastF) return this.puppetStop(); // dio la vuelta: termina la toma
    if (fi !== P.lastF) this.puppetKey(fi);
  };

  app.puppetStop = function (announce = true) {
    const P = this.puppet;
    if (!P) return false;
    const canvas = this.viewport.renderer.domElement;
    canvas.removeEventListener('pointermove', P.onMove);
    canvas.removeEventListener('pointerdown', P.onDown, { capture: true });
    window.removeEventListener('keydown', P.onKey, { capture: true });
    this.puppet = null;
    if (P.record) {
      this.playing = false;
      this.playOnce = false;
      this.panels?.refreshTransport?.();
    }
    this._locks = [];
    this.changed();
    this.attachGizmo();
    this.panels?.refreshMotion?.();
    if (announce) this.toast?.(P.record ? `Títere: toma grabada hasta el fotograma ${P.lastF}` : 'Títere parado');
    return true;
  };

  // ---------- Mantener la edición en toda la tira ----------
  /** Antes de un arrastre: foto de las pistas de la capa activa (para saber cuáles cambió). */
  app.holdSnapshot = function () {
    const l = this.engine.layer();
    this._holdSnap = { layer: l.id, tracks: Object.fromEntries(Object.entries(l.tracks).map(([k, v]) => [k, JSON.stringify(v)])) };
  };

  /**
   * Tras un arrastre con «Mantener en toda la tira»: cada pista cambiada queda con el mismo valor del principio al
   * final de la tira donde está el cabezal (como una edición sobre un clip en iClone). Fuera de la tira no cambia nada.
   */
  app.holdToStrip = function (f = Math.round(this.engine.frame)) {
    const snap = this._holdSnap;
    this._holdSnap = null;
    const eng = this.engine;
    const l = eng.layer();
    if (!snap || snap.layer !== l.id) return 0;
    const s = eng.doc.strips.filter((x) => !x.mute && f >= x.start - 1e-6 && f <= x.start + x.len - 1 + 1e-6).sort((a, b) => b.start - a.start)[0];
    if (!s) return 0;
    const a = Math.round(s.start);
    const b = Math.round(s.start + s.len - 1);
    let n = 0;
    for (const [id, ks] of Object.entries(l.tracks)) {
      if (snap.tracks[id] === JSON.stringify(ks)) continue;
      // los efectores IK son posiciones en el mundo: mantenerlos clavaría la mano o el pie mientras el cuerpo anda
      if (id.startsWith('ik:')) continue;
      const k = ks.find((x) => Math.abs(x.f - f) < 0.5);
      if (!k) continue;
      const v = k.v.slice ? k.v.slice() : k.v;
      l.tracks[id] = ks.filter((x) => x.f < a - 0.5 || x.f > b + 0.5);
      setKey(l, id, a, v);
      if (b !== a) setKey(l, id, b, v);
      n++;
    }
    if (n) this.toast?.(`Edición mantenida en toda la tira (${a}–${b})`);
    return n;
  };

  // ---------- Capas de animación ----------
  app.addNamedLayer = function (name) {
    const d = this.engine.doc;
    this.pushUndo();
    const l = newLayer(uid('capa'), name || `Capa ${d.layers.length}`);
    d.layers.push(l);
    d.activeLayer = l.id;
    this.changed();
    this.panels?.refreshLayers?.();
    this.panels?.refreshMotion?.();
    return l;
  };
  app.toggleLayer = function (id, on) {
    const l = this.engine.doc.layers.find((x) => x.id === id);
    if (!l) return false;
    this.pushUndo();
    l.mute = on === undefined ? !l.mute : !on;
    this.changed();
    this.panels?.refreshLayers?.();
    this.panels?.refreshMotion?.();
    return true;
  };

  /** Copia las claves del fotograma actual de la capa activa (de lo elegido, o todas). */
  app.copyFrameKeys = function () {
    const f = Math.round(this.engine.frame);
    const l = this.engine.layer();
    const filter = this.selection ? this.trackFilter() : null;
    const out = {};
    for (const [id, ks] of Object.entries(l.tracks)) {
      if (filter && !filter(id)) continue;
      const k = ks.find((x) => Math.abs(x.f - f) < 0.5);
      if (k) out[id] = JSON.parse(JSON.stringify(k));
    }
    this._frameKeys = out;
    const n = Object.keys(out).length;
    this.toast?.(n ? `${n} clave(s) copiadas del fotograma ${f}` : 'No hay claves en este fotograma', !n);
    return n;
  };
  app.pasteFrameKeys = function () {
    const src = this._frameKeys;
    if (!src || !Object.keys(src).length) return this.toast?.('Primero copia las claves de un fotograma', true), 0;
    const l = this.engine.layer();
    if (l.lock) return this.toast?.('La capa está bloqueada', true), 0;
    const f = Math.round(this.engine.frame);
    this.pushUndo();
    for (const [id, k] of Object.entries(src)) setKey(l, id, f, k.v.slice ? k.v.slice() : k.v, k.i);
    this.changed();
    this.toast?.(`Claves pegadas en el fotograma ${f}`);
    return Object.keys(src).length;
  };
}
