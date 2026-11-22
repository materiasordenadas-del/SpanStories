import { CAMERA_EASINGS, type CameraEasing } from './motion-easing.ts';
import type { Shot, Vec3 } from './model.ts';

/**
 * Cámaras con nombre del Estudio (plan de cámaras v2).
 * - Una cámara se trata como un actor: tiene un único controlador de posición (`body`), uno de orientación
 *   (`aim`) y su propia pista de movimientos (`cameraMove`). El Switcher (`cameraSwitch`) solo elige cuál se ve.
 * - El cue antiguo `{kind:'camera', shot}` sigue siendo válido y conserva su semántica exacta.
 * - Todo es determinista: la pose en un instante sale de los datos de autor y de la ruta.
 */
export type CameraBody =
  | { kind: 'static' }
  /** Sigue a un actor; `space:'actor'` gira con él (plano lateral o de espalda). `smoothing` en segundos (0–3). */
  | { kind: 'follow'; actorId: string; offset: Vec3; space: 'world' | 'actor'; smoothing: number }
  /** Recorre puntos (Catmull-Rom, como las caminatas). El progreso lo mueven los cues `cameraMove`. */
  | { kind: 'path'; points: Vec3[]; easing?: CameraEasing }
  /** Gira alrededor de un actor entre dos ángulos (radianes). El progreso lo mueven los cues `cameraMove`. */
  | { kind: 'orbit'; actorId: string; radius: number; height: number; fromAngle: number; toAngle: number };

export type CameraAim =
  /** La dirección de la pose de reposo. */
  | { kind: 'fixed' }
  | { kind: 'actor'; actorId: string; offset: Vec3; smoothing: number }
  /** Centro de varios actores (a la altura del pecho). */
  | { kind: 'group'; actorIds: string[]; smoothing: number }
  /** Coordenada guardada; `entryId` = objeto léxico del que se tomó (checks.ts avisa si ya no está). */
  | { kind: 'point'; point: Vec3; entryId?: string };

/** Huella de lo generado automáticamente: permite regenerar sin pisar lo editado a mano (fase 3). */
export type AutoOrigin = { generator: 'auto-director@1' | 'auto-stage@1'; batchId: string; slot: string; fingerprint: string };

export type CameraRig = {
  id: string; name: string;
  /** Pose de reposo: la usan `static` y `fixed`, y es la reserva si algo falla. */
  base: Shot;
  body: CameraBody;
  aim: CameraAim;
  lens?: { fov: number };
  /** Esta cámara solo entra con corte (una mezcla hacia ella se convierte en corte). */
  cutOnly?: boolean;
  origin?: AutoOrigin;
};

export type CameraTransition = { kind: 'cut' } | { kind: 'blend'; duration: number; easing?: CameraEasing; route: 'linear' | 'arc' };
export type CameraSwitchFields = { kind: 'cameraSwitch'; cameraId: string; label: string; transition: CameraTransition; origin?: AutoOrigin };
export type CameraMoveFields = { kind: 'cameraMove'; cameraId: string; from: number; to: number; easing?: CameraEasing };

export const DIRECTOR_PACES = ['tranquilo', 'normal', 'dinamico'] as const;
export type DirectorPace = typeof DIRECTOR_PACES[number];
/** Estado del director automático por escena: huecos que el usuario borró a propósito y preferencias. */
export type AutoDirection = { suppressed: string[]; pace?: DirectorPace; jlOffset?: number };

/** Avisos del motor calculados en edición (oclusión, paredes, cámara dentro de volúmenes…), con su clave de obsolescencia. */
export type CameraAuditWarning = { code: 'wall' | 'inside' | 'near-clip' | 'occluded' | 'offscreen'; message: string; cameraId?: string; sequenceId?: string; cueId?: string };
export type CameraAudit = { key: string; at: string; warnings: CameraAuditWarning[] };

export const MAX_CAMERAS = 64;
export const MAX_BLEND = 30;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 180;
const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000);
const num = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const easing = (v: unknown) => v === undefined || CAMERA_EASINGS.includes(v as CameraEasing);
export const isShot = (v: unknown): v is Shot => obj(v) && isVec(v.position) && isVec(v.target) && (v.position as Vec3).some((n, i) => n !== (v.target as Vec3)[i]) && num(v.fov, 10, 100) && num(v.transition, 0, 30) && easing(v.easing);

export function originProblem(v: unknown): string | null {
  if (v === undefined) return null;
  if (!obj(v) || !['auto-director@1', 'auto-stage@1'].includes(v.generator as string) || !isId(v.batchId) || !isId(v.slot) || typeof v.fingerprint !== 'string' || !/^[a-z0-9]{1,64}$/.test(v.fingerprint)) return 'Origen automático inválido.';
  return null;
}

