import { actorsAfter } from './actor-motion.ts';
import { blendPoses, blendProgress, rigPose, type RigContext } from './camera-eval.ts';
import type { CameraRig } from './camera-model.ts';
import { cameraEase } from './motion-easing.ts';
import { sequenceDuration, type Actor, type Cue, type Sequence, type Shot, type StudioScene, type StudioSnapshot, type Vec3 } from './model.ts';

/**
 * Línea temporal de cámaras de UNA visita a una escena (el «compilado» del plan, 4.8).
 * Tiempo T = segundos desde que empezó la visita. Los momentos de la ruta van seguidos; tras el actual se añaden
 * los que siguen por puertas automáticas (sucesor único, sin espera) para que el suavizado pueda mirar adelante.
 */
export type CameraOptions = { reduceMotion?: boolean };
const byStart = (a: { at: number }, b: { at: number }) => a.at - b.at;
const MAX_LOOKAHEAD = 3.5;
const MAX_NESTED_BLENDS = 3;

type Segment = { moment: Sequence; offset: number; duration: number; sorted: Cue[] };
/** Instante de la visita: absoluto y, para restar sin error de redondeo, momento y tiempo local. */
type When = { abs: number; seg: number; local: number };
type Event = { cue: Extract<Cue, { kind: 'camera' | 'cameraSwitch' }>; at: number; when: When };
/** Tiempo transcurrido: en local si ambos instantes caen en el mismo momento (igual que el cálculo antiguo). */
const since = (a: When, b: When) => a.seg === b.seg ? a.local - b.local : a.abs - b.abs;

export const legacyBlend = (a: Shot, b: Shot, t: number): Shot => ({ position: a.position.map((v, i) => v + (b.position[i] - v) * t) as unknown as Vec3, target: a.target.map((v, i) => v + (b.target[i] - v) * t) as unknown as Vec3, fov: a.fov + (b.fov - a.fov) * t, transition: b.transition });
const legacyProgress = (elapsed: number, target: Shot) => cameraEase(target.transition ? (elapsed / target.transition) : 1, target.easing);

/** ¿Esta visita usa el Switcher? Si no, el director usa el cálculo antiguo, idéntico bit a bit. */
export const usesSwitcher = (scene: StudioScene, moments: readonly Sequence[]) =>
  !!scene.cameras?.length && moments.some(m => m.cues.some(c => c.kind === 'cameraSwitch'));

export type CameraVisit = ReturnType<typeof createCameraVisit>;

/**
 * @param moments momentos de esta visita en orden (el último es el actual)
 * @param future momentos que siguen al actual por puertas automáticas dentro de la misma escena
 * @param startOf actores al empezar el momento k de `moments` (puede venir de la caché del director)
 */
