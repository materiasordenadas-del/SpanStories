import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
export function crearPiso({ ancho = 20, fondo = 20, color = '#d9d2c3' } = {}) {
  if (![ancho, fondo].every(v => Number.isFinite(v) && v > 0)) throw new Error('Dimensiones de piso inválidas');
  return new T.Mesh(new T.PlaneGeometry(ancho, fondo).rotateX(-Math.PI / 2), crearMaterialToon({ color }));
}