/** Valida las cámaras de una escena. `actors` son los ids de actores de ESA escena. */
export function camerasProblem(cameras: unknown, actors: ReadonlySet<string>): string | null {
  if (cameras === undefined) return null;
  if (!Array.isArray(cameras) || cameras.length > MAX_CAMERAS) return `Una escena admite hasta ${MAX_CAMERAS} cámaras.`;
  const ids = new Set<string>();
  for (const c of cameras) {
    if (!obj(c) || !isId(c.id) || ids.has(c.id) || !isId(c.name) || !isShot(c.base)) return 'Cámara inválida.';
    ids.add(c.id);
    const b = c.body, a = c.aim;
    if (!obj(b) || !obj(a)) return 'Cámara sin controladores.';
    switch (b.kind) {
      case 'static': break;
      case 'follow': if (!actors.has(b.actorId as string) || !isVec(b.offset) || !['world', 'actor'].includes(b.space as string) || !num(b.smoothing, 0, 3)) return 'Seguimiento de cámara inválido.'; break;
      case 'path': if (!Array.isArray(b.points) || b.points.length < 1 || b.points.length > 64 || !b.points.every(isVec) || !easing(b.easing)) return 'Camino de cámara inválido.'; break;
      case 'orbit': if (!actors.has(b.actorId as string) || !(num(b.radius, 0, 200) && (b.radius as number) > 0) || !num(b.height, -100, 100) || !num(b.fromAngle, -1000, 1000) || !num(b.toAngle, -1000, 1000)) return 'Órbita de cámara inválida.'; break;
      default: return 'Movimiento de cámara desconocido.';
    }
    switch (a.kind) {
      case 'fixed': break;
      case 'actor': if (!actors.has(a.actorId as string) || !isVec(a.offset) || !num(a.smoothing, 0, 3)) return 'Objetivo de cámara inválido.'; break;
      case 'group': if (!Array.isArray(a.actorIds) || !a.actorIds.length || a.actorIds.length > 20 || new Set(a.actorIds).size !== a.actorIds.length || !a.actorIds.every(id => actors.has(id as string)) || !num(a.smoothing, 0, 3)) return 'Grupo de cámara inválido.'; break;
      case 'point': if (!isVec(a.point) || (a.entryId !== undefined && !isId(a.entryId))) return 'Punto de cámara inválido.'; break;
      default: return 'Orientación de cámara desconocida.';
    }
    if (c.lens !== undefined && (!obj(c.lens) || !num(c.lens.fov, 10, 100))) return 'Lente de cámara inválida.';
    if (c.cutOnly !== undefined && typeof c.cutOnly !== 'boolean') return 'Opción de corte inválida.';
    const o = originProblem(c.origin); if (o) return o;
  }
  return null;
}

export function transitionProblem(v: unknown): string | null {
  if (!obj(v)) return 'Transición de cámara inválida.';
  if (v.kind === 'cut') return null;
  if (v.kind === 'blend' && num(v.duration, .05, MAX_BLEND) && easing(v.easing) && ['linear', 'arc'].includes(v.route as string)) return null;
  return 'Transición de cámara inválida.';
}

export function autoDirectionProblem(v: unknown): string | null {
  if (v === undefined) return null;
  if (!obj(v) || !Array.isArray(v.suppressed) || v.suppressed.length > 5000 || !v.suppressed.every(isId) || (v.pace !== undefined && !(DIRECTOR_PACES as readonly string[]).includes(v.pace as string)) || (v.jlOffset !== undefined && !num(v.jlOffset, -.5, .5))) return 'Dirección automática inválida.';
  return null;
}

export function cameraAuditProblem(v: unknown): string | null {
  if (v === undefined) return null;
  if (!obj(v) || typeof v.key !== 'string' || v.key.length > 200 || typeof v.at !== 'string' || !Array.isArray(v.warnings) || v.warnings.length > 500) return 'Revisión de cámaras inválida.';
  for (const w of v.warnings) if (!obj(w) || !['wall', 'inside', 'near-clip', 'occluded', 'offscreen'].includes(w.code as string) || typeof w.message !== 'string' || w.message.length > 300) return 'Revisión de cámaras inválida.';
  return null;
}

/** Hash estable corto (FNV-1a, 32 bits) en base 36. */
export function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/**
 * Clave de obsolescencia de la revisión de cámaras del motor: cambia si cambian el escenario, su revisión, los
 * actores, las cámaras o cualquier cue que mueva actores o cámaras. Igual que `configKey` de la vida ambiental.
 */
export function cameraAuditKey(scene: { zoneId: string; worldVersion?: unknown; actors: unknown; cameras?: unknown; sequences: readonly { id: string; cues: readonly { kind: string }[] }[] }): string {
  const cues = scene.sequences.map(s => [s.id, s.cues.filter(c => c.kind !== 'dialogue' && c.kind !== 'sound')]);
  return stableHash(JSON.stringify([scene.zoneId, scene.worldVersion ?? null, scene.actors, scene.cameras ?? [], cues]));
}
