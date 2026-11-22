// Motion Lab: rehace un clip canónico (exagerar por zonas, solapamiento, suavizado, estilo,
// tiempo, bucle sin salto, recorte y 8 direcciones). Todo devuelve un clip nuevo.
import * as THREE from 'three';
import { CANON_BY_ID, mirrorCanon } from './humanoid.js';
import { makeClip, sampleClip, newPose } from './clip.js';

const _a = new THREE.Quaternion();
const _b = new THREE.Quaternion();
const D2R = Math.PI / 180;

export const LAB_GROUPS = [
  ['torso', 'Torso'], ['head', 'Cabeza'], ['arms', 'Brazos'], ['legs', 'Piernas'], ['fingers', 'Dedos'],
];
const groupOf = (c) => {
  const g = CANON_BY_ID[c].group;
  if (g.startsWith('arm')) return 'arms';
  if (g.startsWith('leg')) return 'legs';
  if (g.startsWith('fingers')) return 'fingers';
  return g;
};

export const STYLES = {
  ninguno: { label: 'Sin estilo' },
  cansado: { label: 'Cansado', amp: { arms: 0.6, legs: 0.85, torso: 0.8 }, posture: 12, head: 10, speed: 0.8, bounce: 0.7 },
  energico: { label: 'Enérgico', amp: { arms: 1.3, legs: 1.15, torso: 1.2 }, posture: -3, speed: 1.15, bounce: 1.4 },
  sigiloso: { label: 'Sigiloso', amp: { arms: 0.7, legs: 0.9 }, posture: 16, head: -6, speed: 0.85, bounce: 0.5, lower: 0.06 },
  feliz: { label: 'Feliz', amp: { arms: 1.15, torso: 1.1 }, posture: -6, head: -8, bounce: 1.35, speed: 1.05 },
  triste: { label: 'Triste', amp: { arms: 0.5, torso: 0.7 }, posture: 10, head: 16, speed: 0.8, bounce: 0.6 },
  orgulloso: { label: 'Orgulloso', posture: -9, head: -7, amp: { arms: 0.9 }, chest: -6 },
  caricatura: { label: 'Caricatura', amp: { arms: 1.5, legs: 1.25, torso: 1.4, head: 1.4 }, overlap: 2, bounce: 1.5 },
  robot: { label: 'Robot (a saltos)', hold: 3, amp: { torso: 0.6 } },
};

function avgQuat(arr, frames) {
  // media de cuaterniones (signo alineado)
  let x = 0, y = 0, z = 0, w = 0;
  const r = new THREE.Quaternion().fromArray(arr, 0);
  for (let i = 0; i < frames; i++) {
    _a.fromArray(arr, i * 4);
    const s = _a.dot(r) < 0 ? -1 : 1;
    x += s * _a.x;
    y += s * _a.y;
    z += s * _a.z;
    w += s * _a.w;
  }
  return new THREE.Quaternion(x, y, z, w).normalize();
}

function powQuat(q, k, out) {
  out.copy(q);
  if (out.w < 0) out.set(-out.x, -out.y, -out.z, -out.w);
  const ang = 2 * Math.acos(Math.min(1, out.w));
  if (ang < 1e-8) return out.identity();
  const s = Math.sin(ang / 2);
  return out.setFromAxisAngle(new THREE.Vector3(out.x / s, out.y / s, out.z / s), ang * k);
}

function cloneClip(c, extra = {}) {
  const tracks = Object.fromEntries(Object.entries(c.tracks).map(([k, v]) => [k, Float32Array.from(v)]));
  return makeClip({ ...c, tracks, hips: c.hips ? Float32Array.from(c.hips) : null, ...extra });
}

