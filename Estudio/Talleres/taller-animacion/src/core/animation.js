// Documento de animación: tiras (clips en la base), capas con claves, IK. Evalúa la pose final.
import * as THREE from 'three';
import { IK_CHAINS } from './humanoid.js';
import { newPose, sampleClip, blendPose } from './clip.js';
import { solveTwoBone, getWorldQuat, setWorldQuat, limbInfo, limbFrame, solveLimb } from './ik.js';
import { bakeBones } from './edit/bake.js'; // (ciclo de módulos sin uso al cargar: solo se llama en tiempo de ejecución)
import { limitEdit } from './limits.js';
import { guardArms, measureBody } from './acting.js';
import { sampleRoot, aimAt, angleDiff } from './director.js';
import { applyHorsePose, horseChains, solveHorseChain, normalizeHorsePose, repairHorseDeformation } from './horse-editor.js';
import { anatomicalSystem } from './anatomical-constraints.js';

/** Nudos [[x, y], …] crecientes en x, pendiente 1 fuera (mismo cálculo que src/core/edit/retime.js). */
function knotsAt(k, x) {
  if (x <= k[0][0]) return k[0][1] + (x - k[0][0]);
  const n = k.length;
  if (x >= k[n - 1][0]) return k[n - 1][1] + (x - k[n - 1][0]);
  let i = 1;
  while (k[i][0] < x) i++;
  const u = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1);
  return k[i - 1][1] + u * (k[i][1] - k[i - 1][1]);
}

// Look At: cuánto gira cada parte de lo que falta para mirar al objetivo y su tope en grados [giro, inclinación].
// Orden natural: primero los ojos, luego la cabeza y al final el torso (cada parte llega un poco después).
const LOOK_CHAIN = [
  { c: 'chest', part: 'chest', share: 0.1, max: [14, 6], delay: 3, slow: 1.5 },
  { c: 'upperChest', part: 'chest', share: 0.16, max: [18, 8], delay: 3, slow: 1.5 },
  { c: 'neck', part: 'head', share: 0.42, max: [32, 18], delay: 1, slow: 1 },
  { c: 'head', part: 'head', share: 1, max: [48, 30], delay: 1, slow: 1 },
];
const LOOK_EYES = { max: [28, 18], slow: 0.45 };
const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const _lp0 = new THREE.Vector3();
const _lp1 = new THREE.Vector3();

const _root = { x: 0, z: 0, yaw: 0, y: 0 };
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _id = new THREE.Quaternion();

