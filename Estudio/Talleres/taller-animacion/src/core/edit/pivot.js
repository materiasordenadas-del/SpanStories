// Pivote temporal relativo (reimplementación de «Relative Cursor Pivot» del add-on Herramientas, MIT).
// Un punto alrededor del cual se giran los huesos elegidos. Puede ir pegado a un hueso (relativo): en cada
// fotograma está donde ese hueso lo lleva, como el cursor relativo del add-on (p. ej. girar todo el cuerpo
// sobre la punta del pie de apoyo, o la mano alrededor de la muñeca de la otra).
import * as THREE from 'three';
import { keyWorld } from './matrix.js';

/** Posición de mundo del pivote en el fotograma ya evaluado. pivot: { pos: [x,y,z] } o { bone, local: [x,y,z] }. */
export function pivotWorld(rig, pivot, out = new THREE.Vector3()) {
  if (pivot.bone) {
    const b = rig.byName.get(pivot.bone);
    if (b) {
      b.updateWorldMatrix(true, false);
      return out.fromArray(pivot.local).applyMatrix4(b.matrixWorld);
    }
  }
  return out.fromArray(pivot.pos || [0, 0, 0]);
}

/** Crea un pivote en `world`; si `bone` se da, queda pegado a él. */
export function makePivot(rig, world, bone = null) {
  if (bone) {
    bone.updateWorldMatrix(true, false);
    const local = bone.worldToLocal(world.clone());
    return { bone: bone.name, local: local.toArray() };
  }
  return { pos: world.toArray() };
}

/** Matrices de mundo de partida de los huesos a girar (en el fotograma evaluado). */
export function captureTargets(bones) {
  return bones.map((b) => {
    b.updateWorldMatrix(true, false);
    return { bone: b, M: b.matrixWorld.clone() };
  });
}

/** Gira los huesos (desde sus matrices de partida) el giro R alrededor del punto P, con clave en f. */
export function rotateAroundPivot(engine, f, targets, P, R) {
  const T = new THREE.Matrix4().makeTranslation(P.x, P.y, P.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(R)).multiply(new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z));
  const items = targets.map((t) => {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    T.clone().multiply(t.M).decompose(p, q, s);
    return { bone: t.bone, p, q };
  });
  return keyWorld(engine, f, items);
}
