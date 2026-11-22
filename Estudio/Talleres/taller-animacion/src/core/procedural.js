// Clips generados por código (en espacio canónico): no dependen de ningún archivo.
import * as THREE from 'three';
import { CANON } from './humanoid.js';
import { makeClip } from './clip.js';

const D = Math.PI / 180;
const e = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D, 'XYZ'));
const rx = (a) => e(a, 0, 0);
const ry = (a) => e(0, a, 0);
const rz = (a) => e(0, 0, a);
const mul = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const S = Math.sin;
const C = Math.cos;
const TAU = Math.PI * 2;
const pos = (x) => Math.max(0, x);

// Interpolación suave por tramos: [[t, v], ...]
function curve(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    const [t0, v0] = pts[i - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return pts[pts.length - 1][1];
}

/** Locales (relativas a pose T, en el marco del padre) → rotaciones de mundo canónicas. */
function compose(L) {
  const W = {};
  for (const def of CANON) {
    const parent = def.parent ? W[def.parent] : null;
    const w = parent ? parent.clone() : new THREE.Quaternion();
    if (L[def.id]) w.multiply(L[def.id]);
    W[def.id] = w;
  }
  return W;
}

function fingers(L, side, curl, thumbCurl = curl * 0.6, spread = 0) {
  const s = side === 'L' ? -1 : 1;
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const c = typeof curl === 'object' ? curl[f] ?? 0 : curl;
    L[`${f}1${side}`] = mul(ry(-s * spread * ({ index: 1, middle: 0, ring: -1, little: -2 })[f]), rz(s * c));
    L[`${f}2${side}`] = rz(s * c * 1.1);
    L[`${f}3${side}`] = rz(s * c * 0.8);
  }
  L[`thumb1${side}`] = rz(s * thumbCurl * 0.5);
  L[`thumb2${side}`] = ry(s * thumbCurl * 0.6);
  L[`thumb3${side}`] = ry(s * thumbCurl * 0.6);
}

// Postura de reposo: brazos abajo, codos algo flexionados, manos relajadas.
function rest(L = {}, { arms = 74, elbow = 10 } = {}) {
  L.shoulderL = rz(-4);
  L.shoulderR = rz(4);
  L.upperArmL = rz(-arms);
  L.upperArmR = rz(arms);
  L.lowerArmL = ry(-elbow);
  L.lowerArmR = ry(elbow);
  L.handL = rz(-4);
  L.handR = rz(4);
  fingers(L, 'L', 14);
  fingers(L, 'R', 14);
  return L;
}

function armSwing(side, forward, base = 74) {
  // brazo colgando, balanceo hacia delante (+) / atrás (-)
  const s = side === 'L' ? -1 : 1;
  return mul(rx(-forward), rz(s * base));
}

function build({ id, name, tags, seconds, loop = true, fn }) {
  const fps = 30;
  const frames = Math.max(2, Math.round(seconds * fps) + 1);
  const tracks = {};
  for (const def of CANON) tracks[def.id] = new Float32Array(frames * 4);
  const hips = new Float32Array(frames * 3);
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const { L, h = [0, 0, 0] } = fn(t, t * seconds);
    const W = compose(L);
    for (const def of CANON) W[def.id].toArray(tracks[def.id], i * 4);
    hips[i * 3] = h[0];
    hips[i * 3 + 1] = h[1];
    hips[i * 3 + 2] = h[2];
  }
  return makeClip({ id, name, tags, fps, frames, loop, source: 'generado', author: 'Taller (código)', tracks, hips });
}

function breathe(L, p, k = 1) {
  L.chest = mul(L.chest || new THREE.Quaternion(), rx(-1.2 * k * S(p)));
  L.upperChest = mul(L.upperChest || new THREE.Quaternion(), rx(-0.8 * k * S(p)));
  return L;
}

