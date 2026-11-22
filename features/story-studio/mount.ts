import type { Actor, Vec3 } from './model.ts';

/**
 * Jinete ↔ montura. El vínculo vive en el jinete (`Actor.montura.caballoId`) y es la única fuente de verdad:
 * ni el Estudio ni el Taller deducen la pareja por el nombre del personaje cuando el vínculo existe.
 * Anclaje por la pelvis (docs/architecture/ADR-montura-jinete-anclaje-pelvis.md): el caballo manda el marco de la
 * silla y el jinete conserva su desfase en coordenadas locales del caballo. El jinete sigue siendo libre: moverlo,
 * girarlo o sus propios cues cambian ese desfase (sin soltar el vínculo), y sus articulaciones las edita el Taller.
 */
export type Mount = { caballoId: string };

/** Problema del vínculo de un actor, o null. `actors` = todos los actores de la escena. */
export function mountProblem(actor: Pick<Actor, 'id' | 'montura'>, actors: readonly Pick<Actor, 'id' | 'montura'>[]): string | null {
  const m = actor.montura;
  if (m === undefined) return null;
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.caballoId !== 'string' || Object.keys(m).some(k => k !== 'caballoId')) return 'Montura inválida.';
  if (m.caballoId === actor.id) return 'Un personaje no puede montarse a sí mismo.';
  const horse = actors.find(a => a.id === m.caballoId);
  if (!horse) return 'La montura no está en la escena.';
  if (horse.montura) return 'Una montura no puede ir montada en otro personaje.';
  if (actors.some(a => a.id !== actor.id && a.montura?.caballoId === m.caballoId)) return 'La montura ya lleva otro jinete.';
  return null;
}

export const riderOf = (actors: readonly Actor[], horseId: string) => actors.find(a => a.montura?.caballoId === horseId);
export const isRider = (actor: Actor | undefined) => !!actor?.montura;

const rotY = (v: readonly [number, number], angle: number): [number, number] => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c];
};

/**
 * Lleva a los jinetes de `horse` con él: `before` es la pose del caballo antes de moverse y `horse` la de después.
 * La convención de rumbo es la del motor: rotation = atan2(x, z). Modifica `actors` en sitio.
 */
export function carryRiders(actors: Actor[], horseId: string, before: { position: Vec3; rotation: number }) {
  const horse = actors.find(a => a.id === horseId);
  if (!horse) return;
  const turn = horse.rotation - before.rotation;
  for (const rider of actors) {
    if (rider.montura?.caballoId !== horseId) continue;
    const local = rotY([rider.position[0] - before.position[0], rider.position[2] - before.position[2]], -before.rotation);
    const world = rotY(local, horse.rotation);
    rider.position = [horse.position[0] + world[0], rider.position[1] + horse.position[1] - before.position[1], horse.position[2] + world[1]];
    rider.rotation += turn;
  }
}

/** Edición en el Estudio: mueve (o gira) un actor y, si es una montura, su jinete va con él. */
export function placeActor(actors: Actor[], actorId: string, change: { position?: Vec3; rotation?: number }) {
  const actor = actors.find(a => a.id === actorId);
  if (!actor) return;
  const before = { position: [...actor.position] as unknown as Vec3, rotation: actor.rotation };
  if (change.position) actor.position = [...change.position] as unknown as Vec3;
  if (change.rotation !== undefined) actor.rotation = change.rotation;
  carryRiders(actors, actorId, before);
}

/** Quita los vínculos que apuntan a un actor que ya no está (al borrarlo de la escena). */
export function dropMountsTo(actors: Actor[], horseId: string) {
  for (const a of actors) if (a.montura?.caballoId === horseId) delete a.montura;
}
