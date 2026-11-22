import type { Actor, Cue, Vec3 } from './model.ts';
import { routePoint } from './path.ts';
import { carryRiders } from './mount.ts';

export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as unknown as Vec3;

/**
 * Posición y rumbo que un cue de actor deja en `actors` cuando ha transcurrido la fracción `t` (0–1).
 * Única fuente de esta matemática: la usan el director (snapshot) y las cámaras (actores en cualquier instante).
 * Modifica `actors` en sitio, como hacía el director.
 */
export function applyActorMotion(actors: Actor[], cue: Extract<Cue, { kind: 'actor' }>, t: number) {
  const actor = actors.find(a => a.id === cue.actorId)!;
  // Jinete montado: su propio cue cambia su desfase sobre la silla; los cues de su montura lo llevan después (mount.ts).
  const before = { position: actor.position, rotation: actor.rotation };
  moveActor(actors, actor, cue, t);
  carryRiders(actors, actor.id, before);
}

function moveActor(actors: Actor[], actor: Actor, cue: Extract<Cue, { kind: 'actor' }>, t: number) {
  if (cue.path?.length) {
    // Camino: pasa por sus puntos (y termina en el destino, si lo hay) mirando hacia donde anda.
    const route = routePoint(actor.position, cue.destination ? [...cue.path, cue.destination] : cue.path, t);
    actor.position = route.position;
    if (route.heading !== null && cue.rotation === undefined && !cue.lookAt) actor.rotation += Math.atan2(Math.sin(route.heading - actor.rotation), Math.cos(route.heading - actor.rotation)) * Math.min(1, t * 12);
  } else if (cue.destination) actor.position = mix(actor.position, cue.destination, t);
  if (cue.rotation !== undefined) actor.rotation += Math.atan2(Math.sin(cue.rotation - actor.rotation), Math.cos(cue.rotation - actor.rotation)) * t;
  if (cue.lookAt) {
    const other = actors.find(a => a.id === cue.lookAt)!;
    const facing = Math.atan2(other.position[0] - actor.position[0], other.position[2] - actor.position[2]);
    actor.rotation += Math.atan2(Math.sin(facing - actor.rotation), Math.cos(facing - actor.rotation)) * t;
  }
}

/** Actores al cabo de `localTime` segundos de un momento, desde `start` (no se modifica). `sorted` = cues por byStart. */
export function actorsAfter(start: readonly Actor[], sorted: readonly Cue[], localTime: number): Actor[] {
  const actors = structuredClone(start) as Actor[];
  for (const cue of sorted) {
    if (cue.at > localTime || cue.kind !== 'actor') continue;
    applyActorMotion(actors, cue, Math.min(1, (localTime - cue.at) / cue.duration));
  }
  return actors;
}
