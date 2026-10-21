import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
import { FLOOR } from '../routes.js';
export function crearPiso({ ancho = FLOOR.width, fondo = FLOOR.depth, color = '#d9d2c3' } = {}) {
  if (![ancho, fondo].every(v => Number.isFinite(v) && v > 0)) throw new Error('Dimensiones de piso inválidas');
  const piso = new T.Mesh(new T.PlaneGeometry(ancho, fondo).rotateX(-Math.PI / 2), crearMaterialToon({ color }));
  piso.name = 'piso';
  return piso;
}

