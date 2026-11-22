// Alinear y distribuir (funciones puras sobre cajas). Reciben [{id, caja:Box3}] y devuelven [{id, delta:[dx,dy,dz]}].
import * as T from '../../engine/three.js';

const EJES = { x: 'x', y: 'y', z: 'z' };
const ancla = (caja, eje, donde) => donde === 'min' ? caja.min[eje] : donde === 'max' ? caja.max[eje] : (caja.min[eje] + caja.max[eje]) / 2;

/** Alinea las cajas en un eje: «min», «centro» o «max» respecto al conjunto. */
export function alinear(items, eje, donde = 'centro') {
  if (!EJES[eje]) throw new Error('Eje inválido: ' + eje);
  if (items.length < 2) return [];
  const todo = new T.Box3(); for (const i of items) todo.union(i.caja);
  const objetivo = ancla(todo, eje, donde);
  return items.map(i => { const d = [0, 0, 0]; d['xyz'.indexOf(eje)] = objetivo - ancla(i.caja, eje, donde); return { id: i.id, delta: d }; }).filter(r => r.delta.some(v => Math.abs(v) > 1e-9));
}

/** Reparte los objetos con huecos iguales entre ellos en un eje (los dos extremos no se mueven). */
export function distribuir(items, eje) {
  if (!EJES[eje]) throw new Error('Eje inválido: ' + eje);
  if (items.length < 3) return [];
  const orden = [...items].sort((a, b) => ancla(a.caja, eje, 'centro') - ancla(b.caja, eje, 'centro'));
  const primero = orden[0].caja, ultimo = orden.at(-1).caja;
  const espacioTotal = ultimo.max[eje] - primero.min[eje], suma = orden.reduce((s, i) => s + (i.caja.max[eje] - i.caja.min[eje]), 0), hueco = (espacioTotal - suma) / (orden.length - 1);
  let cursor = primero.max[eje] + hueco; const salida = [];
  for (const i of orden.slice(1, -1)) { const ancho = i.caja.max[eje] - i.caja.min[eje], d = [0, 0, 0]; d['xyz'.indexOf(eje)] = cursor - i.caja.min[eje]; cursor += ancho + hueco; if (Math.abs(d['xyz'.indexOf(eje)]) > 1e-9) salida.push({ id: i.id, delta: d }); }
  return salida;
}
