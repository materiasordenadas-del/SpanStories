import * as T from '../engine/three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from '../engine/Luz25D.js';
import { volumenRedondeado } from './Formas.js';

export function crearSilla({ ancho = 0.5, fondo = 0.5, alto = 0.9, asiento = 0.45, color = '#e0a458' } = {}) {
  if (![ancho, fondo, alto, asiento].every(v => Number.isFinite(v) && v > 0) || asiento >= alto)
    throw new Error('Dimensiones de silla inválidas');
  const root = new T.Group(), material = crearMaterialToon({ color, bandas: 3 });
  const grosor = Math.min(ancho, fondo, asiento) * 0.12;
  const pieza = (name, w, h, d, x, y, z) => {
    const mesh = new T.Mesh(name==='asiento'||name==='respaldo'?volumenRedondeado(w,h,d,.035):new T.BoxGeometry(w,h,d), material);
    mesh.name = name; mesh.position.set(x, y, z);
    contornoDe(mesh, crearMaterialContorno(color, 'medio')); root.add(mesh);
  };
  pieza('asiento', ancho, grosor, fondo, 0, asiento, 0);
  const altoPata = asiento - grosor / 2;
  let i = 0;
  for (const x of [-1, 1]) for (const z of [-1, 1])
    pieza('pata-' + (++i), grosor, altoPata, grosor, x * (ancho - grosor) / 2, altoPata / 2, z * (fondo - grosor) / 2);
  const respaldo = alto - asiento - grosor / 2;
  pieza('respaldo', ancho, respaldo, grosor, 0, asiento + grosor / 2 + respaldo / 2, -(fondo - grosor) / 2);
  return root;
}