export function createCameraVisit(scene: StudioScene, moments: readonly Sequence[], future: readonly Sequence[], time: number, startOf: (k: number) => readonly Actor[] | undefined, options: CameraOptions = {}) {
  const segments: Segment[] = [];
  let offset = 0;
  for (const moment of [...moments, ...future]) {
    const duration = sequenceDuration(moment);
    segments.push({ moment, offset, duration, sorted: [...moment.cues].sort(byStart) });
    offset += duration;
  }
  const current = moments.length - 1, now = segments[current].offset + time;
  // Fronteras duras: inicio de la visita, el final de cada momento que espera al estudiante y el horizonte conocido.
  const edges = [0, ...segments.flatMap((s, i) => i === segments.length - 1 || s.moment.gate.kind !== 'auto' ? [s.offset + s.duration] : [])];
  const horizon = segments.at(-1)!.offset + segments.at(-1)!.duration;
  const rigs = new Map((scene.cameras ?? []).map(c => [c.id, c]));

  const starts: (readonly Actor[] | undefined)[] = [];
  const startActors = (k: number): readonly Actor[] => {
    if (starts[k]) return starts[k]!;
    const known = k === 0 ? scene.actors : k < moments.length ? startOf(k) : undefined;
    starts[k] = known ?? actorsAfter(startActors(k - 1), segments[k - 1].sorted, segments[k - 1].duration);
    return starts[k]!;
  };
  const segmentAt = (T: number) => { let i = 0; while (i < segments.length - 1 && segments[i + 1].offset <= T) i++; return i; };
  const actorMemo = new Map<number, readonly Actor[]>();
  const actorsAt = (T: number): readonly Actor[] => {
    const t = Math.max(0, Math.min(horizon, T));
    let hit = actorMemo.get(t);
    if (!hit) { const i = segmentAt(t), s = segments[i]; hit = actorsAfter(startActors(i), s.sorted, t - s.offset); actorMemo.set(t, hit); }
    return hit;
  };
  const progress = (cameraId: string, T: number) => {
    let u = 0;
    for (const s of segments) {
      if (s.offset > T) break;
      for (const cue of s.sorted) {
        if (cue.kind !== 'cameraMove' || cue.cameraId !== cameraId || s.offset + cue.at > T) continue;
        u = cue.from + (cue.to - cue.from) * cameraEase(Math.min(1, (T - s.offset - cue.at) / cue.duration), cue.easing);
      }
    }
    return u;
  };
  const halfWindow = (T: number, seconds: number) => Math.max(0, Math.min(seconds, ...edges.map(e => Math.abs(T - e))));
  const ctx: RigContext = { actorsAt, halfWindow, progress, smoothingBoost: options.reduceMotion ? 1 : 0 };
  const poseMemo = new Map<string, Shot>();
  const cameraAt = (rig: CameraRig, T: number) => {
    const key = rig.id + '@' + T;
    let pose = poseMemo.get(key);
    if (!pose) { pose = rigPose(rig, T, ctx); poseMemo.set(key, pose); }
    return pose;
  };

  // Programa del Switcher: cues `camera` antiguos y `cameraSwitch`, por momento y por byStart (orden de lista en empates).
  const events: Event[] = [];
  segments.slice(0, moments.length).forEach((s, i) => {
    for (const cue of s.sorted) if ((cue.kind === 'camera' || (cue.kind === 'cameraSwitch' && rigs.has(cue.cameraId))) && (i < current || cue.at <= time)) events.push({ cue, at: s.offset + cue.at, when: { abs: s.offset + cue.at, seg: i, local: cue.at } });
  });
  const transitionOf = (cue: Extract<Cue, { kind: 'cameraSwitch' }>) => {
    const t = cue.transition;
    if (t.kind === 'cut' || rigs.get(cue.cameraId)?.cutOnly || (options.reduceMotion && t.duration > .5)) return null;
    return t;
  };
  const frozen: Shot[] = [];
  const poseOf = (i: number, T: When, depth: number): Shot => {
    if (i < 0) return structuredClone(scene.shot);
    const { cue, when } = events[i];
    if (cue.kind === 'camera') return legacyBlend(frozen[i], cue.shot, legacyProgress(since(T, when), cue.shot));
    const to = cameraAt(rigs.get(cue.cameraId)!, T.abs), blend = transitionOf(cue);
    if (!blend) return to;
    const k = blendProgress(since(T, when), blend.duration, blend.easing);
    if (k >= 1) return to;
    return blendPoses(depth >= MAX_NESTED_BLENDS ? frozen[i] : poseOf(i - 1, T, depth + 1), to, k, blend.route);
  };
  // «Mezclar desde lo que se ve»: la pose de salida en el instante de cada cambio, en orden.
  for (let i = 0; i < events.length; i++) frozen[i] = i === 0 ? structuredClone(scene.shot) : poseOf(i - 1, events[i].when, 0);
  const nowWhen: When = { abs: now, seg: current, local: time };

  return {
    now, actorsAt, ctx, rigs,
    /** Pose en el aire ahora y metadatos para el motor. */
    program(): { shot: Shot; camera: NonNullable<StudioSnapshot['camera']> } {
      const last = events.at(-1);
      const shot = poseOf(events.length - 1, nowWhen, 0);
      if (!last) return { shot, camera: { id: null, switchId: null, cut: false, blend: 1 } };
      if (last.cue.kind === 'camera') return { shot, camera: { id: null, switchId: last.cue.id, cut: !last.cue.shot.transition, blend: legacyProgress(since(nowWhen, last.when), last.cue.shot) } };
      const blend = transitionOf(last.cue);
      return { shot, camera: { id: last.cue.cameraId, switchId: last.cue.id, cut: !blend, blend: blend ? blendProgress(since(nowWhen, last.when), blend.duration, blend.easing) : 1 } };
    },
    /** Pose de una cámara concreta ahora, se vea o no («ir a la cámara», congelar al borrar). */
    cameraNow(cameraId: string): Shot | null { const rig = rigs.get(cameraId); return rig ? cameraAt(rig, now) : null; },
    /** Pose en el aire en el instante (absoluto) de un cambio de esta visita: para auditar mezclas. */
    poseAt(T: number): Shot { let i = events.length - 1; while (i >= 0 && events[i].at > T) i--; const seg = segmentAt(T); return poseOf(i, { abs: T, seg, local: T - segments[seg].offset }, 0); },
  };
}

/** Momentos que siguen al actual por puertas automáticas dentro de la escena, hasta ~3,5 s. */
export function autoContinuation(list: readonly { scene: StudioScene; sequence: Sequence }[], index: number, remaining: number): Sequence[] {
  const result: Sequence[] = [];
  let i = index, budget = remaining;
  while (budget < MAX_LOOKAHEAD && result.length < 16) {
    const { scene, sequence } = list[i];
    if (sequence.gate.kind !== 'auto') break;
    const nextId = sequence.gate.nextSequenceId ?? list[i + 1]?.sequence.id;
    const next = list.findIndex(x => x.sequence.id === nextId);
    if (next < 0 || list[next].scene.id !== scene.id) break;
    result.push(list[next].sequence); budget += sequenceDuration(list[next].sequence); i = next;
  }
  return result;
}
