/**
 * Vida en reposo de un personaje de la historia (LifeCharacter del Taller facial).
 * Mientras el personaje está quieto (sin actuación horneada ni caminata), el motor lo mantiene vivo: respira,
 * parpadea, mira, cambia el peso y hace gestos pequeños según su ánimo y su energía.
 *
 * · `Actor.vida`: ajuste base del personaje en toda la escena.
 * · `cue.vida` (acción de personaje): cambio desde ese momento (ánimo, energía, a quién mira). Persiste en los
 *   momentos siguientes, como `expression`, hasta otro cambio.
 * El motor valida lo mismo en `Estudio/Talleres/taller-animacion/facial/VidaEnEscena.mjs` (validarVida).
 */
import type { Vec3 } from './model.ts';

export const LIFE_MOODS = ['tranquila', 'contenta', 'nerviosa', 'triste', 'cansada', 'atenta'] as const;
export type LifeMood = typeof LIFE_MOODS[number];
export const LIFE_GAZE = ['camara', 'deambular', 'actor', 'punto'] as const;
export type LifeGaze = typeof LIFE_GAZE[number];
export const LIFE_PARTS = ['respiracion', 'parpadeo', 'mirada', 'cabeza', 'postura', 'peso', 'gestos', 'cara', 'pelo'] as const;
export type LifePart = typeof LIFE_PARTS[number];
export type LifeGazeTarget = { modo: LifeGaze; actorId?: string; punto?: Vec3 };
export type ActorLife = { activa: boolean; animo: LifeMood; energia: number; intensidad: number; mirada: LifeGazeTarget; activo: Record<LifePart, boolean> };
export type ActorLifeOverride = { animo?: LifeMood; energia?: number; mirada?: LifeGazeTarget };

export const LIFE_MOOD_LABELS: Record<LifeMood, string> = { tranquila: 'Tranquila', contenta: 'Contenta', nerviosa: 'Nerviosa', triste: 'Triste', cansada: 'Cansada', atenta: 'Atenta' };
export const LIFE_GAZE_LABELS: Record<LifeGaze, string> = { camara: 'a la cámara', deambular: 'deambula', actor: 'a otro personaje', punto: 'a un punto' };

export const defaultActorLife = (): ActorLife => ({
  activa: true, animo: 'tranquila', energia: .5, intensidad: 1, mirada: { modo: 'deambular' },
  activo: { respiracion: true, parpadeo: true, mirada: true, cabeza: true, postura: true, peso: true, gestos: true, cara: true, pelo: true },
});

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => num(n, -100000, 100000));
const idText = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 180;

function gazeProblem(m: unknown, actors?: ReadonlySet<string>): string | null {
  if (!obj(m) || !(LIFE_GAZE as readonly string[]).includes(m.modo as string)) return 'Mirada de la vida en reposo inválida.';
  if (m.modo === 'actor' && (!idText(m.actorId) || (actors && !actors.has(m.actorId as string)))) return 'La vida en reposo mira a un personaje que no está en la escena.';
  if (m.modo === 'punto' && !vec(m.punto)) return 'La vida en reposo mira a un punto sin coordenadas.';
  if (Object.keys(m).some(k => !['modo', 'actorId', 'punto'].includes(k))) return 'Mirada de la vida en reposo con campos desconocidos.';
  return null;
}

/** Problema de un ajuste base (null = válido). `actors`: personajes de la escena, para «mirar a…». */
export function actorLifeProblem(v: unknown, actors?: ReadonlySet<string>): string | null {
  if (!obj(v)) return 'Vida en reposo inválida.';
  if (Object.keys(v).some(k => !['activa', 'animo', 'energia', 'intensidad', 'mirada', 'activo'].includes(k))) return 'Vida en reposo con campos desconocidos.';
  if (typeof v.activa !== 'boolean' || !(LIFE_MOODS as readonly string[]).includes(v.animo as string) || !num(v.energia, 0, 1) || !num(v.intensidad, 0, 1.5)) return 'Ánimo, energía o intensidad de la vida en reposo inválidos.';
  if (!obj(v.activo) || Object.keys(v.activo).length !== LIFE_PARTS.length || !LIFE_PARTS.every(k => typeof (v.activo as Record<string, unknown>)[k] === 'boolean')) return 'Partes de la vida en reposo inválidas.';
  return gazeProblem(v.mirada, actors);
}

/** Problema de un cambio por momento (null = válido). Al menos un campo. */
export function actorLifeOverrideProblem(v: unknown, actors?: ReadonlySet<string>): string | null {
  if (!obj(v) || !Object.keys(v).length) return 'Cambio de vida en reposo vacío.';
  if (Object.keys(v).some(k => !['animo', 'energia', 'mirada'].includes(k))) return 'Cambio de vida en reposo con campos desconocidos.';
  if (v.animo !== undefined && !(LIFE_MOODS as readonly string[]).includes(v.animo as string)) return 'Ánimo desconocido.';
  if (v.energia !== undefined && !num(v.energia, 0, 1)) return 'Energía fuera de 0–1.';
  return v.mirada === undefined ? null : gazeProblem(v.mirada, actors);
}

export function validateActorLife(v: unknown, actors?: ReadonlySet<string>): ActorLife {
  const problem = actorLifeProblem(v, actors); if (problem) throw new Error(problem);
  return structuredClone(v) as ActorLife;
}
export function validateActorLifeOverride(v: unknown, actors?: ReadonlySet<string>): ActorLifeOverride {
  const problem = actorLifeOverrideProblem(v, actors); if (problem) throw new Error(problem);
  return structuredClone(v) as ActorLifeOverride;
}

/** Base + cambio: lo que el motor aplica desde ese momento. Sin base, el cambio parte de los valores por defecto. */
export function mergeActorLife(base: ActorLife | undefined, change: ActorLifeOverride): ActorLife {
  const out = structuredClone(base ?? defaultActorLife());
  if (change.animo) out.animo = change.animo;
  if (change.energia !== undefined) out.energia = change.energia;
  if (change.mirada) out.mirada = structuredClone(change.mirada);
  return out;
}

/** Resumen corto para el panel del Estudio. */
export function describeActorLife(v: ActorLife | undefined, names: (id: string) => string | undefined = () => undefined): string {
  if (!v) return 'Sin vida en reposo: quieto, el personaje se queda congelado.';
  if (!v.activa) return 'Vida en reposo apagada.';
  const gaze = v.mirada.modo === 'actor' ? `mira a ${names(v.mirada.actorId ?? '') ?? 'otro personaje'}` : `mira ${LIFE_GAZE_LABELS[v.mirada.modo]}`;
  return `${LIFE_MOOD_LABELS[v.animo]} · energía ${Math.round(v.energia * 100)} % · ${gaze}`;
}
