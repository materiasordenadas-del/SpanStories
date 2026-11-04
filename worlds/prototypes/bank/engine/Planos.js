import * as T from './three.js';
import { lienzo } from './Kit.js';
import { luz } from './Luz25D.js';

/* Planos ilustrados (carteles, pantallas, vinilos).  Lejos o planos → 2D
   (ESTILO.md §1): MeshBasic sin relighting, teñido por el ambiente; las
   pantallas son emisivas y no se tiñen.  `redibujar` repinta el canvas
   (pantalla de turnos, kiosco, reloj). */

export function plano(ctx, ancho, alto, px, dibujar, {
  x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, tipo = 'cartel', emisivo = false, alfa = false, doble = false,
  nombre = null, padre = null, orden = 0,
} = {}) {
  const tex = lienzo(px, Math.max(8, Math.round(px * alto / ancho)), dibujar);
  const material = new T.MeshBasicMaterial({ map: tex, transparent: alfa, alphaTest: alfa ? .02 : 0, side: doble ? T.DoubleSide : T.FrontSide,
    depthWrite: !alfa, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.userData.sinTrazo = true;
  if (!emisivo) luz.tintar(material, tipo);
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, alto), material);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz, 'YXZ');
  if (orden) mesh.renderOrder = orden;
  if (nombre) { mesh.userData.nombre = nombre; ctx.pulsables.push(mesh); }
  mesh.userData.redibujar = fn => {
    const c = tex.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); fn(g, c.width, c.height); tex.needsUpdate = true;
  };
  (padre || ctx.grupo).add(mesh);
  return mesh;
}

/** Vinilo en el suelo (y un pelo por encima). */
export function vinilo(ctx, ancho, fondo, px, dibujar, { x, z, ry = 0, y = .006, nombre = null, tipo = 'cartel' }) {
  return plano(ctx, ancho, fondo, px, dibujar, { x, y, z, rx: -Math.PI / 2, ry, alfa: true, nombre, tipo, orden: 1 });
}
