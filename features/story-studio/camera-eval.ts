import type { Actor, Shot, Vec3 } from './model.ts';
import type { CameraRig } from './camera-model.ts';
import { cameraEase } from './motion-easing.ts';
import { routePoint } from './path.ts';

/**
 * Evaluación pura de las cámaras con nombre. Sin estado entre fotogramas: la pose en T sale de los datos de
 * autor y de las posiciones de los actores en el tiempo de la visita a la escena (que ya son deterministas).
 */
export type RigContext = {
  /** Actores en el instante T (segundos desde que empezó esta visita a la escena). */
  actorsAt(T: number): readonly Actor[];
  /**
   * Semiancho efectivo de la ventana de suavizado en T. Se estrecha hasta 0 en las fronteras duras (inicio de
   * la escena, puertas que esperan al estudiante, horizonte conocido): así no hay saltos al cruzarlas.
   */
  halfWindow(T: number, seconds: number): number;
  /** Progreso 0–1 de un camino u órbita, movido por los cues `cameraMove`. */
  progress(cameraId: string, T: number): number;
  /** «Reducir movimiento»: suavizados más fuertes (fase 4). */
  smoothingBoost?: number;
};

type V = readonly [number, number, number];
const add = (a: V, b: V): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpV = (a: V, b: V, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const unit = (a: V): Vec3 => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, -1]; };
const angleLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** Interpolación esférica de dos direcciones unitarias (equivale al slerp del cuaternión sin balanceo). */
export function slerpDirection(a: V, b: V, k: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  if (dot > .9995) return unit(lerpV(a, b, k));
  // Direcciones opuestas: gira alrededor del eje vertical, que nunca produce balanceo.
  const rel = dot < -.9995 ? unit([-a[2], 0, a[0]].some(n => Math.abs(n) > 1e-6) ? [-a[2], 0, a[0]] : [1, 0, 0]) : unit(sub(b, mul(a, dot)));
  const theta = Math.acos(dot) * k;
  return add(mul(a, Math.cos(theta)), mul(rel, Math.sin(theta)));
}

/**
 * Mezcla de dos poses: orientación por slerp, distancia al objetivo interpolada aparte (nunca position == target),
 * posición lineal o en arco (coordenadas cilíndricas alrededor del punto medio de los objetivos: no atraviesa
 * a los personajes) y fov lineal.
 */
export function blendPoses(a: Shot, b: Shot, k: number, route: 'linear' | 'arc' = 'linear'): Shot {
  if (k <= 0) return { ...a, transition: 0 };
  if (k >= 1) return { ...b, transition: 0 };
  const da = sub(a.target, a.position), db = sub(b.target, b.position);
  const direction = slerpDirection(unit(da), unit(db), k);
  let position = lerpV(a.position, b.position, k);
  if (route === 'arc') {
    const c = lerpV(a.target, b.target, .5), va = sub(a.position, c), vb = sub(b.position, c);
    const ra = Math.hypot(va[0], va[2]), rb = Math.hypot(vb[0], vb[2]);
    if (ra > 1e-3 && rb > 1e-3) {
      const angle = angleLerp(Math.atan2(va[0], va[2]), Math.atan2(vb[0], vb[2]), k), r = lerp(ra, rb, k);
      position = [c[0] + Math.sin(angle) * r, c[1] + lerp(va[1], vb[1], k), c[2] + Math.cos(angle) * r];
    }
  }
  const distance = Math.max(1e-3, lerp(len(da), len(db), k));
  return { position, target: add(position, mul(direction, distance)), fov: lerp(a.fov, b.fov, k), transition: 0 };
}