let _uid = 1;
export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`;

/** Valores de los documentos nuevos (las Preferencias del Taller cambian `fps`). */
export const DOC_DEFAULTS = { fps: 30 };

export function newDocument() {
  return {
    fps: DOC_DEFAULTS.fps,
    start: 0,
    end: 75,
    rangeMode: 'auto', // auto: lo que duren las tiras
    strips: [],
    layers: [newLayer('base', 'Base')],
    activeLayer: 'base',
    ik: { handL: false, handR: false, footL: false, footR: false },
    floor: false, // los pies no atraviesan el suelo
    reach: true, // la columna y el hombro acompañan a la mano cuando el brazo no llega
    collide: false, // los brazos no atraviesan el cuerpo
    pinY: {}, // cadenas cuyas anclas solo fijan la altura (clips «en el sitio»)
    adjust: { armsV: 0, armsH: 0, posture: 0, chestH: 0, chestV: 0, headV: 0, headH: 0, speed: 1 },
    ikv: 2, // 2: polo en el marco de la cadera (sigue al cuerpo); 1: marco de reposo (documentos antiguos)
  };
}

/** Versión del IK de un documento cargado: los antiguos sin «ikv» que ya traen polos se leen como entonces. */
export function ikVersion(doc) {
  if (doc?.ikv) return doc.ikv;
  const old = (doc?.layers || []).some((l) => Object.keys(l.tracks || {}).some((k) => /^ik:[^:]+:pole$/.test(k)));
  return old ? 1 : 2;
}

export function newLayer(id, name) {
  return { id, name, mode: 'add', weight: 1, mute: false, solo: false, lock: false, mask: null, tracks: {} };
}

// ---------- Pistas ----------
// r:<hueso> cuaternión (aditivo: delta local; sustituir: local absoluto)
// t:<hueso> posición local (aditivo: desplazamiento; sustituir: absoluto)
// ik:<cadena>:pos  desplazamiento canónico del objetivo   ik:<cadena>:abs posición canónica absoluta
// ik:<cadena>:rot  delta canónico de rotación del efector ik:<cadena>:pole desplazamiento del polo

// ik:<cadena>:w    mezcla IK↔FK (x: 0 = FK puro, 1 = IK puro)
// ik:<cadena>:absq rotación canónica absoluta del efector (ancla)   ik:<cadena>:absw peso del ancla (x: 0..1)

export const isQuatTrack = (id) => id.startsWith('r:') || id.endsWith(':rot') || id.endsWith(':absq');

export function trackKind(id) {
  return isQuatTrack(id) ? 'quat' : 'vec';
}

/** Curva Bézier de tiempo (como cubic-bezier de CSS): b = [x1, y1, x2, y2]; y puede salirse de 0..1 (anticipación, rebote). */
export function bezierEase(b, u) {
  const [x1, y1, x2, y2] = b;
  const X = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  let lo = 0;
  let hi = 1;
  let t = u;
  for (let i = 0; i < 24; i++) {
    const x = X(t);
    if (Math.abs(x - u) < 1e-6) break;
    if (x < u) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

export const EASE_PRESETS = [
  ['Suave', [0.42, 0, 0.58, 1]],
  // Sin tangente vertical en los extremos (x=1 con y<1, o x=0 con y>0): eso daba un salto de velocidad en la clave.
  ['Sale lento', [0.55, 0, 0.9, 0.6]],
  ['Llega lento', [0.1, 0.4, 0.45, 1]],
  ['Muy suave', [0.7, 0, 0.3, 1]],
  ['Anticipación', [0.4, -0.35, 0.6, 1]],
  ['Se pasa y vuelve', [0.3, 0, 0.4, 1.35]],
  ['Anticipa y se pasa', [0.5, -0.3, 0.5, 1.3]],
];

// Interpolaciones: 'smooth' (entra y sale suave), 'auto' (curva continua tipo Catmull-Rom),
// 'linear', 'step' (mantiene hasta la siguiente). Cada clave guarda la de su tramo de salida.
// 'in' (sale lento de la clave), 'out' (llega lento a la siguiente), 'bezier' (curva propia en k.b).
export const INTERPS = [['auto', 'Automática'], ['smooth', 'Suave'], ['linear', 'Lineal'], ['in', 'Sale lento'], ['out', 'Llega lento'], ['bezier', 'Curva propia'], ['step', 'Escalón']];

export function sampleTrack(keys, f, out) {
  const quat = out.isQuaternion;
  if (!keys.length) return null;
  if (f <= keys[0].f) return out.fromArray(keys[0].v);
  const last = keys[keys.length - 1];
  if (f >= last.f) return out.fromArray(last.v);
  let i = 1;
  while (keys[i].f < f) i++;
  const k0 = keys[i - 1];
  const k1 = keys[i];
  let u = (f - k0.f) / (k1.f - k0.f);
  const mode = k0.i || 'smooth';
  if (k0.bc) return sampleChannels(k0, k1, u, mode, out);
  if (mode === 'step') u = 0;
  else if (mode === 'smooth') u = u * u * (3 - 2 * u);
  else if (mode === 'in') u = u * u;
  else if (mode === 'out') u = 1 - (1 - u) * (1 - u);
  else if (mode === 'bezier') u = bezierEase(k0.b || [0.42, 0, 0.58, 1], u);
  if (mode === 'auto' && !quat) {
    // Hermite con tangentes de los vecinos (no se pasa de las claves en tramos monótonos)
    const kp = keys[i - 2] || k0;
    const kn = keys[i + 1] || k1;
    const dt = k1.f - k0.f;
    const n = k0.v.length;
    const arr = new Array(n);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    for (let c = 0; c < n; c++) {
      const m0 = kp === k0 ? 0 : ((k1.v[c] - kp.v[c]) / (k1.f - kp.f)) * dt;
      const m1 = kn === k1 ? 0 : ((kn.v[c] - k0.v[c]) / (kn.f - k0.f)) * dt;
      arr[c] = h00 * k0.v[c] + h10 * m0 + h01 * k1.v[c] + h11 * m1;
    }
    return out.fromArray(arr);
  }
  if (mode === 'auto') u = u * u * (3 - 2 * u) * 0.5 + u * 0.5;
  if (quat) {
    out.fromArray(k0.v);
    _q2.fromArray(k1.v);
    if (u < 0 || u > 1) return slerpFree(out, _q2, u);
    return out.slerp(_q2, u);
  }
  out.fromArray(k0.v);
  _v2.fromArray(k1.v);
  return out.lerp(_v2, u);
}

/** Avance del tramo (0..1) según su interpolación, sin tangentes por canal. */
export function easeOf(mode, k0, u) {
  if (mode === 'step') return 0;
  if (mode === 'smooth') return u * u * (3 - 2 * u);
  if (mode === 'in') return u * u;
  if (mode === 'out') return 1 - (1 - u) * (1 - u);
  if (mode === 'bezier') return bezierEase(k0.b || [0.42, 0, 0.58, 1], u);
  if (mode === 'auto') return u * u * (3 - 2 * u) * 0.5 + u * 0.5;
  return u;
}

/** Tangentes equivalentes (Bézier) de cada interpolación, para empezar a editar un canal desde lo que ya se ve. */
export function bezierOf(k) {
  const m = k.i || 'smooth';
  if (m === 'bezier' && k.b) return k.b.slice();
  return { linear: [0.333, 0.333, 0.667, 0.667], in: [0.5, 0, 0.75, 0.5], out: [0.25, 0.5, 0.5, 1], step: [1, 0, 1, 0] }[m] || [0.42, 0, 0.58, 1];
}

const _e0 = new THREE.Euler();
const _e1 = new THREE.Euler();
/**
 * Tramo con tangentes por canal (k0.bc = { canal: [x1, y1, x2, y2] }): cada canal (X, Y, Z) avanza con su propia curva.
 * Las rotaciones se interpolan aquí por ángulos de Euler XYZ, que es lo que muestra y edita el editor de curvas.
 */
function sampleChannels(k0, k1, u, mode, out) {
  const quat = out.isQuaternion;
  let a = k0.v;
  let b = k1.v;
  if (quat) {
    _e0.setFromQuaternion(_q2.fromArray(k0.v));
    _e1.setFromQuaternion(_q2.fromArray(k1.v));
    a = [_e0.x, _e0.y, _e0.z];
    b = [_e1.x, _e1.y, _e1.z].map((x, c) => x - Math.round((x - a[c]) / (2 * Math.PI)) * 2 * Math.PI);
  }
  const base = easeOf(mode, k0, u);
  const r = a.map((x, c) => x + (b[c] - x) * (k0.bc[c] ? bezierEase(k0.bc[c], u) : base));
  if (quat) return out.setFromEuler(_e0.set(r[0], r[1], r[2]));
  return out.fromArray(r);
}

/** Slerp que también extrapola (u < 0 o u > 1), para curvas que se pasan del valor. */
function slerpFree(a, b, u) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const s = cos < 0 ? -1 : 1;
  cos = Math.min(1, Math.abs(cos));
  const th = Math.acos(cos);
  if (th < 1e-5) return a;
  const sn = Math.sin(th);
  const wa = Math.sin((1 - u) * th) / sn;
  const wb = (Math.sin(u * th) / sn) * s;
  return a.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb, a.w * wa + b.w * wb).normalize();
}

export const KEY_DEFAULTS = { interp: 'smooth' };

export function setKey(layer, track, f, v, interp) {
  interp ||= undefined;
  const keys = layer.tracks[track] || (layer.tracks[track] = []);
  const fr = Math.round(f);
  const k = keys.find((x) => x.f === fr);
  const val = Array.from(v, (x) => +(+x).toFixed(6));
  if (k) {
    k.v = val;
    if (interp) k.i = interp;
  } else {
    keys.push({ f: fr, v: val, i: interp || KEY_DEFAULTS.interp });
    keys.sort((a, b) => a.f - b.f);
  }
}

function scaleQuat(q, s, out) {
  // q^s
  out.copy(q);
  if (out.w < 0) out.set(-out.x, -out.y, -out.z, -out.w);
  const ang = 2 * Math.acos(Math.min(1, out.w));
  if (ang < 1e-8) return out.identity();
  const sn = Math.sin(ang / 2);
  _v.set(out.x / sn, out.y / sn, out.z / sn);
  return out.setFromAxisAngle(_v, ang * s);
}

// ---------- Motor ----------

export class Engine {
  constructor(rig, library) {
    this.rig = rig;
    this.library = library; // Map id → clip
    this.doc = newDocument();
    this.pose = newPose();
    this._tmpPose = newPose();
    this.ikState = {}; // por cadena: fk/final para los gizmos
    this.frame = 0;
  }

  get fps() {
    return this.doc.fps;
  }

  stripsEnd() {
    return this.doc.strips.reduce((m, s) => Math.max(m, s.start + s.len), 0);
  }

  range() {
    const d = this.doc;
    if (d.rangeMode === 'auto') {
      const e = this.stripsEnd();
      let maxKey = 0;
      for (const l of d.layers) for (const k of Object.values(l.tracks)) for (const x of k) maxKey = Math.max(maxKey, x.f);
      return [0, Math.max(e > 0 ? e - 1 : 0, maxKey, e > 0 ? 1 : 60)];
    }
    return [d.start, d.end];
  }

  activeLayers() {
    const ls = this.doc.layers.filter((l) => !l.mute);
    const solo = ls.filter((l) => l.solo);
    return solo.length ? solo.concat(ls.filter((l) => l.id === 'base' && !solo.includes(l))) : ls;
  }

  maskWeight(layer, bone) {
    if (!layer.mask) return 1;
    return layer.mask.includes(this.rig.groupOf.get(bone)) ? 1 : 0;
  }

  /** Pose canónica de la base (tiras) en el fotograma f. Devuelve null si no hay tiras activas. */
  basePose(f) {
    const strips = this.doc.strips.filter((s) => !s.mute && f >= s.start - 1e-6 && f <= s.start + s.len - 1 + 1e-6);
    if (!strips.length) {
      // mantener la última tira terminada (o la primera si aún no empieza)
      const before = this.doc.strips.filter((s) => !s.mute && s.start + s.len - 1 < f).sort((a, b) => b.start + b.len - (a.start + a.len))[0];
      const after = this.doc.strips.filter((s) => !s.mute).sort((a, b) => a.start - b.start)[0];
      const s = before || after;
      if (!s) return null;
      const ff = before ? s.start + s.len - 1 : s.start;
      return this.stripPose(s, ff, this.pose);
    }
    strips.sort((a, b) => a.start - b.start);
    let pose = this.stripPose(strips[0], f, this.pose);
    for (let i = 1; i < strips.length; i++) {
      const s = strips[i];
      const w = s.blend > 0 ? THREE.MathUtils.clamp((f - s.start) / s.blend, 0, 1) : 1;
      const p2 = this.stripPose(s, f, this._tmpPose);
      if (p2) pose = pose ? blendPose(pose, p2, w) : p2;
    }
    return pose;
  }

  stripPose(s, f, out) {
    const clip = this.library.get(s.clipId);
    if (!clip) return null;
    // Clip de la biblioteca cargado solo como ficha: se piden sus pistas y esta vez no aporta pose.
    if (!clip.tracks) {
      this.onMissingClip?.(s.clipId);
      return null;
    }
    // Retimer con marcadores: nudos [fotograma nuevo (relativo al inicio), fotograma original] (src/core/edit/retime.js)
    const local = s.timeMap?.k?.length ? knotsAt(s.timeMap.k, f - s.start) : f - s.start;
    const L = s.timeMap?.len0 ?? s.len;
    let t = local / this.doc.fps;
    // Curva de tiempo de la tira: mismo principio y fin, otro reparto de la velocidad.
    if (s.warp && L > 1) t = (bezierEase(s.warp, THREE.MathUtils.clamp(local / (L - 1), 0, 1)) * (L - 1)) / this.doc.fps;
    // Tira cortada (o recortada por delante): empieza más adentro del clip.
    if (s.offset) t += s.offset / this.doc.fps;
    out.q = {};
    const p = sampleClip(clip, t, out, {
      loop: s.loop, speed: (s.speed || 1) * (this.doc.adjust.speed || 1), mirror: s.mirror, reverse: s.reverse,
      inPlace: s.inPlace ? { x: s.lockX !== false, y: !!s.lockY, z: s.lockZ !== false } : null,
      anchor: !!s.anchor,
    });
    if(this.rig.kind==='quadruped') normalizeHorsePose(this.rig,p);
    return this.applyStripRoot(s, p);
  }

  /**
   * Dirección de movimiento de la tira (como la Motion Direction Control de iClone):
   * s.root = { x, y, z (metros, ejes del personaje), yaw (grados) } gira el clip entero sobre la vertical y lo traslada.
   */
  applyStripRoot(s, pose) {
    const r = s.root;
    if (!r || !pose) return pose;
    if (r.yaw) {
      if (pose.native) pose.nativeYaw = THREE.MathUtils.degToRad(r.yaw);
      _q.setFromAxisAngle(_up, THREE.MathUtils.degToRad(r.yaw));
      for (const c in pose.q) pose.q[c].premultiply(_q);
      pose.hips.applyQuaternion(_q);
    }
    const H = this.rig.hipsHeight || 1;
    pose.hips.x += (r.x || 0) / H;
    pose.hips.y += (r.y || 0) / H;
    pose.hips.z += (r.z || 0) / H;
    return pose;
  }

  /**
   * Alinea una tira con la anterior (su primer fotograma continúa donde acaba la otra) o con la siguiente
   * (su último fotograma acaba donde empieza la otra). translate/rotate eligen qué se alinea. Guarda lo anterior para «Revertir».
   */
  alignStrip(id, { to = 'prev', translate = true, rotate = true } = {}) {
    const s = this.doc.strips.find((x) => x.id === id);
    const list = this.doc.strips.filter((x) => !x.mute || x === s).sort((a, b) => a.start - b.start);
    const i = list.indexOf(s);
    const o = to === 'next' ? list[i + 1] : list[i - 1];
    if (!s || !o) return null;
    const sample = (st, f) => {
      const p = this.stripPose(st, f, newPose());
      return p && { q: Object.fromEntries(Object.entries(p.q).map(([k, v]) => [k, v.clone()])), hips: p.hips.clone() };
    };
    const yawOf = (p) => {
      const v = new THREE.Vector3(0, 0, 1).applyQuaternion(p.q.hips || new THREE.Quaternion());
      return Math.atan2(v.x, v.z);
    };
    const old = s.root ? { ...s.root } : null;
    delete s.root;
    const pS = sample(s, to === 'next' ? s.start + s.len - 1 : s.start);
    const pO = sample(o, to === 'next' ? o.start : o.start + o.len - 1);
    if (!pS || !pO) {
      if (old) s.root = old;
      return null;
    }
    let yaw = 0;
    if (rotate) {
      yaw = yawOf(pO) - yawOf(pS);
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    }
    const H = this.rig.hipsHeight || 1;
    const moved = pS.hips.clone().applyQuaternion(_q.setFromAxisAngle(_up, yaw));
    // sin «Trasladar», el giro pivota sobre la propia cadera de la tira (no se desplaza)
    const d = (translate ? pO.hips.clone() : pS.hips.clone()).sub(moved).multiplyScalar(H);
    s.root = { x: +d.x.toFixed(4), y: 0, z: +d.z.toFixed(4), yaw: +THREE.MathUtils.radToDeg(yaw).toFixed(2) };
    s.rootPrev = old;
    return s.root;
  }

  /** Deshace el último «Alinear» de la tira. */
  revertStripAlign(id) {
    const s = this.doc.strips.find((x) => x.id === id);
    if (!s) return null;
    if (s.rootPrev) s.root = s.rootPrev;
    else delete s.root;
    delete s.rootPrev;
    return s.root || null;
  }

  /**
   * Motion Director: suma a la pose la trayectoria de la raíz (doc.root, en metros y giro sobre el suelo).
   * Gira el cuerpo entero alrededor de la vertical de la cadera y lo traslada. Parte siempre de la pose de las tiras.
   */
  applyRoot(pose, f) {
    const root = this.doc.root;
    if (!root || !root.v || root.v.length < 3) return;
    sampleRoot(root, f, _root);
    if (!_root.x && !_root.z && !_root.yaw && !_root.y) return;
    if (_root.yaw) {
      if (pose.native) pose.nativeYaw = (pose.nativeYaw || 0) + _root.yaw;
      _q.setFromAxisAngle(_up, _root.yaw);
      for (const c in pose.q) pose.q[c].premultiply(_q);
      pose.hips.applyQuaternion(_q);
    }
    pose.hips.add(_v.set(_root.x, _root.y, _root.z).applyQuaternion(this.rig.FqInv).divideScalar(this.rig.hipsHeight));
  }

  /**
   * Montura (Biblioteca › Animales): desplazamiento de la cadera en metros de mundo para sentar al personaje sobre un animal.
   * Solo de visualización: no se guarda en el documento ni entra en las exportaciones. null = sin montura.
   */
  applyMount(pose) {
    const m = this.mount;
    if (!m) return;
    pose.hips.add(_v.set(m[0], m[1], m[2]).applyQuaternion(this.rig.FqInv).divideScalar(this.rig.hipsHeight));
  }

  /** Evalúa capas en f. stopAt: índice de capa (exclusivo) para obtener la pose "debajo". */
  evaluate(f, { stopAt = Infinity, ik = true } = {}) {
    this.frame = f;
    const rig = this.rig;
    const horse = rig.kind === 'quadruped';
    if (ik && this.doc.collide && !horse) measureBody(rig); // mide el cuerpo en reposo una sola vez (queda en caché)
    const base = this.basePose(f);
    if (horse) {
      if (base?.native) this.applyRoot(base, f);
      applyHorsePose(rig, base);
      if(base?.nativeNeedsRepair) repairHorseDeformation(rig);
      if (base?.native) {
        const hips = rig.bone('hips');
        if (hips && base.hips.lengthSq()) {
          const p = hips.getWorldPosition(new THREE.Vector3()).add(rig.canonToWorldVec(base.hips));
          hips.position.copy(hips.parent.worldToLocal(p));
        }
        if (hips && base.nativeYaw) {
          const q = new THREE.Quaternion().setFromAxisAngle(_up, base.nativeYaw).multiply(hips.getWorldQuaternion(new THREE.Quaternion()));
          setWorldQuat(hips, q);
        }
        rig.root.updateMatrixWorld(true);
      }
    } else if (base) {
      this.applyAdjust(base, f);
      this.applyRoot(base, f);
      this.applyMount(base);
      rig.applyCanonical(base);
    } else rig.resetToRest();
    const anatomy = horse ? anatomicalSystem(rig) : null;
    if (anatomy) {
      const source = this.library.get(this.doc.strips.find(s => !s.mute && f >= s.start && f < s.start+s.len)?.clipId || this.doc.strips[0]?.clipId);
      anatomy.begin(this.doc.anatomyMode || 'anatomico', source);
    }
    const layers = this.activeLayers();
    const all = this.doc.layers;
    for (const layer of layers) {
      if (all.indexOf(layer) >= stopAt) break;
      this.applyLayer(layer, f);
    }
    rig.root.updateMatrixWorld(true);
    // Controles temporales en espacio mundo (Herramientas · World Space Ctrls): mantienen giro/posición de mundo.
    if (this.doc.temp?.length) this.applyTempWorld(f);
    if (anatomy) {
      anatomy.apply();
      for (const chain of Object.keys(anatomy.chains)) anatomy.couple(chain);
    }
    // Look At antes del IK (el torso gira y los brazos lo siguen) y la cabeza otra vez después (el alcance inclina la columna).
    const look = ik && !!this.doc.aim?.look?.length;
    if (look) this.applyLook(f);
    if (ik) this.applyIK(f, stopAt);
    if (look) this.applyLook(f, true);
    if (ik && this.doc.collide && !horse && guardArms(rig)) rig.root.updateMatrixWorld(true);
    this.evaluateFace?.(f);
    // Pareja montada (Animales): cualquier evaluación deja al jinete sin sentar; el Taller debe volver a sentarlo.
    this.onEvaluated?.();
  }

  // ---------- Objetivos: Look At y Reach Target ----------
  /** Posición en el mundo de un objetivo del plan (this.resolveTarget lo deja seguir a una pieza, a la cámara…). */
  targetWorld(id, out = new THREE.Vector3()) {
    const t = this.doc.director?.targets?.find((x) => x.id === id);
    if (!t) return null;
    const live = this.resolveTarget?.(t, out);
    if (live) return live;
    const o = this.rig.restWorldPos.hips;
    return out.set((+t.pos[0] || 0) + o.x, +t.pos[1] || 0, (+t.pos[2] || 0) + o.z);
  }

  /**
   * Estado de un canal (look, handL, handR) en f: punto al que apunta y peso. La transición entre dos objetivos
   * barre de uno a otro; hacia «sin objetivo» baja el peso. delay y slow retrasan o alargan la de una parte del cuerpo.
   */
  aimState(ch, f, delay = 0, slow = 1) {
    const s = aimAt(this.doc.aim?.[ch], f);
    if (!s) return null;
    const { cur, prev } = s;
    const u = cur.b > 0 ? smooth01((f - cur.f - delay) / Math.max(1, cur.b * slow)) : f - cur.f >= delay ? 1 : 0;
    const p1 = cur.t ? this.targetWorld(cur.t, _lp1) : null;
    const p0 = prev && prev.t ? this.targetWorld(prev.t, _lp0) : null;
    const w1 = p1 ? cur.w ?? 1 : 0;
    const w0 = p0 ? prev.w ?? 1 : 0;
    const w = w0 + (w1 - w0) * u;
    if (w < 1e-4 || (!p0 && !p1)) return null;
    const p = p0 && p1 ? p0.clone().lerp(p1, u) : (p1 || p0).clone();
    return { p, w, cur, prev, u };
  }

  /**
   * Look At: ojos → cabeza → torso giran hacia el objetivo, cada uno hasta su tope. Giro (sobre la vertical) e
   * inclinación por separado: la cabeza no se ladea. Sin estado entre fotogramas: cualquier fotograma da la misma pose.
   */
  applyLook(f, headOnly = false) {
    const rig = this.rig;
    const head = rig.bone('head');
    if (!head || !rig.restWorldQ?.head) return false;
    const D = Math.PI / 180;
    const fwd = new THREE.Vector3();
    const hp = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const hq = new THREE.Quaternion();
    const pw = new THREE.Quaternion();
    const restInv = rig.restWorldQ.head.clone().invert();
    // el frente del personaje sobre el suelo (el eje del cuerpo puede venir algo inclinado en la pose de reposo)
    const front = rig.frame.fwd.clone().setY(0).normalize();
    let any = false;
    /** Lo que le falta a la cabeza para mirar a p: [giro, inclinación] en radianes, y cuánto se atenúa si queda detrás. */
    const error = (p) => {
      head.updateWorldMatrix(true, false);
      head.matrixWorld.decompose(hp, hq, _v2);
      fwd.copy(front).applyQuaternion(hq.multiply(restInv)).normalize();
      dir.copy(p).sub(hp);
      // la mirada sale de los ojos, algo por encima y por delante del hueso de la cabeza
      dir.y -= rig.hipsHeight * 0.09;
      if (dir.lengthSq() < 1e-8) return null;
      dir.normalize();
      const yaw = angleDiff(Math.atan2(fwd.x, fwd.z), Math.atan2(dir.x, dir.z));
      const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
      // objetivo a la espalda: no se retuerce; la mirada se suelta poco a poco
      const behind = 1 - smooth01((Math.abs(yaw) - 115 * D) / (50 * D));
      return [yaw, pitch, behind];
    };
    const turn = (b, yaw, pitch) => {
      if (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5) return;
      _q.setFromAxisAngle(_up, yaw);
      // inclinación alrededor del eje lateral de la cabeza ya girada
      axis.set(fwd.x, 0, fwd.z).applyQuaternion(_q).normalize();
      axis.set(axis.z, 0, -axis.x);
      _q2.setFromAxisAngle(axis, -pitch);
      _q.premultiply(_q2);
      b.parent.getWorldQuaternion(pw);
      b.quaternion.copy(pw.clone().invert().multiply(_q.multiply(pw.multiply(b.quaternion))));
      b.updateMatrixWorld(true);
      any = true;
    };
    for (const L of LOOK_CHAIN) {
      if (headOnly && L.part !== 'head') continue;
      const b = rig.bone(L.c);
      if (!b || !b.parent) continue;
      const st = this.aimState('look', f, L.delay, L.slow);
      if (!st || st.cur.parts?.[L.part] === false) continue;
      const e = error(st.p);
      if (!e) continue;
      const k = L.share * st.w * e[2];
      turn(b, THREE.MathUtils.clamp(e[0] * k, -L.max[0] * D, L.max[0] * D), THREE.MathUtils.clamp(e[1] * k, -L.max[1] * D, L.max[1] * D));
    }
    // Ojos: llegan antes que la cabeza y cubren lo que ella no alcanza. Con huesos de ojo se giran; el resto queda
    // en this.lookEyes (giro e inclinación en grados) para quien mueva el rostro con shape keys.
    const es = headOnly ? this.aimState('look', f, 0, LOOK_EYES.slow) : null;
    if (headOnly) this.lookEyes = null;
    if (es && es.cur.parts?.eyes !== false) {
      const e = error(es.p);
      if (e) {
        const yaw = THREE.MathUtils.clamp(e[0] * es.w * e[2], -LOOK_EYES.max[0] * D, LOOK_EYES.max[0] * D);
        const pitch = THREE.MathUtils.clamp(e[1] * es.w * e[2], -LOOK_EYES.max[1] * D, LOOK_EYES.max[1] * D);
        this.lookEyes = { yaw: yaw / D, pitch: pitch / D };
        for (const eye of rig.eyeBones || (rig.eyeBones = rig.bones.filter((b) => /(^|[^a-z])(eye|ojo)([^a-z]|$)/i.test(b.name.replace(/([a-z])([A-Z])/g, '$1_$2')) && !/brow|lid|lash|ceja|parpado/i.test(b.name)))) if (eye.parent) turn(eye, yaw, pitch);
      }
    }
    return any;
  }

  applyLayer(layer, f) {
    const rig = this.rig;
    const wLayer = this.layerWeight(layer, f);
    if (wLayer <= 0) return;
    for (const [id, keys] of Object.entries(layer.tracks)) {
      if (!keys.length) continue;
      if (id.startsWith('r:')) {
        const b = rig.byName.get(id.slice(2));
        if (!b) continue;
        const w = wLayer * this.maskWeight(layer, b);
        if (w <= 0) continue;
        sampleTrack(keys, f, _q);
        if (layer.mode === 'add') {
          if (w < 1) _q.slerp(_id, 1 - w);
          b.quaternion.multiply(_q);
        } else b.quaternion.slerp(_q, w);
      } else if (id.startsWith('t:')) {
        const b = rig.byName.get(id.slice(2));
        if (!b) continue;
        const w = wLayer * this.maskWeight(layer, b);
        if (w <= 0) continue;
        sampleTrack(keys, f, _v);
        if (layer.mode === 'add') b.position.addScaledVector(_v, w);
        else b.position.lerp(_v, w);
      } else if (id.startsWith('s:')) {
        // escala: aditiva = factor multiplicativo, sustituir = valor absoluto
        const b = rig.byName.get(id.slice(2));
        if (!b) continue;
        const w = wLayer * this.maskWeight(layer, b);
        if (w <= 0) continue;
        sampleTrack(keys, f, _v);
        if (layer.mode === 'add') b.scale.multiply(_v2.set(1, 1, 1).lerp(_v, w));
        else b.scale.lerp(_v, w);
      }
    }
  }

  layerWeight(layer, f) {
    const k = layer.tracks['w:'];
    if (k && k.length) return THREE.MathUtils.clamp(sampleTrack(k, f, _v).x, 0, 1);
    return layer.weight;
  }

  // Ajustes con deslizadores (estilo "Adjust"): se aplican sobre la pose canónica de la base.
  adjustAt(f) {
    const d = this.doc;
    const a = { ...d.adjust };
    for (const [k, keys] of Object.entries(d.adjustKeys || {})) if (keys.length) a[k] = sampleTrack(keys, f, _v).x;
    const r = d.adjustRange;
    if (r) {
      // fuera del tramo no actúa; 4 fotogramas de transición
      const fade = Math.min(1, Math.max(0, (f - r[0] + 4) / 4), Math.max(0, (r[1] + 4 - f) / 4));
      for (const k of Object.keys(a)) if (k !== 'speed') a[k] *= fade;
    }
    return a;
  }

  applyAdjust(pose, f = this.frame) {
    const a = this.adjustAt(f);
    const D = Math.PI / 180;
    const rot = (c, x, y, z) => {
      if (!pose.q[c] || (!x && !y && !z)) return;
      _q.setFromEuler(new THREE.Euler(x * D, y * D, z * D));
      pose.q[c].premultiply(_q);
    };
    if (a.posture) {
      rot('spine', a.posture * 0.5, 0, 0);
      rot('chest', a.posture * 0.8, 0, 0);
      rot('upperChest', a.posture, 0, 0);
    }
    if (a.chestH || a.chestV) for (const c of ['chest', 'upperChest', 'neck', 'head', 'shoulderL', 'shoulderR']) rot(c, a.chestV * 0.5, a.chestH * 0.5, 0);
    if (a.headV || a.headH) rot('head', a.headV, a.headH, 0);
    if (a.armsV || a.armsH) {
      // brazos arriba/abajo y adelante/atrás, como bloque desde el hombro
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        _q.setFromEuler(new THREE.Euler(0, -sx * a.armsH * D, sx * a.armsV * D));
        for (const c of [`upperArm${s}`, `lowerArm${s}`, `hand${s}`]) if (pose.q[c]) pose.q[c].premultiply(_q);
        for (const f of ['thumb', 'index', 'middle', 'ring', 'little']) for (let n = 1; n <= 3; n++) {
          const c = `${f}${n}${s}`;
          if (pose.q[c]) pose.q[c].premultiply(_q);
        }
      }
    }
  }

  // ---------- IK ----------
  /**
   * Cada cadena parte de la pose FK (animación + capas). Con IK encendido, el objetivo es
   * el efector FK + desplazamiento con claves, o un ancla absoluta en el mundo (:abs/:absq con peso :absw).
   * La solución se mezcla con la FK según ik:<cadena>:w. Siempre se evalúa desde cero: no acumula.
   */
  applyIK(f, stopAt = Infinity) {
    const rig = this.rig;
    if (rig.kind === 'quadruped') return this.applyHorseIK(f, stopAt);
    const layers = this.activeLayers().filter((l) => this.doc.layers.indexOf(l) < stopAt);
    for (const [chain, def] of Object.entries(IK_CHAINS)) {
      const [ua, la, ea] = def.bones.map((c) => rig.bone(c));
      if (!ua || !la || !ea) continue;
      // ikState se rehace en cada pasada: el estirado pendiente se guarda aparte (this._stretchP)
      const sp = (this._stretchP ||= {})[chain];
      if (sp) {
        // deshace el estirado anterior (solo lo que puso el stretch) antes de leer la pose FK
        la.position.copy(sp[0]);
        ea.position.copy(sp[1]);
        this._stretchP[chain] = null;
        ua.updateMatrixWorld(true);
      }
      const fkEnd = rig.worldPos(ea, new THREE.Vector3());
      const fkMid = rig.worldPos(la, new THREE.Vector3());
      const fkTop = rig.worldPos(ua, new THREE.Vector3());
      const fkQ = getWorldQuat(ea, new THREE.Quaternion());
      // La mano respecto al antebrazo en la animación: por defecto la mano SIGUE al antebrazo (no se queda fija en el mundo)
      const handFollow = chain.startsWith('hand') && (this.doc.ikv || 1) >= 2;
      const relFK = handFollow ? getWorldQuat(la, new THREE.Quaternion()).invert().multiply(fkQ) : null;
      const handLocalFK = handFollow ? ea.quaternion.clone() : null;
      const foreLocalFK = handFollow ? la.quaternion.clone() : null;
      // Polo por defecto: hacia donde mira la rodilla/codo según su eje anatómico (estable aunque esté recta).
      const info = limbInfo(rig, chain, def);
      let fr = info ? limbFrame(ua, la, ea, info, rig.hipsHeight * 0.45) : null;
      let fkPole;
      if (fr) fkPole = fr.pole.clone();
      else {
        const mid = fkTop.clone().add(fkEnd).multiplyScalar(0.5);
        const bend = fkMid.clone().sub(mid);
        if (bend.length() < rig.hipsHeight * 0.01) bend.fromArray(def.poleDir).applyQuaternion(rig.Fq);
        fkPole = fkMid.clone().addScaledVector(bend.normalize(), rig.hipsHeight * 0.45);
      }
      const st = (this.ikState[chain] = {
        fkEnd, fkQ, fkPole, target: fkEnd.clone(), targetQ: fkQ.clone(), pole: fkPole.clone(), on: !!this.doc.ik[chain],
        weight: 1, pin: 0, reach: 0, off: new THREE.Vector3(), rotW: new THREE.Quaternion(), length: fkTop.distanceTo(fkMid) + fkMid.distanceTo(fkEnd),
        poleOff: new THREE.Vector3(),
      });
      // Suelo: los pies no bajan de su altura de reposo (aunque la cadena esté en FK).
      const floorY = this.doc.floor && chain.startsWith('foot') && rig.restWorldPos[def.bones[2]] ? rig.restWorldPos[def.bones[2]].y : null;
      // Reach Target: la mano va a un objetivo del plan (y lo sigue si se mueve), aunque el IK de la cadena esté apagado
      const reach = this.doc.aim && chain.startsWith('hand') ? this.aimState(chain, f) : null;
      st.reachW = reach ? reach.w : 0;
      if (!st.on && !reach && (floorY === null || fkEnd.y >= floorY)) continue;
      const off = new THREE.Vector3();
      const rotD = new THREE.Quaternion();
      const poleOff = new THREE.Vector3();
      let abs = null;
      let absQ = null;
      if (st.on) for (const l of layers) {
        const w = this.layerWeight(l, f) * (l.mask && !l.mask.includes(def.group) ? 0 : 1);
        if (w <= 0) continue;
        const tr = (k) => {
          const t = l.tracks[`ik:${chain}:${k}`];
          return t && t.length ? t : null;
        };
        const p = tr('pos');
        if (p) off.addScaledVector(sampleTrack(p, f, _v), w);
        const r = tr('rot');
        if (r) {
          sampleTrack(r, f, _q);
          if (w < 1) _q.slerp(_id, 1 - w);
          rotD.premultiply(_q);
        }
        const po = tr('pole');
        if (po) poleOff.addScaledVector(sampleTrack(po, f, _v), w);
        const wk = tr('w');
        if (wk) st.weight = THREE.MathUtils.clamp(sampleTrack(wk, f, _v).x, 0, 1);
        const ab = tr('abs');
        if (ab) {
          const aw = tr('absw');
          const pw = w * (aw ? THREE.MathUtils.clamp(sampleTrack(aw, f, _v).x, 0, 1) : 1);
          sampleTrack(ab, f, _v);
          const wp = rig.canonToWorldVec(_v, new THREE.Vector3()).add(rig.restWorldPos.hips).sub(rig.canonToWorldVec(new THREE.Vector3(0, 1, 0)));
          if (this.doc.pinY?.[chain]) {
            // «en el sitio»: el ancla solo fija la altura; el pie sigue deslizándose como en una cinta
            wp.x = fkEnd.x;
            wp.z = fkEnd.z;
          }
          abs = (abs || fkEnd.clone()).lerp(wp, pw);
          const aq = tr('absq');
          if (aq) {
            sampleTrack(aq, f, _q);
            absQ = (absQ || fkQ.clone()).slerp(rig.canonToWorldQ(_q, new THREE.Quaternion()), pw);
          }
          st.pin = Math.max(st.pin, pw);
        }
      }
      if (reach) {
        const S = chain.slice(-1);
        const H = rig.hipsHeight / 0.95;
        // la muñeca queda un poco antes del objetivo: lo que toca es la palma
        const from = reach.p.clone().sub(fkTop);
        const wp = reach.p.clone().addScaledVector(from.normalize(), -0.07 * H);
        const palm = reach.cur.palm || (reach.cur.t ? null : reach.prev?.palm);
        if (palm === 'down') {
          // palma hacia abajo, dedos hacia el objetivo (apoyar la mano en una mesa)
          wp.y += 0.03 * H;
          const out = rig.frame.left.clone().multiplyScalar(S === 'L' ? 1 : -1);
          const flat = from.setY(0);
          if (flat.lengthSq() > 1e-8 && rig.Tw[`hand${S}`]) {
            const yaw = Math.atan2(flat.x, flat.z) - Math.atan2(out.x, out.z);
            const pq = new THREE.Quaternion().setFromAxisAngle(_up, yaw).multiply(rig.Tw[`hand${S}`]);
            absQ = (absQ || fkQ.clone()).slerp(pq, reach.w);
          }
        }
        abs = (abs || fkEnd.clone()).lerp(wp, reach.w);
        st.pin = Math.max(st.pin, reach.w);
      }
      rig.canonToWorldVec(off, st.off);
      rig.canonToWorldQ(rotD, st.rotW);
      st.target.copy(abs || fkEnd).add(st.off);
      st.targetQ.copy(st.rotW).multiply(absQ || fkQ);
      this.poleOffToWorld(poleOff, st.poleOff);
      st.pole.copy(fkPole).add(st.poleOff);
      let weight = st.on ? st.weight : reach ? 1 : 0;
      const solveTarget = st.target.clone();
      if (floorY !== null && solveTarget.y < floorY) {
        solveTarget.y = floorY;
        if (st.on) st.target.y = floorY;
        weight = 1;
      }
      if (weight > 0 && (st.on || reach) && chain.startsWith('hand') && this.doc.reach !== false) {
        const moved = this.leanToReach(chain, ua, solveTarget, Math.max(st.length * 0.985, fkEnd.distanceTo(fkTop)), weight);
        rig.worldPos(ua, fkTop);
        // la columna se inclinó: el brazo FK se movió con ella
        if (moved && info) fr = limbFrame(ua, la, ea, info, rig.hipsHeight * 0.45);
      }
      // Stretch / Softness (como leg_stretch y leg_softness del Control Rig). doc.ikOpts[chain] = { stretch, soft 0–1, maxStretch }.
      const opt = this.doc.ikOpts?.[chain];
      if (opt && weight > 0) {
        const L = st.length || 1;
        const dv = solveTarget.clone().sub(fkTop);
        const d = dv.length();
        if (opt.stretch && d > L) {
          const k = Math.min(d / L, 1 + (opt.maxStretch ?? 0.3));
          this._stretchP[chain] = [la.position.clone(), ea.position.clone()];
          la.position.multiplyScalar(k);
          ea.position.multiplyScalar(k);
          ua.updateMatrixWorld(true);
          if (info) fr = limbFrame(ua, la, ea, info, rig.hipsHeight * 0.45);
        } else if (opt.soft > 0 && d > 1e-6) {
          // IK suave: cerca de la extensión total la rodilla/codo se estira con una curva, sin el «chasquido» final
          const ds = Math.min(1, opt.soft) * 0.1 * L;
          const da = L - ds;
          if (d > da) solveTarget.copy(fkTop).addScaledVector(dv.divideScalar(d), da + ds * (1 - Math.exp(-(d - da) / ds)));
        }
      }
      st.reach = solveTarget.distanceTo(fkTop) / (st.length || 1);
      if (weight <= 0) continue;
      const fk = weight < 1 ? [ua.quaternion.clone(), la.quaternion.clone(), ea.quaternion.clone()] : null;
      if (fr) {
        const followQ = st.targetQ.clone().multiply(fkQ.clone().invert());
        const res = solveLimb(ua, la, ea, info, fr, solveTarget, { poleOff: st.poleOff, followQ, endQ: handFollow ? null : st.targetQ });
        if (res) st.pole.copy(res.pole);
        if (handFollow) {
          // mano: sigue al antebrazo ya resuelto (+ el giro con clave); un ancla o «palma abajo» mandan en el mundo
          const want = absQ ? st.targetQ.clone() : st.rotW.clone().multiply(getWorldQuat(la, _q2).multiply(relFK));
          st.targetQ.copy(want);
          this.naturalWrist(la, ea, want, relFK, handLocalFK, foreLocalFK);
        }
      } else solveTwoBone(ua, la, ea, solveTarget, st.pole, st.targetQ);
      if (fk) {
        [ua, la, ea].forEach((b, i) => b.quaternion.copy(fk[i].slerp(b.quaternion, weight)));
        ua.updateMatrixWorld(true);
      }
    }
  }

  /**
   * Muñeca natural: la mano se orienta a `want` (mundo), pero
   *  · el giro sobre el eje del antebrazo (pronación/supinación) lo hace sobre todo el antebrazo, como el radio y el
   *    cúbito (75 %), y no la muñeca, que se retorcería;
   *  · la muñeca no pasa de su rango natural (salvo que la animación ya viniera así).
   * Sin ediciones (want = lo que ya había) no cambia nada.
   */
  applyHorseIK(f, stopAt = Infinity) {
    const rig = this.rig;
    const layers = this.activeLayers().filter(l => this.doc.layers.indexOf(l) < stopAt);
    this.ikState = {};
    for (const [chain, bones] of Object.entries(horseChains(rig))) {
      rig.root.updateMatrixWorld(true);
      const points = bones.map(b => b.getWorldPosition(new THREE.Vector3()));
      const fkEnd = points.at(-1), fkQ = getWorldQuat(bones.at(-1), new THREE.Quaternion());
      const axis = fkEnd.clone().sub(points[0]).normalize();
      const bend = points[1].clone().sub(points[0]).projectOnPlane(axis);
      if (bend.lengthSq() < 1e-10) bend.copy(rig.frame.fwd).projectOnPlane(axis);
      const fkPole = points[1].clone().addScaledVector(bend.normalize(), rig.hipsHeight * .45);
      const st = this.ikState[chain] = { fkEnd, fkQ, fkPole, target:fkEnd.clone(), targetQ:fkQ.clone(), pole:fkPole.clone(), on:!!this.doc.ik[chain], weight:1, pin:0, reach:0, off:new THREE.Vector3(), rotW:new THREE.Quaternion(), poleOff:new THREE.Vector3(), length:points.slice(1).reduce((n, p, i) => n + p.distanceTo(points[i]), 0) };
      const off = new THREE.Vector3(), rotation = new THREE.Quaternion(), pole = new THREE.Vector3();
      let abs = null, absQ = null;
      if (st.on) for (const layer of layers) {
        const group = IK_CHAINS[chain].group;
        const w = this.layerWeight(layer, f) * (layer.mask && !layer.mask.includes(group) ? 0 : 1);
        if (w <= 0) continue;
        const tr = k => layer.tracks[`ik:${chain}:${k}`];
        if (tr('pos')?.length) off.addScaledVector(sampleTrack(tr('pos'), f, new THREE.Vector3()), w);
        if (tr('pole')?.length) pole.addScaledVector(sampleTrack(tr('pole'), f, new THREE.Vector3()), w);
        if (tr('rot')?.length) rotation.premultiply(new THREE.Quaternion().slerp(sampleTrack(tr('rot'), f, new THREE.Quaternion()), w));
        if (tr('w')?.length) st.weight = THREE.MathUtils.clamp(sampleTrack(tr('w'), f, new THREE.Vector3()).x, 0, 1);
        if (tr('abs')?.length) {
          const pw = w * (tr('absw')?.length ? sampleTrack(tr('absw'), f, new THREE.Vector3()).x : 1);
          const p = rig.canonToWorldVec(sampleTrack(tr('abs'), f, new THREE.Vector3())).add(rig.restWorldPos.hips).sub(rig.canonToWorldVec(new THREE.Vector3(0, 1, 0)));
          if (this.doc.pinY?.[chain]) { p.x = fkEnd.x; p.z = fkEnd.z; }
          abs = (abs || fkEnd.clone()).lerp(p, pw);
          if (tr('absq')?.length) absQ = (absQ || fkQ.clone()).slerp(rig.canonToWorldQ(sampleTrack(tr('absq'), f, new THREE.Quaternion())), pw);
          st.pin = Math.max(st.pin, pw);
        }
      }
      rig.canonToWorldVec(off, st.off);
      rig.canonToWorldQ(rotation, st.rotW);
      this.poleOffToWorld(pole, st.poleOff);
      st.target.copy(abs || fkEnd).add(st.off);
      st.targetQ.copy(st.rotW).multiply(absQ || fkQ);
      st.pole.add(st.poleOff);
      const floorY = this.doc.floor ? rig.restWorldPos[chain]?.y : null;
      if (floorY != null) st.target.y = Math.max(floorY, st.target.y);
      st.reach = st.target.distanceTo(points[0]) / (st.length || 1);
      if (!st.on || st.weight <= 0) continue;
      const target = fkEnd.clone().lerp(st.target, st.weight);
      const rot = st.targetQ.clone().multiply(fkQ.clone().invert());
      rot.slerp(new THREE.Quaternion(), 1 - st.weight);
      const anatomy = anatomicalSystem(rig);
      if (anatomy.mode !== 'libre') {
        const result = anatomy.solve(chain,target,st.poleOff.clone().multiplyScalar(st.weight),rot);
        st.error = result?.error || 0;
        st.limited = st.error > .002;
      } else solveHorseChain(bones, target, st.poleOff.clone().multiplyScalar(st.weight), rot, this.doc.ikOpts?.[chain]);
      st.solved = rig.worldPos(bones.at(-1));
    }
  }

  naturalWrist(la, ea, want, relFK, handLocalFK, foreLocalFK, share = 0.75) {
    const rig = this.rig;
    la.updateMatrixWorld(true);
    const laW = getWorldQuat(la, new THREE.Quaternion());
    // eje del antebrazo en su espacio local (del codo a la muñeca)
    const axis = rig.worldPos(ea, new THREE.Vector3()).sub(rig.worldPos(la, new THREE.Vector3()));
    if (axis.lengthSq() > 1e-12) {
      axis.normalize().applyQuaternion(laW.clone().invert());
      // lo que se quiere girar la mano respecto a como iba con el antebrazo, en el espacio del antebrazo
      const d = laW.clone().invert().multiply(want).multiply(relFK.clone().invert());
      const k = axis.x * d.x + axis.y * d.y + axis.z * d.z;
      const tw = new THREE.Quaternion(axis.x * k, axis.y * k, axis.z * k, d.w);
      if (tw.lengthSq() > 1e-12 && Math.abs(k) > 1e-6) {
        tw.normalize();
        if (tw.w < 0) tw.set(-tw.x, -tw.y, -tw.z, -tw.w);
        const ang = 2 * Math.acos(Math.min(1, tw.w));
        la.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.sign(k) * ang * share));
        la.updateMatrixWorld(true);
      }
    }
    setWorldQuat(ea, want);
    if (this.limitsOn?.() !== false) ea.quaternion.copy(limitEdit(rig, ea, handLocalFK, ea.quaternion));
    ea.updateMatrixWorld(true);
    void foreLocalFK;
  }

  /**
   * Cuerpo entero: si la mano no llega al objetivo, la columna y la clavícula se inclinan lo justo para que llegue
   * (dentro de sus límites). Parte siempre de la pose FK, así que no acumula entre fotogramas.
   */
  leanToReach(chain, ua, target, max, weight = 1) {
    const rig = this.rig;
    const S = chain.slice(-1);
    const bones = ['spine', 'chest', 'upperChest', `shoulder${S}`].map((c) => rig.bone(c)).filter(Boolean);
    if (!bones.length) return;
    // max: hasta dónde llega el brazo (o lo que ya estiraba la animación: sin objetivo nuevo no se inclina nada)
    const top = new THREE.Vector3();
    const o = new THREE.Vector3();
    const goal = new THREE.Vector3();
    const start = bones.map((b) => b.quaternion.clone());
    const moved = () => bones.some((b, i) => !b.quaternion.equals(start[i]));
    for (let it = 0; it < 4; it++) {
      for (let i = bones.length - 1; i >= 0; i--) {
        const b = bones[i];
        rig.worldPos(ua, top);
        const d = target.distanceTo(top);
        if (d <= max) return moved();
        goal.copy(top).sub(target).multiplyScalar(max / d).add(target);
        rig.worldPos(b, o);
        const v0 = top.clone().sub(o);
        const v1 = goal.clone().sub(o);
        if (v0.lengthSq() < 1e-10 || v1.lengthSq() < 1e-10) continue;
        _q.setFromUnitVectors(v0.normalize(), v1.normalize());
        _q.slerp(_id, 1 - 0.6 * weight);
        const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
        const local = pw.clone().invert().multiply(_q.multiply(pw.multiply(b.quaternion)));
        b.quaternion.copy(limitEdit(rig, b, start[i], local));
        b.updateMatrixWorld(true);
      }
    }
    return moved();
  }

  /**
   * Marco de los desplazamientos del polo. Documentos nuevos (ikv ≥ 2): el de la cadera actual, así que el polo
   * acompaña al cuerpo cuando gira. Documentos antiguos con polos guardados: el marco de reposo, como entonces.
   */
  poleFrameQ(out = new THREE.Quaternion()) {
    const rig = this.rig;
    out.copy(rig.Fq);
    const hb = (this.doc.ikv || 1) >= 2 && rig.bone('hips');
    if (hb && rig.TwInv.hips) out.premultiply(hb.getWorldQuaternion(_q2).multiply(rig.TwInv.hips));
    return out;
  }
  poleOffToWorld(c, out = new THREE.Vector3()) {
    return out.copy(c).applyQuaternion(this.poleFrameQ(_q)).multiplyScalar(this.rig.hipsHeight);
  }
  worldToPoleOff(w, out = new THREE.Vector3()) {
    return out.copy(w).divideScalar(this.rig.hipsHeight).applyQuaternion(this.poleFrameQ(_q).invert());
  }

  /** Posición absoluta canónica (para pistas :abs) a partir de una posición de mundo. */
  worldToAbs(p) {
    const rig = this.rig;
    const o = p.clone().sub(rig.restWorldPos.hips).add(rig.canonToWorldVec(new THREE.Vector3(0, 1, 0)));
    return rig.worldToCanonVec(o);
  }

  // ---------- Edición ----------
  layer(id = this.doc.activeLayer) {
    return this.doc.layers.find((l) => l.id === id) || this.doc.layers[0];
  }

  /** Guarda como clave la rotación local deseada de un hueso en el fotograma f (capa activa). */
  keyBone(bone, localQ, localP, f, localS = null) {
    const layer = this.layer();
    if (layer.lock) return false;
    const idx = this.doc.layers.indexOf(layer);
    // pose de la base + capas inferiores + la propia capa sin este hueso
    const saved = { r: layer.tracks[`r:${bone.name}`], t: layer.tracks[`t:${bone.name}`], s: layer.tracks[`s:${bone.name}`] };
    delete layer.tracks[`r:${bone.name}`];
    delete layer.tracks[`t:${bone.name}`];
    delete layer.tracks[`s:${bone.name}`];
    this.evaluate(f, { stopAt: idx + 1, ik: false });
    const qb = bone.quaternion.clone();
    const pb = bone.position.clone();
    const sb = bone.scale.clone();
    if (saved.r) layer.tracks[`r:${bone.name}`] = saved.r;
    if (saved.t) layer.tracks[`t:${bone.name}`] = saved.t;
    if (saved.s) layer.tracks[`s:${bone.name}`] = saved.s;
    if (localS) {
      const k = layer.mode === 'add' ? new THREE.Vector3(localS.x / (sb.x || 1), localS.y / (sb.y || 1), localS.z / (sb.z || 1)) : localS.clone();
      setKey(layer, `s:${bone.name}`, f, k.toArray());
    }
    const w = Math.max(1e-3, this.layerWeight(layer, f) * this.maskWeight(layer, bone));
    if (localQ) {
      let k;
      if (layer.mode === 'add') {
        k = qb.clone().invert().multiply(localQ);
        if (w < 1) scaleQuat(k, 1 / w, k);
      } else {
        k = localQ.clone();
        if (w < 1) {
          const d = qb.clone().invert().multiply(localQ);
          scaleQuat(d, 1 / w, d);
          k = qb.clone().multiply(d);
        }
      }
      setKey(layer, `r:${bone.name}`, f, k.toArray());
    }
    if (localP) {
      const k = layer.mode === 'add' ? localP.clone().sub(pb).divideScalar(w) : pb.clone().lerp(localP, 1 / w);
      setKey(layer, `t:${bone.name}`, f, k.toArray());
    }
    return true;
  }

  /** Clave de IK: target en mundo (pos), rotación de mundo del efector, o polo. */
  keyIK(chain, { pos, quat, pole }, f) {
    const rig = this.rig;
    // Dentro de un control IK temporal el objetivo es absoluto en el mundo: la edición cambia solo la clave
    // de ese fotograma (las vecinas se quedan), como al mover un control temporal en Herramientas.
    const tmp = (pos || quat) && this.tempAt('ik', chain, f);
    const tl = tmp && this.doc.layers.find((l) => l.id === tmp.layer);
    if (tl && !tl.lock) {
      this.evaluate(f);
      const st = this.ikState[chain];
      if (!st) return false;
      if (pos) setKey(tl, `ik:${chain}:abs`, f, this.worldToAbs(pos.clone().sub(st.off)).toArray(), 'auto');
      if (quat) setKey(tl, `ik:${chain}:absq`, f, rig.worldToCanonQ(st.rotW.clone().invert().multiply(quat)).toArray(), 'auto');
      setKey(tl, `ik:${chain}:absw`, f, [1, 0, 0], 'auto');
      if (!pole) return true;
      pos = quat = undefined;
    }
    const layer = this.layer();
    if (layer.lock) return false;
    const idx = this.doc.layers.indexOf(layer);
    // solo se apartan las pistas que se van a reescribir: el polo por defecto depende de dónde está el objetivo
    const ids = [pos && 'pos', quat && 'rot', pole && 'pole'].filter(Boolean).map((k) => `ik:${chain}:${k}`);
    const saved = ids.map((k) => layer.tracks[k]);
    ids.forEach((k) => delete layer.tracks[k]);
    // La referencia es el objetivo SIN el suelo: si la ayuda «suelo» lo subiera aquí, la clave guardaría un
    // desplazamiento falso y al reproducir el pie quedaría más bajo (de puntillas, los dedos entraban en el suelo).
    const floor = this.doc.floor;
    this.doc.floor = false;
    try {
      this.evaluate(f, { stopAt: idx + 1 });
    } finally {
      this.doc.floor = floor;
    }
    ids.forEach((k, i) => saved[i] && (layer.tracks[k] = saved[i]));
    const st = this.ikState[chain];
    if (!st) return false;
    const cur = (k, out) => {
      const t = layer.tracks[`ik:${chain}:${k}`];
      return t && t.length ? sampleTrack(t, f, out) : null;
    };
    if (pos) {
      const d = rig.worldToCanonVec(pos.clone().sub(st.target));
      setKey(layer, `ik:${chain}:pos`, f, d.toArray());
      if (!cur('rot', new THREE.Quaternion())) setKey(layer, `ik:${chain}:rot`, f, [0, 0, 0, 1]);
    }
    if (quat) {
      const d = quat.clone().multiply(st.targetQ.clone().invert());
      setKey(layer, `ik:${chain}:rot`, f, rig.worldToCanonQ(d).toArray());
      if (!cur('pos', new THREE.Vector3())) setKey(layer, `ik:${chain}:pos`, f, [0, 0, 0]);
    }
    if (pole) {
      const d = this.worldToPoleOff(pole.clone().sub(st.pole));
      setKey(layer, `ik:${chain}:pole`, f, d.toArray());
    }
    return true;
  }

  /** Clave de la mezcla IK↔FK de una cadena (0 = FK puro, 1 = IK puro). */
  keyIKWeight(chain, w, f) {
    const layer = this.layer();
    if (layer.lock) return false;
    setKey(layer, `ik:${chain}:w`, f, [THREE.MathUtils.clamp(w, 0, 1), 0, 0]);
    return true;
  }

  /**
   * Ancla el efector (mano o pie) donde está en f0 y lo mantiene fijo en el mundo hasta f1,
   * haga lo que haga la animación de debajo. fade: fotogramas de entrada y salida.
   */
  pinIK(chain, f0, f1 = f0, fade = 3, ranged = false) {
    const layer = this.layer();
    if (layer.lock || !IK_CHAINS[chain]) return false;
    [f0, f1] = [Math.round(Math.min(f0, f1)), Math.round(Math.max(f0, f1))];
    const rig = this.rig;
    this.doc.ik[chain] = true;
    this.evaluate(f0);
    const st = this.ikState[chain];
    if (!st) return false;
    // lo que hay que fijar es la base del objetivo: los desplazamientos con claves se suman encima
    const pos = this.worldToAbs(st.target.clone().sub(st.off)).toArray();
    const q = rig.worldToCanonQ(st.rotW.clone().invert().multiply(st.targetQ)).toArray();
    const [ra, rb] = this.range();
    const had = (layer.tracks[`ik:${chain}:absw`] || []).length > 0;
    for (const f of f0 === f1 ? [f0] : [f0, f1]) {
      setKey(layer, `ik:${chain}:abs`, f, pos, 'linear');
      setKey(layer, `ik:${chain}:absq`, f, q, 'linear');
      setKey(layer, `ik:${chain}:absw`, f, [1, 0, 0], 'linear');
    }
    // Un tramo: entra y sale con fundido. Un solo fotograma sin anclas previas: queda fijo siempre.
    if (f0 !== f1 || had || ranged) {
      const w = layer.tracks[`ik:${chain}:absw`];
      const free = (a, b) => !w.some((k) => k.f >= a && k.f <= b);
      if (f0 - fade >= ra && free(f0 - fade, f0 - 1)) setKey(layer, `ik:${chain}:absw`, f0 - fade, [0, 0, 0], 'smooth');
      if (f1 + fade <= rb && free(f1 + 1, f1 + fade)) setKey(layer, `ik:${chain}:absw`, f1 + fade, [0, 0, 0], 'linear');
      const k1 = w.find((k) => k.f === f1);
      if (k1) k1.i = 'smooth';
    }
    return true;
  }

  /** Quita las anclas de una cadena en la capa activa (todas, o solo las del tramo [f0, f1]). */
  unpinIK(chain, f0 = -Infinity, f1 = Infinity) {
    const layer = this.layer();
    if (layer.lock) return 0;
    let n = 0;
    for (const k of ['abs', 'absq', 'absw']) {
      const id = `ik:${chain}:${k}`;
      const keys = layer.tracks[id];
      if (!keys) continue;
      const keep = keys.filter((x) => x.f < f0 || x.f > f1);
      n += keys.length - keep.length;
      if (keep.length) layer.tracks[id] = keep;
      else delete layer.tracks[id];
    }
    if (!layer.tracks[`ik:${chain}:abs`]) for (const k of ['absq', 'absw']) delete layer.tracks[`ik:${chain}:${k}`];
    return n;
  }

  /** Tramos en que un pie está apoyado (bajo y casi quieto) en la animación de debajo. */
  footContacts(chain, { height = 0.04, speed = 0.012, minLen = 3 } = {}) {
    const rig = this.rig;
    const ea = rig.bone(IK_CHAINS[chain].bones[2]);
    if (!ea) return [];
    const [a, b] = this.range();
    const saved = this.doc.ik[chain];
    this.doc.ik[chain] = false;
    // Los clips «en el sitio» se miden con su avance real: ahí sí se ve cuándo el pie está quieto en el suelo.
    const inPlace = this.doc.strips.filter((s) => s.inPlace);
    inPlace.forEach((s) => (s.inPlace = false));
    const pts = [];
    for (let f = a; f <= b; f++) {
      this.evaluate(f);
      pts.push(rig.worldPos(ea, new THREE.Vector3()));
    }
    this.doc.ik[chain] = saved;
    inPlace.forEach((s) => (s.inPlace = true));
    const H = rig.hipsHeight;
    const minY = Math.min(...pts.map((p) => p.y));
    // «casi quieto» es relativo al paso: una cuarta parte de la velocidad del pie en el aire (hay clips que patinan algo)
    const steps = pts.slice(1).map((p, i) => p.distanceTo(pts[i]) / H).sort((x, y) => x - y);
    speed = Math.max(speed, 0.25 * (steps[Math.floor(steps.length * 0.9)] || 0));
    const down = pts.map((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      const v = Math.min(i < pts.length - 1 ? p.distanceTo(q) : Infinity, i > 0 ? p.distanceTo(o) : Infinity) / H;
      return p.y - minY < height * H && v < speed;
    });
    // En un bucle, el apoyo que acaba al final continúa al principio: los dos trozos cuentan como uno.
    const looped = this.doc.strips.length === 1 && this.doc.strips[0].loop && down[0] && down[down.length - 1];
    let head = 0;
    while (head < down.length && down[head]) head++;
    let tail = 0;
    while (tail < down.length && down[down.length - 1 - tail]) tail++;
    const runs = [];
    for (let i = 0; i < down.length; i++) {
      if (!down[i]) continue;
      let j = i;
      while (j + 1 < down.length && down[j + 1]) j++;
      const edge = looped && (i === 0 || j === down.length - 1) && head + tail >= minLen;
      if (j - i + 1 >= minLen || edge) runs.push([a + i, a + j]);
      i = j;
    }
    return runs;
  }

  /** Quita el deslizamiento: ancla cada pie en los tramos en que está apoyado. Devuelve cuántos tramos fijó. */
  lockFeet(opts = {}) {
    let n = 0;
    for (const chain of ['footL', 'footR']) {
      const runs = this.footContacts(chain, opts);
      if (!runs.length) continue;
      this.unpinIK(chain);
      (this.doc.pinY ||= {})[chain] = this.doc.strips.some((s) => s.inPlace);
      for (const [f0, f1] of runs) if (this.pinIK(chain, f0, f1, opts.fade ?? 2, true)) n++;
    }
    return n;
  }

  /** Inserta clave con el valor actual (sin cambiar la pose) para las pistas indicadas. */
  keyCurrent(trackIds, f) {
    const layer = this.layer();
    if (layer.lock) return;
    for (const id of trackIds) {
      const keys = layer.tracks[id];
      if (keys && keys.length) {
        const out = trackKind(id) === 'quat' ? new THREE.Quaternion() : new THREE.Vector3();
        sampleTrack(keys, f, out);
        setKey(layer, id, f, out.toArray());
      } else {
        setKey(layer, id, f, trackKind(id) === 'quat' ? [0, 0, 0, 1] : [0, 0, 0]);
      }
    }
  }

  deleteKeys(f, filter = null) {
    const layer = this.layer();
    if (layer.lock) return 0;
    let n = 0;
    for (const [id, keys] of Object.entries(layer.tracks)) {
      if (filter && !filter(id)) continue;
      const i = keys.findIndex((k) => k.f === Math.round(f));
      if (i >= 0) {
        keys.splice(i, 1);
        n++;
      }
      if (!keys.length) delete layer.tracks[id];
    }
    return n;
  }

  moveKeys(layerId, from, to, filter = null) {
    const layer = this.layer(layerId);
    if (layer.lock || from === to) return;
    for (const [id, keys] of Object.entries(layer.tracks)) {
      if (filter && !filter(id)) continue;
      const k = keys.find((x) => x.f === from);
      if (!k) continue;
      const clash = keys.findIndex((x) => x.f === to);
      if (clash >= 0) keys.splice(clash, 1);
      k.f = to;
      keys.sort((a, b) => a.f - b.f);
    }
  }

  keyFrames(layerId = null, filter = null) {
    const set = new Set();
    for (const l of this.doc.layers) {
      if (layerId && l.id !== layerId) continue;
      for (const [id, keys] of Object.entries(l.tracks)) {
        if (filter && !filter(id)) continue;
        keys.forEach((k) => set.add(k.f));
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  /** Pliega todas las capas en la base (fotograma a fotograma, como se ve). */
  flatten() {
    const [a, b] = this.range();
    const base = this.layer('base');
    const rig = this.rig;
    const tracks = {};
    for (let f = a; f <= b; f++) {
      this.evaluate(f, { stopAt: 0, ik: false });
      const before = rig.bones.map((x) => x.quaternion.clone());
      const beforeP = rig.bones.map((x) => x.position.clone());
      this.evaluate(f);
      rig.bones.forEach((bone, i) => {
        const d = before[i].clone().invert().multiply(bone.quaternion);
        if (1 - Math.abs(d.w) > 1e-7) {
          (tracks[`r:${bone.name}`] ||= []).push({ f, v: d.toArray(), i: 'linear' });
        }
        const dp = bone.position.clone().sub(beforeP[i]);
        if (dp.lengthSq() > 1e-12) (tracks[`t:${bone.name}`] ||= []).push({ f, v: dp.toArray(), i: 'linear' });
      });
    }
    base.tracks = tracks;
    base.mode = 'add';
    this.doc.layers = [base];
    this.doc.activeLayer = 'base';
    for (const k of Object.keys(this.doc.ik)) this.doc.ik[k] = false;
  }

  mergeDown(layerId) {
    const i = this.doc.layers.findIndex((l) => l.id === layerId);
    if (i <= 0) return false;
    const upper = this.doc.layers[i];
    const lower = this.doc.layers[i - 1];
    const keep = this.doc.layers.slice();
    const [a, b] = this.range();
    const rig = this.rig;
    const frames = new Set();
    Object.values(upper.tracks).forEach((k) => k.forEach((x) => frames.add(x.f)));
    Object.values(lower.tracks).forEach((k) => k.forEach((x) => frames.add(x.f)));
    if (!frames.size) for (let f = a; f <= b; f++) frames.add(f);
    const result = {};
    const bones = new Set([...Object.keys(upper.tracks), ...Object.keys(lower.tracks)].filter((t) => t.startsWith('r:') || t.startsWith('t:')).map((t) => t.slice(2)));
    for (const f of [...frames].sort((x, y) => x - y)) {
      this.evaluate(f, { stopAt: i - 1, ik: false });
      const below = new Map([...bones].map((n) => [n, rig.byName.get(n)?.quaternion.clone()]));
      const belowP = new Map([...bones].map((n) => [n, rig.byName.get(n)?.position.clone()]));
      this.evaluate(f, { stopAt: i + 1, ik: false });
      for (const n of bones) {
        const bo = rig.byName.get(n);
        if (!bo) continue;
        const d = lower.mode === 'add' ? below.get(n).clone().invert().multiply(bo.quaternion) : bo.quaternion.clone();
        (result[`r:${n}`] ||= []).push({ f, v: d.toArray(), i: 'smooth' });
        const dp = lower.mode === 'add' ? bo.position.clone().sub(belowP.get(n)) : bo.position.clone();
        if (lower.mode !== 'add' || dp.lengthSq() > 1e-12) (result[`t:${n}`] ||= []).push({ f, v: dp.toArray(), i: 'smooth' });
      }
    }
    for (const [k, v] of Object.entries(upper.tracks)) if (k.startsWith('ik:') && !result[k]) result[k] = v;
    for (const [k, v] of Object.entries(lower.tracks)) if (k.startsWith('ik:') && !result[k]) result[k] = v;
    lower.tracks = result;
    this.doc.layers = keep.filter((l) => l !== upper);
    this.doc.activeLayer = lower.id;
    return true;
  }

  // ---------- Controles temporales (Herramientas: Temp IK / World Space Ctrls) ----------
  // doc.temp = [{ id, kind: 'ik'|'world', chain|bone, a, b, layer, ... }]. La creación, el horneado y la
  // cancelación están en src/core/edit/temp.js; aquí solo lo que el motor necesita al evaluar y al poner claves.

  /** Control temporal activo para una cadena (kind 'ik') o un hueso (kind 'world', nombre real) en f. */
  tempAt(kind, key, f) {
    return (this.doc.temp || []).find((t) => t.kind === kind && (t.chain === key || t.bone === key) && f >= t.a - 1e-6 && f <= t.b + 1e-6) || null;
  }

  applyTempWorld(f) {
    const rig = this.rig;
    const list = this.doc.temp.filter((t) => t.kind === 'world' && f >= t.a - 1e-6 && f <= t.b + 1e-6);
    if (!list.length) return;
    const depth = (b) => {
      let d = 0;
      for (let p = b?.parent; p; p = p.parent) d++;
      return d;
    };
    list.sort((x, y) => depth(rig.byName.get(x.bone)) - depth(rig.byName.get(y.bone)));
    for (const t of list) {
      const b = rig.byName.get(t.bone);
      if (!b || !t.tracks.q?.length) continue;
      if (b.parent) b.parent.updateWorldMatrix(true, false);
      sampleTrack(t.tracks.q, f, _q);
      const pw = b.parent ? b.parent.getWorldQuaternion(_q2) : _q2.identity();
      b.quaternion.copy(pw.invert().multiply(_q));
      if (t.tracks.p?.length) {
        sampleTrack(t.tracks.p, f, _v);
        b.position.copy(b.parent ? b.parent.worldToLocal(_v) : _v);
      }
      b.updateMatrixWorld(true);
    }
  }

  /** Clave de un control temporal en espacio mundo (giro y, si tiene, posición de mundo). */
  keyTempWorld(t, f, wq, wp = null) {
    setKey(t, 'q', f, wq.toArray(), 'auto');
    if (wp && t.tracks.p) setKey(t, 'p', f, wp.toArray(), 'auto');
    return true;
  }

  // ---------- IK ⇄ FK sin saltos (como iClone: el miembro en IK se edita por su efector) ----------

  /** Cadena IK encendida a la que pertenece un hueso (o null). */
  chainOfBone(bone) {
    if (this.rig.kind === 'quadruped') return Object.entries(horseChains(this.rig)).find(([chain,bones]) => this.doc.ik[chain] && bones.includes(bone))?.[0] || null;
    const c = this.rig.canonOf.get(bone);
    if (!c) return null;
    for (const [chain, def] of Object.entries(IK_CHAINS)) if (this.doc.ik[chain] && def.bones.includes(c)) return chain;
    return null;
  }

  /**
   * Huesos que hay que hornear para pasar una cadena de IK a FK sin que cambie lo que se ve: los de la cadena y,
   * si la mano no llegaba y el IK inclinaba la columna y el hombro (alcance de cuerpo entero), también esos.
   */
  ikBakeBones(chain, frames = null) {
    const rig = this.rig;
    if (rig.kind === 'quadruped') return horseChains(rig)[chain] || [];
    const bones = IK_CHAINS[chain].bones.map((c) => rig.bone(c)).filter(Boolean);
    if (!chain.startsWith('hand') || this.doc.reach === false || !this.doc.ik[chain]) return bones;
    const S = chain.slice(-1);
    const lean = ['spine', 'chest', 'upperChest', `shoulder${S}`].map((c) => rig.bone(c)).filter(Boolean);
    if (!frames) {
      const [r0, r1] = this.range();
      frames = [];
      for (let f = r0; f <= r1; f++) frames.push(f);
    }
    const cur = this.frame;
    let used = false;
    for (const f of frames) {
      this.evaluate(f);
      const a = lean.map((b) => b.quaternion.clone());
      this.doc.ik[chain] = false;
      this.evaluate(f);
      this.doc.ik[chain] = true;
      if (lean.some((b, i) => b.quaternion.angleTo(a[i]) > 1e-4)) {
        used = true;
        break;
      }
    }
    this.evaluate(cur);
    return used ? [...lean, ...bones] : bones;
  }

  /** Pose de mundo de una cadena tal como se ve ahora: efector (posición y giro) y rodilla/codo. Requiere matrixWorld al día. */
  chainPose(chain) {
    const rig = this.rig;
    if (rig.kind === 'quadruped') {
      const bones = horseChains(rig)[chain];
      if (!bones) return null;
      return {top:rig.worldPos(bones[0]), knee:rig.worldPos(bones[1]), pos:rig.worldPos(bones.at(-1)), quat:getWorldQuat(bones.at(-1))};
    }
    const [ua, la, ea] = IK_CHAINS[chain].bones.map((c) => rig.bone(c));
    if (!ua || !la || !ea) return null;
    return { top: rig.worldPos(ua, new THREE.Vector3()), knee: rig.worldPos(la, new THREE.Vector3()), pos: rig.worldPos(ea, new THREE.Vector3()), quat: getWorldQuat(ea, new THREE.Quaternion()) };
  }

  /**
   * Claves de IK para que la cadena reproduzca exactamente una pose de mundo (efector + rodilla/codo):
   * «emparejar IK con FK» de Herramientas/iClone. pose: { pos, quat, knee }.
   */
  keyChainPose(chain, f, pose) {
    if (this.layer().lock) return false;
    const rig = this.rig;
    if (!this.keyIK(chain, { pos: pose.pos, quat: pose.quat }, f)) return false;
    if (pose.knee) {
      this.evaluate(f);
      const upper = rig.kind === 'quadruped' ? horseChains(rig)[chain]?.[0] : rig.bone(IK_CHAINS[chain].bones[0]);
      const top = rig.worldPos(upper, new THREE.Vector3());
      const n = pose.pos.clone().sub(top);
      if (n.lengthSq() > 1e-12) {
        n.normalize();
        const kd = pose.knee.clone().sub(top);
        kd.addScaledVector(n, -kd.dot(n));
        if (kd.length() > 1e-4 * rig.hipsHeight) this.keyIK(chain, { pole: pose.knee.clone().addScaledVector(kd.normalize(), rig.hipsHeight * 0.45) }, f);
      }
    }
    return true;
  }

  /**
   * Clave de varios huesos sin realimentación: los de cadenas con IK encendido se guardan como IK
   * (efector + polo) a partir de la pose que se ve; los demás como FK medida sin IK.
   * entries: [{ bone, q?: giro local deseado, wq?: giro de mundo deseado, p?: posición local }].
   */
  keyPoseSmart(f, entries) {
    const rig = this.rig;
    const depth = (b) => {
      let d = 0;
      for (let p = b.parent; p; p = p.parent) d++;
      return d;
    };
    entries = entries.filter((e) => e.bone).sort((a, b) => depth(a.bone) - depth(b.bone));
    const byChain = new Map();
    for (const e of entries) {
      const ch = this.chainOfBone(e.bone);
      if (ch) (byChain.get(ch) || byChain.set(ch, []).get(ch)).push(e);
      else {
        let q = e.q || null;
        if (!q && e.wq) {
          this.evaluate(f, { ik: false });
          q = e.bone.parent ? e.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(e.wq) : e.wq.clone();
        }
        this.keyBone(e.bone, q, e.p || null, f);
      }
    }
    for (const [chain, es] of byChain) {
      this.evaluate(f);
      for (const e of es) {
        if (e.q) e.bone.quaternion.copy(e.q);
        else if (e.wq) e.bone.quaternion.copy(e.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(e.wq));
        e.bone.updateMatrixWorld(true);
      }
      const pose = this.chainPose(chain);
      if (pose) this.keyChainPose(chain, f, pose);
    }
    this.evaluate(f);
    return true;
  }

  /**
   * Cambia una cadena entre IK y FK sin que salte nada en f.
   * FK→IK: claves de IK que reproducen la pose que se ve. IK→FK: la pose resuelta se hornea a giros FK en f
   * y en cada fotograma con claves IK de esa cadena (así tampoco salta en los demás).
   */
  switchIK(chain, on, f) {
    if (!IK_CHAINS[chain] || !!this.doc.ik[chain] === !!on) return false;
    const rig = this.rig;
    if (on) {
      this.evaluate(f);
      const pose = this.chainPose(chain);
      this.doc.ik[chain] = true;
      if (pose && !this.layer().lock) {
        // si ya había claves IK guardadas, la pose de este momento manda (no salta al encender)
        const has = this.doc.layers.some((l) => Object.keys(l.tracks).some((k) => k.startsWith(`ik:${chain}:`) && !/:(w|abs|absq|absw)$/.test(k)));
        if (has) this.keyChainPose(chain, f, pose);
      }
      return true;
    }
    const keyed = new Set();
    for (const l of this.doc.layers) for (const [k, ks] of Object.entries(l.tracks)) if (k.startsWith(`ik:${chain}:`)) ks.forEach((x) => keyed.add(x.f));
    // sin claves IK de esa cadena, la FK ya es lo que se veía: no hace falta hornear
    if (!keyed.size || this.layer().lock) {
      this.doc.ik[chain] = false;
      this.evaluate(f);
      return true;
    }
    // Lo que hacía el IK se hornea a FK en TODO el rango (una sola clave IK afecta a toda la animación), con
    // claves solo donde hacen falta y siempre en f y en las claves IK: así no salta en ningún fotograma.
    const [r0, r1] = this.range();
    const bones = this.ikBakeBones(chain); // con la columna y el hombro si el IK los inclinaba
    void rig;
    bakeBones(this, bones, [Math.min(r0, Math.round(f)), Math.max(r1, Math.round(f))], { tolDeg: 0.25, tolPos: 0.0015, must: [Math.round(f), ...keyed], before: () => (this.doc.ik[chain] = false) });
    this.evaluate(f);
    return true;
  }

  /** Espejo de la pose de la capa activa en f: lado origen → lado destino. */
  mirrorSide(f, from = 'L') {
    const rig = this.rig;
    const layer = this.layer();
    this.evaluate(f);
    const to = from === 'L' ? 'R' : 'L';
    const entries = [];
    for (const [c, name] of Object.entries(rig.mapping)) {
      if (!c.endsWith(from)) continue;
      const src = rig.byName.get(name);
      const dst = rig.bone(c.slice(0, -1) + to);
      if (!src || !dst) continue;
      // rotación de mundo canónica reflejada
      const W = getWorldQuat(src, new THREE.Quaternion()).multiply(rig.TwInv[c]);
      const cq = rig.worldToCanonQ(W);
      cq.set(cq.x, -cq.y, -cq.z, cq.w);
      const c2 = c.slice(0, -1) + to;
      entries.push({ bone: dst, wq: rig.canonToWorldQ(cq).multiply(rig.Tw[c2]) });
    }
    // de padre a hijo, cada giro de mundo se convierte a local sobre lo ya reflejado (sin pasar la pose IK a la FK)
    const depth = (b) => {
      let d = 0;
      for (let p = b.parent; p; p = p.parent) d++;
      return d;
    };
    entries.sort((a, b) => depth(a.bone) - depth(b.bone));
    const fkEntries = entries.filter((e) => !this.chainOfBone(e.bone));
    for (const e of fkEntries) this.keyPoseSmart(f, [e]);
    this.keyPoseSmart(f, entries.filter((e) => this.chainOfBone(e.bone)));
    return layer;
  }
}
