import { cameraVisitAt } from './director.ts';
import { MAX_BLEND, MAX_CAMERAS, type CameraAim, type CameraBody, type CameraRig, type CameraTransition } from './camera-model.ts';
import { headOffset } from './camera-eval.ts';
import { nextCueStart } from './editing.ts';
import { sequenceDuration, sequenceList, type Cue, type Shot, type StudioProject, type StudioScene, type Vec3 } from './model.ts';

/**
 * Operaciones puras de cámaras con nombre: proyecto → proyecto, como editing.ts. El editor valida el resultado y
 * lo apila en deshacer. Ninguna deja referencias colgantes (validateProject es todo o nada).
 */
const round = (n: number) => Math.round(n * 100) / 100;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const sceneOf = (project: StudioProject, sceneId: string) => { const s = project.scenes.find(x => x.id === sceneId); if (!s) throw new Error('La escena ya no existe.'); return s; };
const locate = (project: StudioProject, sequenceId: string) => {
  for (const scene of project.scenes) { const sequence = scene.sequences.find(s => s.id === sequenceId); if (sequence) return { scene, sequence }; }
  throw new Error('El momento ya no existe.');
};
const cameraOf = (scene: StudioScene, id: string) => { const c = scene.cameras?.find(x => x.id === id); if (!c) throw new Error('La cámara ya no existe.'); return c; };
const cleanShot = (shot: Shot): Shot => ({ position: [...shot.position], target: [...shot.target], fov: shot.fov, transition: 0 });

/** Cámara fija nueva con la vista actual del autor. */
export function createCamera(project: StudioProject, sceneId: string, view: Shot, name?: string): { project: StudioProject; id: string } {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  scene.cameras ??= [];
  if (scene.cameras.length >= MAX_CAMERAS) throw new Error(`Una escena admite hasta ${MAX_CAMERAS} cámaras.`);
  const id = newId('camera');
  const used = new Set(scene.cameras.map(c => c.name));
  let label = name?.trim().slice(0, 120) || `Cámara ${scene.cameras.length + 1}`;
  for (let n = 2; used.has(label); n++) label = `${name?.trim() || 'Cámara'} ${n}`;
  scene.cameras.push({ id, name: label, base: cleanShot(view), body: { kind: 'static' }, aim: { kind: 'fixed' } });
  return { project: copy, id };
}

/** Edición genérica (nombre, base, controladores, lente…). La mutación trabaja sobre una copia. */
export function editCamera(project: StudioProject, sceneId: string, cameraId: string, mutate: (camera: CameraRig) => void): StudioProject {
  const copy = structuredClone(project), camera = cameraOf(sceneOf(copy, sceneId), cameraId);
  mutate(camera);
  if (camera.id !== cameraId) throw new Error('La identidad de una cámara no se cambia.');
  delete camera.origin; // editarla a mano la convierte en manual a ojos del director automático
  return copy;
}

/** Controladores por defecto pensados para el actor elegido. */
export function bodyFor(kind: CameraBody['kind'], scene: StudioScene, camera: CameraRig, actorId?: string): CameraBody {
  const actor = scene.actors.find(a => a.id === actorId) ?? scene.actors[0];
  if ((kind === 'follow' || kind === 'orbit') && !actor) throw new Error('Coloca primero un personaje en la escena.');
  switch (kind) {
    case 'static': return { kind };
    case 'follow': {
      const off = camera.base.position.map((v, i) => round(v - actor!.position[i])) as unknown as Vec3;
      return { kind, actorId: actor!.id, offset: Math.hypot(off[0], off[2]) > .3 ? off : [1.4, 1.6, 2.4], space: 'world', smoothing: .6 };
    }
    case 'path': return { kind, points: [[...camera.base.position], [round(camera.base.position[0] + 3), camera.base.position[1], camera.base.position[2]]], easing: 'easeInOut' };
    case 'orbit': return { kind, actorId: actor!.id, radius: 2.5, height: round(actor!.height * .9), fromAngle: round(actor!.rotation - .6), toAngle: round(actor!.rotation + .6) };
  }
}
export function aimFor(kind: CameraAim['kind'], scene: StudioScene, camera: CameraRig, actorId?: string): CameraAim {
  const actor = scene.actors.find(a => a.id === actorId) ?? scene.actors[0];
  if ((kind === 'actor' || kind === 'group') && !actor) throw new Error('Coloca primero un personaje en la escena.');
  switch (kind) {
    case 'fixed': return { kind };
    case 'actor': return { kind, actorId: actor!.id, offset: headOffset(actor!.height), smoothing: .3 };
    case 'group': return { kind, actorIds: scene.actors.slice(0, 20).map(a => a.id), smoothing: .3 };
    case 'point': return { kind, point: [...camera.base.target] };
  }
}