export function proceduralClips() {
  const clips = [];

  clips.push(build({ id: 'gen_pose_t', name: 'Pose T', tags: ['poses'], seconds: 1, fn: () => ({ L: {} }) }));

  clips.push(build({
    id: 'gen_pose_a', name: 'Pose A', tags: ['poses'], seconds: 1,
    fn: () => ({ L: { upperArmL: rz(-45), upperArmR: rz(45) } }),
  }));

  clips.push(build({
    id: 'gen_reposo', name: 'Reposo', tags: ['locomoción', 'gestos'], seconds: 3,
    fn: (t) => {
      const p = TAU * t;
      const L = rest({}, { arms: 74 + 1.5 * S(p) });
      breathe(L, p);
      L.hips = mul(ry(2 * S(p)), rz(1.2 * S(p)));
      L.spine = rz(-0.8 * S(p));
      L.head = mul(ry(3 * S(p * 1)), rx(1 * S(2 * p)));
      L.upperLegL = rz(-1.2 * S(p));
      L.upperLegR = rz(-1.2 * S(p));
      L.lowerLegL = rx(3);
      L.upperLegL = mul(L.upperLegL, rx(-2));
      L.footL = rx(-1);
      return { L, h: [0.012 * S(p), -0.004 - 0.003 * C(2 * p), 0] };
    },
  }));

  const gait = ({ id, name, seconds, thigh, knee, arm, elbow, lean, bob, stride, tags }) =>
    build({
      id, name, tags, seconds,
      fn: (t) => {
        const p = TAU * t;
        const L = rest({}, { arms: 76, elbow });
        const legs = (side, ph) => {
          const a = thigh * S(ph); // + = muslo adelante
          const k = 4 + knee * Math.pow(pos(C(ph)), 1.6) + 6 * pos(-S(ph));
          L[`upperLeg${side}`] = rx(-a);
          L[`lowerLeg${side}`] = rx(k);
          L[`foot${side}`] = rx(a - k * 0.75 - 6 * pos(C(ph)));
          L[`toes${side}`] = rx(-12 * pos(-S(ph)) * pos(-C(ph)));
        };
        legs('L', p);
        legs('R', p + Math.PI);
        L.upperArmL = armSwing('L', -arm * S(p), 76);
        L.upperArmR = armSwing('R', arm * S(p), 76);
        L.lowerArmL = ry(-elbow - 0.5 * elbow * pos(-S(p)));
        L.lowerArmR = ry(elbow + 0.5 * elbow * pos(S(p)));
        L.hips = mul(ry(6 * S(p)), rz(3 * C(2 * p)));
        L.spine = mul(rx(lean), ry(-4 * S(p)));
        L.chest = ry(-4 * S(p));
        L.neck = ry(4 * S(p));
        L.head = rx(-lean * 0.6);
        return { L, h: [0.01 * S(p), -bob * 0.5 - bob * 0.5 * C(2 * p) - 0.01, stride * t] };
      },
    });

  clips.push(gait({ id: 'gen_caminar', name: 'Caminar', tags: ['locomoción'], seconds: 1.1, thigh: 24, knee: 55, arm: 18, elbow: 14, lean: 2, bob: 0.025, stride: 1.45 }));
  clips.push(gait({ id: 'gen_correr', name: 'Correr', tags: ['locomoción'], seconds: 0.7, thigh: 42, knee: 95, arm: 38, elbow: 75, lean: 9, bob: 0.06, stride: 3.2 }));

  clips.push(build({
    id: 'gen_saludar', name: 'Saludar', tags: ['gestos'], seconds: 2.4,
    fn: (t) => {
      const p = TAU * t;
      const L = rest();
      breathe(L, p);
      const up = curve(t, [[0, 0], [0.18, 1], [0.82, 1], [1, 0]]);
      L.upperArmR = mul(ry(15 * up), rz(74 * (1 - up) - 25 * up));
      L.lowerArmR = mul(rz(-100 * up), ry(10 * (1 - up)), rz(up * 22 * S(TAU * 3 * t)));
      fingers(L, 'R', 14 * (1 - up) + 2, 8, 6 * up);
      L.head = mul(rz(-5 * up), ry(-6 * up));
      L.chest = mul(L.chest, rz(-3 * up));
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_asentir', name: 'Asentir (sí)', tags: ['gestos'], seconds: 1.6,
    fn: (t) => {
      const p = TAU * t;
      const L = rest();
      breathe(L, p);
      const nod = 14 * S(TAU * 2 * t) * curve(t, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
      L.neck = rx(nod * 0.4);
      L.head = rx(nod);
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_negar', name: 'Negar (no)', tags: ['gestos'], seconds: 1.6,
    fn: (t) => {
      const p = TAU * t;
      const L = rest();
      breathe(L, p);
      const sh = 26 * S(TAU * 2 * t) * curve(t, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
      L.neck = ry(sh * 0.35);
      L.head = ry(sh);
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_senalar', name: 'Señalar', tags: ['gestos'], seconds: 2.2, loop: false,
    fn: (t) => {
      const L = rest();
      const up = curve(t, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
      L.upperArmR = mul(ry(82 * up), rz(74 * (1 - up) + 8 * up));
      L.lowerArmR = ry(10 * (1 - up) + 4 * up);
      L.handR = rz(4 * (1 - up));
      fingers(L, 'R', { index: 14 * (1 - up), middle: 14 + 66 * up, ring: 14 + 70 * up, little: 14 + 72 * up }, 14 + 30 * up);
      L.chest = ry(-8 * up);
      L.head = ry(-10 * up);
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_aplaudir', name: 'Aplaudir', tags: ['gestos'], seconds: 1.2,
    fn: (t) => {
      const L = rest();
      const c = 0.5 + 0.5 * C(TAU * 3 * t); // 1 = abiertas, 0 = juntas
      L.upperArmL = mul(ry(-58), rz(-55));
      L.upperArmR = mul(ry(58), rz(55));
      L.lowerArmL = mul(ry(-55 - 18 * (1 - c)), rx(-70));
      L.lowerArmR = mul(ry(55 + 18 * (1 - c)), rx(-70));
      fingers(L, 'L', 4);
      fingers(L, 'R', 4);
      L.head = rx(3 * C(TAU * 3 * t));
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_encogerse', name: 'Encogerse de hombros', tags: ['gestos'], seconds: 1.6, loop: false,
    fn: (t) => {
      const L = rest();
      const k = curve(t, [[0, 0], [0.3, 1], [0.6, 1], [1, 0]]);
      L.shoulderL = rz(-4 + 18 * k);
      L.shoulderR = rz(4 - 18 * k);
      L.upperArmL = rz(-74 + 6 * k);
      L.upperArmR = rz(74 - 6 * k);
      L.lowerArmL = mul(ry(-10 - 65 * k), rx(-60 * k));
      L.lowerArmR = mul(ry(10 + 65 * k), rx(-60 * k));
      fingers(L, 'L', 14 - 10 * k);
      fingers(L, 'R', 14 - 10 * k);
      L.head = rz(8 * k);
      return { L };
    },
  }));

  clips.push(build({
    id: 'gen_saltar', name: 'Saltar', tags: ['locomoción'], seconds: 1.6, loop: false,
    fn: (t) => {
      const L = rest();
      const crouch = curve(t, [[0, 0], [0.22, 1], [0.32, 0], [0.62, 0.1], [0.74, 1], [0.95, 0], [1, 0]]);
      const air = curve(t, [[0, 0], [0.3, 0], [0.47, 1], [0.66, 0], [1, 0]]);
      for (const s of ['L', 'R']) {
        L[`upperLeg${s}`] = rx(-60 * crouch - 12 * air);
        L[`lowerLeg${s}`] = rx(110 * crouch + 25 * air);
        L[`foot${s}`] = rx(-50 * crouch + 20 * air);
      }
      L.spine = rx(18 * crouch);
      L.chest = rx(10 * crouch);
      const arm = -45 * crouch + 150 * air;
      L.upperArmL = armSwing('L', arm, 74);
      L.upperArmR = armSwing('R', arm, 74);
      return { L, h: [0, -0.3 * crouch + 0.45 * air, 0] };
    },
  }));

  clips.push(build({
    id: 'gen_sentado', name: 'Sentado', tags: ['interacción'], seconds: 3,
    fn: (t) => {
      const p = TAU * t;
      const L = rest({}, { arms: 70, elbow: 40 });
      breathe(L, p);
      for (const s of ['L', 'R']) {
        L[`upperLeg${s}`] = mul(rx(-88), rz(s === 'L' ? -4 : 4));
        L[`lowerLeg${s}`] = rx(88);
        L[`foot${s}`] = rx(0);
      }
      L.upperArmL = mul(ry(-25), rz(-68));
      L.upperArmR = mul(ry(25), rz(68));
      L.lowerArmL = ry(-45);
      L.lowerArmR = ry(45);
      L.spine = rx(-4);
      L.head = mul(ry(4 * S(p)), rx(2));
      return { L, h: [0, -0.5, -0.1] };
    },
  }));

  clips.push(build({
    id: 'gen_pensar', name: 'Pensar', tags: ['gestos'], seconds: 3,
    fn: (t) => {
      const p = TAU * t;
      const L = rest();
      breathe(L, p);
      L.upperArmR = mul(ry(38), rz(62));
      L.lowerArmR = mul(ry(135), rx(-20));
      L.handR = rz(-20);
      fingers(L, 'R', { index: 20, middle: 60, ring: 65, little: 70 }, 30);
      L.upperArmL = mul(ry(-40), rz(-68));
      L.lowerArmL = ry(-95);
      L.head = mul(rx(-6), rz(-8 + 2 * S(p)), ry(5));
      return { L };
    },
  }));

  return clips;
}

// Poses de mano (solo dedos), como clips de 2 fotogramas.
export function handPoses() {
  const mk = handPoseFrom;
  return [
    mk('mano_puno', 'Puño', 85, 55),
    mk('mano_abierta', 'Mano abierta', 0, 0, 6),
    mk('mano_natural', 'Mano natural', 18, 12, 2),
    mk('mano_senalar', 'Índice', { index: 0, middle: 85, ring: 85, little: 85 }, 50),
    mk('mano_pinza', 'Pinza', { index: 45, middle: 20, ring: 25, little: 30 }, 45),
  ];
}

/** Pose de mano a partir de cerrar (curl, grados; número o { index, middle, ring, little }), pulgar y abrir (spread). */
export function handPoseFrom(id, name, curl, thumb, spread = 0) {
  {
    const L = {};
    fingers(L, 'L', curl, thumb, spread);
    fingers(L, 'R', curl, thumb, spread);
    const W = compose(L);
    const q = {};
    for (const s of ['L', 'R']) for (const f of ['thumb', 'index', 'middle', 'ring', 'little']) for (let n = 1; n <= 3; n++) {
      const id2 = `${f}${n}${s}`;
      // local relativo a la mano: quitamos la rotación de la mano (identidad aquí)
      q[id2] = W[id2];
    }
    return { id, name, q };
  }
}