/** Remuestrea a una nueva velocidad (o duración). */
export function retime(c, speed) {
  if (Math.abs(speed - 1) < 1e-3) return cloneClip(c);
  const frames = Math.max(2, Math.round((c.frames - 1) / speed) + 1);
  const tracks = Object.fromEntries(Object.keys(c.tracks).map((k) => [k, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  const pose = newPose();
  for (let i = 0; i < frames; i++) {
    const t = Math.min(c.duration, ((i / (frames - 1)) * c.duration));
    pose.q = {};
    sampleClip(c, t, pose);
    for (const k in tracks) pose.q[k].toArray(tracks[k], i * 4);
    pose.hips.toArray(hips, i * 3);
  }
  return makeClip({ ...c, frames, tracks, hips });
}

export function trim(c, f0, f1) {
  f0 = Math.max(0, Math.floor(f0));
  f1 = Math.min(c.frames - 1, Math.ceil(f1));
  const n = f1 - f0 + 1;
  const tracks = Object.fromEntries(Object.entries(c.tracks).map(([k, v]) => [k, v.slice(f0 * 4, (f1 + 1) * 4)]));
  return makeClip({ ...c, frames: n, tracks, hips: c.hips ? c.hips.slice(f0 * 3, (f1 + 1) * 3) : null });
}

/**
 * Aplica los parámetros del laboratorio.
 * p = { amp:{grupo:k}, overlap:frames, smooth:0..1, posture:°, head:°, chest:°, bounce:k, lower:m, speed:k,
 *       hold:n, mirror, reverse, loopFix:frames, style, direction:°, strafe:boolean }
 */
export function processClip(src, p = {}) {
  const st = STYLES[p.style] || {};
  const amp = { ...(st.amp || {}), ...(p.amp || {}) };
  const speed = (p.speed ?? 1) * (st.speed ?? 1);
  let c = retime(src, speed);
  const n = c.frames;
  const out = cloneClip(c);
  // 1) exagerar / suavizar amplitud por zona alrededor de la pose media
  for (const [id, arr] of Object.entries(out.tracks)) {
    const k = amp[groupOf(id)] ?? 1;
    if (Math.abs(k - 1) < 1e-3) continue;
    const mean = avgQuat(arr, n);
    const inv = mean.clone().invert();
    for (let i = 0; i < n; i++) {
      _a.fromArray(arr, i * 4);
      const d = inv.clone().multiply(_a);
      powQuat(d, k, _b);
      mean.clone().multiply(_b).toArray(arr, i * 4);
    }
  }
  // 2) solapamiento: los extremos llegan tarde (cadena → brazos/cabeza/dedos)
  const overlap = (p.overlap ?? 0) + (st.overlap ?? 0);
  if (overlap > 0) {
    const delay = { torso: 0, head: overlap, arms: overlap * 0.6, legs: 0, fingers: overlap * 1.4 };
    const lowerArm = /lowerArm|hand/;
    for (const [id, arr] of Object.entries(out.tracks)) {
      let dl = delay[groupOf(id)] || 0;
      if (lowerArm.test(id)) dl += overlap * 0.5;
      if (!dl) continue;
      const copy = arr.slice();
      for (let i = 0; i < n; i++) {
        let f = i - dl;
        if (c.loop) f = ((f % (n - 1)) + (n - 1)) % (n - 1);
        else f = Math.max(0, f);
        const i0 = Math.floor(f);
        const i1 = Math.min(i0 + 1, n - 1);
        _a.fromArray(copy, i0 * 4).slerp(_b.fromArray(copy, i1 * 4), f - i0).toArray(arr, i * 4);
      }
    }
  }
  // 3) suavizado (media móvil)
  const sm = Math.round((p.smooth ?? 0) * 6);
  if (sm > 0) {
    for (const arr of Object.values(out.tracks)) {
      const copy = arr.slice();
      for (let i = 0; i < n; i++) {
        let x = 0, y = 0, z = 0, w = 0;
        _b.fromArray(copy, i * 4);
        for (let j = -sm; j <= sm; j++) {
          let k = i + j;
          if (c.loop) k = ((k % (n - 1)) + (n - 1)) % (n - 1);
          else k = Math.min(n - 1, Math.max(0, k));
          _a.fromArray(copy, k * 4);
          const s = _a.dot(_b) < 0 ? -1 : 1;
          x += s * _a.x;
          y += s * _a.y;
          z += s * _a.z;
          w += s * _a.w;
        }
        _a.set(x, y, z, w).normalize().toArray(arr, i * 4);
      }
    }
    if (out.hips) {
      const copy = out.hips.slice();
      for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) {
        let s = 0;
        let cnt = 0;
        for (let j = -sm; j <= sm; j++) {
          const k = Math.min(n - 1, Math.max(0, i + j));
          s += copy[k * 3 + a];
          cnt++;
        }
        out.hips[i * 3 + a] = s / cnt;
      }
    }
  }
  // 4) postura, pecho y cabeza (giros sobre el eje lateral, en mundo canónico: hijos incluidos)
  const lean = (p.posture ?? 0) + (st.posture ?? 0);
  const chest = (p.chest ?? 0) + (st.chest ?? 0);
  const head = (p.head ?? 0) + (st.head ?? 0);
  const applyFrom = (ids, deg) => {
    if (!deg) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg * D2R);
    for (const id of ids) {
      const arr = out.tracks[id];
      if (!arr) continue;
      for (let i = 0; i < n; i++) _a.fromArray(arr, i * 4).premultiply(q).toArray(arr, i * 4);
    }
  };
  const upper = Object.keys(out.tracks).filter((id) => /^(chest|upperChest|neck|head|shoulder|upperArm|lowerArm|hand|thumb|index|middle|ring|little)/.test(id));
  applyFrom(['spine', ...upper], lean * 0.5);
  applyFrom(upper, lean * 0.5 + chest);
  applyFrom(['head'], head);
  // 5) rebote y altura de la cadera
  const bounce = (p.bounce ?? 1) * (st.bounce ?? 1);
  const lower = (p.lower ?? 0) + (st.lower ?? 0);
  if (out.hips && (Math.abs(bounce - 1) > 1e-3 || lower)) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out.hips[i * 3 + 1];
    mean /= n;
    for (let i = 0; i < n; i++) out.hips[i * 3 + 1] = mean + (out.hips[i * 3 + 1] - mean) * bounce - lower;
  }
  // 6) a saltos (pose mantenida cada n fotogramas)
  const hold = p.hold ?? st.hold ?? 0;
  if (hold > 1) {
    for (const arr of Object.values(out.tracks)) for (let i = 0; i < n; i++) {
      const s = Math.floor(i / hold) * hold;
      for (let k = 0; k < 4; k++) arr[i * 4 + k] = arr[s * 4 + k];
    }
  }
  // 7) bucle sin salto: funde los últimos fotogramas hacia el primero
  if (p.loopFix > 0 && n > p.loopFix + 2) {
    const m = Math.round(p.loopFix);
    for (const arr of Object.values(out.tracks)) {
      _b.fromArray(arr, 0);
      for (let j = 0; j < m; j++) {
        const i = n - m + j;
        const w = (j + 1) / m;
        _a.fromArray(arr, i * 4).slerp(_b, w * w * (3 - 2 * w)).toArray(arr, i * 4);
      }
    }
    out.loop = true;
  }
  // 8) dirección (8 direcciones): girar todo, o desplazarse de lado mirando al frente
  const dir = p.direction ?? 0;
  if (dir) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dir * D2R);
    if (out.hips) {
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(out.hips[i * 3], out.hips[i * 3 + 1], out.hips[i * 3 + 2]).applyQuaternion(yaw);
        v.toArray(out.hips, i * 3);
      }
    }
    if (!p.strafe) {
      for (const arr of Object.values(out.tracks)) for (let i = 0; i < n; i++) _a.fromArray(arr, i * 4).premultiply(yaw).toArray(arr, i * 4);
    } else {
      // de lado: piernas y cadera orientadas hacia la marcha (como mucho 70°), el resto mirando al frente
      let legYaw = ((dir + 540) % 360) - 180;
      legYaw = Math.max(-70, Math.min(70, Math.abs(legYaw) > 110 ? legYaw - Math.sign(legYaw) * 180 : legYaw));
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), legYaw * D2R);
      for (const [id, arr] of Object.entries(out.tracks)) {
        if (!/^(hips|upperLeg|lowerLeg|foot|toes)/.test(id)) continue;
        for (let i = 0; i < n; i++) _a.fromArray(arr, i * 4).premultiply(qy).toArray(arr, i * 4);
      }
      if (Math.abs(((dir + 540) % 360) - 180) > 110) {
        // hacia atrás: el ciclo al revés
        return processClip(reverseClip(out), { direction: 0 });
      }
    }
  }
  if (p.mirror) mirrorClip(out);
  return p.reverse ? reverseClip(out) : out;
}

export function mirrorClip(c) {
  const tracks = {};
  for (const [id, arr] of Object.entries(c.tracks)) {
    const m = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i += 4) {
      m[i] = arr[i];
      m[i + 1] = -arr[i + 1];
      m[i + 2] = -arr[i + 2];
      m[i + 3] = arr[i + 3];
    }
    tracks[mirrorCanon(id)] = m;
  }
  c.tracks = tracks;
  if (c.hips) for (let i = 0; i < c.hips.length; i += 3) c.hips[i] = -c.hips[i];
  return c;
}

export function reverseClip(c) {
  const n = c.frames;
  const out = cloneClip(c);
  for (const [id, arr] of Object.entries(c.tracks)) for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) out.tracks[id][i * 4 + k] = arr[(n - 1 - i) * 4 + k];
  if (c.hips) for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) out.hips[i * 3 + k] = c.hips[(n - 1 - i) * 3 + k];
  return makeClip(out);
}

export const DIRECTIONS = [
  [0, 'Adelante'], [45, 'Adelante-izq.'], [90, 'Izquierda'], [135, 'Atrás-izq.'],
  [180, 'Atrás'], [-135, 'Atrás-der.'], [-90, 'Derecha'], [-45, 'Adelante-der.'],
];