export function duplicateCamera(project: StudioProject, sceneId: string, cameraId: string): { project: StudioProject; id: string } {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId), original = cameraOf(scene, cameraId);
  if (scene.cameras!.length >= MAX_CAMERAS) throw new Error(`Una escena admite hasta ${MAX_CAMERAS} cámaras.`);
  const id = newId('camera'), clone = structuredClone(original);
  clone.id = id; clone.name = `${original.name.slice(0, 160)} · copia`; delete clone.origin;
  scene.cameras!.splice(scene.cameras!.indexOf(original) + 1, 0, clone);
  return { project: copy, id };
}

export type DeleteCameraStrategy = { kind: 'remove-cues' } | { kind: 'reassign'; cameraId: string } | { kind: 'freeze' };
/** Cues que usan una cámara (para el diálogo de confirmación). */
export function cameraUses(project: StudioProject, sceneId: string, cameraId: string) {
  const scene = sceneOf(project, sceneId);
  return scene.sequences.flatMap(sequence => sequence.cues.filter(c => (c.kind === 'cameraSwitch' || c.kind === 'cameraMove') && c.cameraId === cameraId).map(cue => ({ sequenceId: sequence.id, cue })));
}

/**
 * Borra una cámara sin dejar referencias: quitando sus cues, pasándolos a otra cámara o congelándolos
 * (cada cambio se convierte en un plano anónimo con la pose que tenía la cámara en ese instante).
 */
export function deleteCamera(project: StudioProject, sceneId: string, cameraId: string, strategy: DeleteCameraStrategy): StudioProject {
  const original = sceneOf(project, sceneId);
  cameraOf(original, cameraId);
  if (strategy.kind === 'reassign' && (strategy.cameraId === cameraId || !original.cameras!.some(c => c.id === strategy.cameraId))) throw new Error('Elige otra cámara de la escena.');
  // Las poses se calculan sobre el proyecto original, en la previsualización lineal del editor.
  const list = sequenceList(project), frozen = new Map<string, Shot>();
  if (strategy.kind === 'freeze') for (const sequence of original.sequences) {
    const index = list.findIndex(x => x.sequence.id === sequence.id);
    for (const cue of sequence.cues) if (cue.kind === 'cameraSwitch' && cue.cameraId === cameraId) {
      const pose = cameraVisitAt(project, index, cue.at).cameraNow(cameraId);
      if (pose) frozen.set(cue.id, pose);
    }
  }
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  scene.cameras = scene.cameras!.filter(c => c.id !== cameraId);
  for (const sequence of scene.sequences) {
    sequence.cues = sequence.cues.flatMap((cue): Cue[] => {
      if (cue.kind === 'cameraMove' && cue.cameraId === cameraId) return [];
      if (cue.kind !== 'cameraSwitch' || cue.cameraId !== cameraId) return [cue];
      if (strategy.kind === 'remove-cues') return [];
      if (strategy.kind === 'reassign') return [{ ...cue, cameraId: strategy.cameraId }];
      const pose = frozen.get(cue.id);
      if (!pose) return [];
      const blend = cue.transition.kind === 'blend' ? cue.transition : null;
      return [{ id: cue.id, kind: 'camera', at: cue.at, duration: cue.duration, label: cue.label, shot: { ...cleanShot(pose), transition: blend ? Math.min(MAX_BLEND, blend.duration) : 0, ...(blend?.easing ? { easing: blend.easing } : {}) } }];
    });
  }
  if (!scene.cameras.length) delete scene.cameras;
  return copy;
}

/** Cambio de cámara (Switcher) en el primer hueco libre de la pista «Cámara». */
export function placeCameraSwitch(project: StudioProject, sequenceId: string, cameraId: string, playhead: number, transition: CameraTransition = { kind: 'cut' }): { project: StudioProject; id: string } {
  const copy = structuredClone(project), { scene, sequence } = locate(copy, sequenceId), camera = cameraOf(scene, cameraId);
  const id = newId('switch');
  sequence.cues.push({ id, kind: 'cameraSwitch', at: nextCueStart(sequence, 'camera', playhead), duration: transition.kind === 'blend' ? transition.duration : .5, cameraId, label: camera.name, transition });
  return { project: copy, id };
}

/** Movimiento (progreso 0→1) de una cámara con camino u órbita, en su propia pista. */
export function placeCameraMove(project: StudioProject, sequenceId: string, cameraId: string, playhead: number, duration = 3): { project: StudioProject; id: string } {
  const copy = structuredClone(project), { scene, sequence } = locate(copy, sequenceId), camera = cameraOf(scene, cameraId);
  if (camera.body.kind !== 'path' && camera.body.kind !== 'orbit') throw new Error('Solo se mueven las cámaras con camino u órbita.');
  const id = newId('move'), at = nextCueStart(sequence, `camera:${cameraId}`, playhead);
  // Continúa desde donde dejó el movimiento anterior de esta cámara en el momento.
  const previous = sequence.cues.filter(c => c.kind === 'cameraMove' && c.cameraId === cameraId && c.at <= at).sort((a, b) => a.at - b.at).at(-1);
  const from = previous?.kind === 'cameraMove' ? previous.to : 0;
  sequence.cues.push({ id, kind: 'cameraMove', at, duration: Math.max(.05, duration), cameraId, from, to: from < 1 ? 1 : 0, easing: 'easeInOut' });
  return { project: copy, id };
}

