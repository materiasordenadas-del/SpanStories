// Colocación por restricciones: se piensa en bordes (minX/maxX/minY/maxY/minZ/maxZ),
// no en position. Todo en mundo, 1 u = 1 m. Copiar a engine/ del proyecto.
import * as T from './three.js';

const _b = new T.Box3();
export const box = o => { o.updateWorldMatrix(true, true); return new T.Box3().setFromObject(o); };
const edge = (b, k) => b[k.slice(0, 3)][k[3].toLowerCase()]; // 'maxZ' -> b.max.z

// Mueve o para que sus bordes valgan lo pedido: place(muro, { minX: 3.2, maxZ: 5 }).
// Centro por eje: { cx, cy, cz }.
export function place(o, target) {
  const b = box(o), d = new T.Vector3();
  for (const [k, v] of Object.entries(target)) {
    if (k[0] === 'c') { const a = k[1]; d[a] = v - (b.min[a] + b.max[a]) / 2; }
    else d[k[3].toLowerCase()] = v - edge(b, k);
  }
  o.position.add(o.parent ? d.applyMatrix3(new T.Matrix3().setFromMatrix4(o.parent.matrixWorld).invert()) : d);
  return o;
}

// Mismo borde que ref: align(muro, pilar, 'maxZ') = frente al ras del pilar.
export const align = (o, ref, k, off = 0) => place(o, { [k]: edge(box(ref), k) + off });

// o empieza donde termina ref: after(muro, pilar, 'x') => muro.minX = pilar.maxX + gap.
export function after(o, ref, axis, gap = 0) {
  const A = axis.toUpperCase();
  return place(o, { ['min' + A]: edge(box(ref), 'max' + A) + gap });
}

// Apoya o sobre una superficie (número o objeto): nada flota ni se entierra.
export const ground = (o, surface = 0, sink = 0) =>
  place(o, { minY: (typeof surface === 'number' ? surface : edge(box(surface), 'maxY')) - sink });

// Simetría real: clon espejado respecto al plano x = axisX. Three corrige el winding solo.
export function mirrorX(o, axisX = 0) {
  const m = o.clone(true);
  m.position.x = 2 * axisX - o.position.x;
  m.scale.x *= -1;
  m.rotation.y *= -1; m.rotation.z *= -1;
  m.name = (o.name || 'obj') + '_mirror';
  return m;
}

export const snap = (v, step = 0.05) => Math.round(v / step) * step;

// Para tests: aproximadamente igual (5 mm).
export const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;
export { edge };