/** Media gaussiana centrada (fase cero): el futuro es conocido, así que suaviza sin retraso. */
export function smoothSample(sample: (T: number) => Vec3, T: number, half: number): Vec3 {
  if (!(half > 1e-6)) return sample(T);
  const K = 9, sigma = half / 2;
  let sum: Vec3 = [0, 0, 0], weights = 0;
  for (let i = 0; i < K; i++) {
    const tau = half * (i - (K - 1) / 2) / ((K - 1) / 2), w = Math.exp(-.5 * (tau / sigma) ** 2);
    sum = add(sum, mul(sample(T + tau), w)); weights += w;
  }
  return mul(sum, 1 / weights);
}

/** Desplazamiento en el espacio del actor (rotation = rumbo, 0 mira a +Z, como el director). */
export const actorSpace = (offset: V, rotation: number): Vec3 =>
  [offset[0] * Math.cos(rotation) + offset[2] * Math.sin(rotation), offset[1], -offset[0] * Math.sin(rotation) + offset[2] * Math.cos(rotation)];

/** Punto de mira por defecto de un actor: un poco por debajo de lo alto de la cabeza. */
export const headOffset = (height: number): Vec3 => [0, Math.round(height * .92 * 100) / 100, 0];

/** Pose de una cámara con nombre en T. Si falta un actor (no debería: validateProject lo impide) usa la base. */
export function rigPose(rig: CameraRig, T: number, ctx: RigContext): Shot {
  const boost = ctx.smoothingBoost ?? 0;
  const actor = (id: string, t: number) => ctx.actorsAt(t).find(a => a.id === id);
  const window = (s: number, t: number) => ctx.halfWindow(t, s > 0 || boost > 0 ? s * (1 + boost) + boost * .3 : 0);
  let position: Vec3 = [...rig.base.position];
  const body = rig.body;
  if (body.kind === 'follow') {
    const raw = (t: number): Vec3 => { const a = actor(body.actorId, t); return a ? add(a.position, body.space === 'actor' ? actorSpace(body.offset, a.rotation) : body.offset) : [...rig.base.position]; };
    position = smoothSample(raw, T, window(body.smoothing, T));
  } else if (body.kind === 'path') {
    const u = cameraEase(ctx.progress(rig.id, T), body.easing);
    position = body.points.length === 1 ? [...body.points[0]] : [...routePoint(body.points[0], body.points.slice(1), u).position];
  } else if (body.kind === 'orbit') {
    const a = actor(body.actorId, T), u = ctx.progress(rig.id, T), angle = lerp(body.fromAngle, body.toAngle, u);
    if (a) position = [a.position[0] + Math.sin(angle) * body.radius, a.position[1] + body.height, a.position[2] + Math.cos(angle) * body.radius];
  }
  const baseDirection = sub(rig.base.target, rig.base.position);
  let target: Vec3 = add(position, baseDirection);
  const aim = rig.aim;
  if (aim.kind === 'actor') {
    const raw = (t: number): Vec3 => { const a = actor(aim.actorId, t); return a ? add(a.position, aim.offset) : add(position, baseDirection); };
    target = smoothSample(raw, T, window(aim.smoothing, T));
  } else if (aim.kind === 'group') {
    const raw = (t: number): Vec3 => {
      const found = aim.actorIds.map(id => actor(id, t)).filter((a): a is Actor => !!a);
      if (!found.length) return add(position, baseDirection);
      return mul(found.reduce<Vec3>((s, a) => add(s, add(a.position, [0, a.height * .75, 0])), [0, 0, 0]), 1 / found.length);
    };
    target = smoothSample(raw, T, window(aim.smoothing, T));
  } else if (aim.kind === 'point') target = [...aim.point];
  if (len(sub(target, position)) < 1e-3) target = add(position, len(baseDirection) > 1e-3 ? baseDirection : [0, 0, -1]);
  return { position, target, fov: rig.lens?.fov ?? rig.base.fov, transition: 0 };
}

/** Progreso de una mezcla de cámara en `elapsed` segundos. */
export const blendProgress = (elapsed: number, duration: number, easing?: Parameters<typeof cameraEase>[1]) => cameraEase(duration > 0 ? elapsed / duration : 1, easing);