/** Pose de una cámara en un instante de la previsualización del editor («ir a la cámara»). */
export function cameraPoseAt(project: StudioProject, sequenceId: string, time: number, cameraId: string): Shot | null {
  const list = sequenceList(project), index = list.findIndex(x => x.sequence.id === sequenceId);
  if (index < 0) return null;
  return cameraVisitAt(project, index, Math.min(time, sequenceDuration(list[index].sequence))).cameraNow(cameraId);
}

/* ───────────── Integridad de las operaciones existentes (tabla 4.6 del plan) ───────────── */

/**
 * Antes de borrar un actor: las cámaras que lo siguen o lo miran pasan a fija con la pose que tenían en `at`
 * (o su base). Devuelve los nombres de las cámaras cambiadas, para avisar.
 */
export function releaseActorFromCameras(project: StudioProject, sceneId: string, actorId: string, at?: { sequenceId: string; time: number }): { project: StudioProject; changed: string[] } {
  const scene = sceneOf(project, sceneId), changed: string[] = [];
  const touches = (c: CameraRig) => ('actorId' in c.body && c.body.actorId === actorId) || (c.aim.kind === 'actor' && c.aim.actorId === actorId) || (c.aim.kind === 'group' && c.aim.actorIds.includes(actorId));
  const poses = new Map<string, Shot>();
  for (const camera of scene.cameras ?? []) if (touches(camera)) {
    const pose = at ? cameraPoseAt(project, at.sequenceId, at.time, camera.id) : null;
    poses.set(camera.id, pose ?? camera.base);
  }
  if (!poses.size) return { project, changed };
  const copy = structuredClone(project);
  for (const camera of sceneOf(copy, sceneId).cameras ?? []) {
    const pose = poses.get(camera.id);
    if (!pose) continue;
    changed.push(camera.name);
    if ('actorId' in camera.body && camera.body.actorId === actorId) { camera.base = { ...cleanShot(pose) }; camera.body = { kind: 'static' }; }
    if (camera.aim.kind === 'actor' && camera.aim.actorId === actorId) { camera.base = { ...camera.base, target: [...pose.target] }; camera.aim = { kind: 'fixed' }; }
    if (camera.aim.kind === 'group' && camera.aim.actorIds.includes(actorId)) {
      const rest = camera.aim.actorIds.filter(id => id !== actorId);
      if (rest.length) camera.aim = { ...camera.aim, actorIds: rest };
      else { camera.base = { ...camera.base, target: [...pose.target] }; camera.aim = { kind: 'fixed' }; }
    }
    if (camera.base.position.every((v, i) => v === camera.base.target[i])) camera.base = { ...camera.base, target: [camera.base.target[0], camera.base.target[1], camera.base.target[2] - 1] };
  }
  return { project: copy, changed };
}

/** Copia las cámaras de una escena duplicada con ids nuevos; devuelve el mapa viejo → nuevo para remapear cues. */
export function copySceneCameras(scene: StudioScene, remapActor: (id: string) => string, uid: () => string): Map<string, string> {
  const ids = new Map((scene.cameras ?? []).map(c => [c.id, uid()]));
  for (const camera of scene.cameras ?? []) {
    camera.id = ids.get(camera.id)!;
    delete camera.origin;
    if ('actorId' in camera.body) camera.body = { ...camera.body, actorId: remapActor(camera.body.actorId) } as CameraBody;
    if (camera.aim.kind === 'actor') camera.aim = { ...camera.aim, actorId: remapActor(camera.aim.actorId) };
    if (camera.aim.kind === 'group') camera.aim = { ...camera.aim, actorIds: camera.aim.actorIds.map(remapActor) };
  }
  return ids;
}
export const remapCueCamera = (cue: Cue, ids: ReadonlyMap<string, string>) => {
  if ((cue.kind === 'cameraSwitch' || cue.kind === 'cameraMove') && ids.has(cue.cameraId)) cue.cameraId = ids.get(cue.cameraId)!;
  if (cue.kind === 'cameraSwitch') delete cue.origin;
};

/** Desplaza las coordenadas absolutas de las cámaras (moveSceneToZone). Los desplazamientos relativos no cambian. */
export function shiftCameras(scene: StudioScene, shift: (v: Vec3) => Vec3) {
  for (const camera of scene.cameras ?? []) {
    camera.base = { ...camera.base, position: shift(camera.base.position), target: shift(camera.base.target) };
    if (camera.body.kind === 'path') camera.body = { ...camera.body, points: camera.body.points.map(shift) };
    if (camera.aim.kind === 'point') camera.aim = { ...camera.aim, point: shift(camera.aim.point) };
  }
}
