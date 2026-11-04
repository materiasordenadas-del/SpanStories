// Reglas de la planta del hostal: todo se DERIVA de dimensions.js (sin three.js: se prueba en node).
// Rectángulos como { x0, z0, x1, z1 } con x0 < x1 y z0 < z1.
import { HOUSE as H, COLONNADE as K, FRONT as F, STREET as S, POOL as P, STAIR as E, DOOR, BUNK as B, TEJADILLO as TJ } from './dimensions.js';

export const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const ancho = r => r.x1 - r.x0, fondo = r => r.z1 - r.z0;
export const centro = r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
export const dentro = (r, x, z, m = 0) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m;
export const solapan = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Resta huecos rectangulares a un rectángulo: celdas de la rejilla de cortes, fusionadas por filas. */
export function restar(base, huecos) {
  const xs = [...new Set([base.x0, base.x1, ...huecos.flatMap(h => [h.x0, h.x1])])].filter(x => x >= base.x0 && x <= base.x1).sort((a, b) => a - b);
  const zs = [...new Set([base.z0, base.z1, ...huecos.flatMap(h => [h.z0, h.z1])])].filter(z => z >= base.z0 && z <= base.z1).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2, libre = !huecos.some(h => dentro(h, cx, cz));
      if (libre) { if (run) run.x1 = xs[i + 1]; else run = rect(xs[i], zs[j], xs[i + 1], zs[j + 1]); }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}

// ── Caras de los muros ─────────────────────────────────────────────────────
const e = H.wall.ext, g = H.wall.gallery / 2, t = H.wall.int / 2;
export const CARAS = {
  xIn: H.width / 2 - e, zFrontIn: -e, zRearIn: -H.depth + e,
  front: [H.frontWallZ + g, H.frontWallZ - g], rear: [H.rearWallZ + g, H.rearWallZ - g],
  side: [H.sideWallX - g, H.sideWallX + g]          // cara de la galería / cara de la crujía (lado este)
};
const X = CARAS.xIn, ZF = CARAS.zFrontIn, ZR = CARAS.zRearIn;
// Caras de los muros de galería: «calle» = hacia +z, «fondo» = hacia −z.
//   delantero (z −7): fC = −6,85 (cuartos de la crujía delantera) · fG = −7,15 (galería y crujías laterales)
//   trasero (z −21): rG = −20,85 (galería y crujías laterales) · rC = −21,15 (cuartos de la crujía trasera)
const fC = CARAS.front[0], fG = CARAS.front[1], rG = CARAS.rear[0], rC = CARAS.rear[1], sC = CARAS.side[1];

/** Huella exterior de la casa y anillo de galerías. */
export const CASA = rect(-H.width / 2, -H.depth, H.width / 2, 0);
export const INTERIOR = rect(-X, ZR, X, ZF);
export const PATIO = rect(-H.patio.x, H.patio.rear, H.patio.x, H.patio.front);
export const GALERIA = rect(-CARAS.side[0], CARAS.rear[0], CARAS.side[0], CARAS.front[1]);   // entre muros de galería

// ── Cuartos ────────────────────────────────────────────────────────────────
// planta 0 = PB, 1 = P1. `acceso` = muro y posición de su puerta (o arco) hacia la galería.
function crujiaLateral(lado, cortes, z0, z1) {
  const xs = lado < 0 ? [-X, -sC] : [sC, X];
  const lim = [z1, ...cortes, z0];   // de norte (−7) a sur (−21): cortes decrecientes
  return lim.slice(0, -1).map((a, i) => rect(xs[0], lim[i + 1] + (i + 1 < lim.length - 1 ? t : 0), xs[1], a - (i > 0 ? t : 0)));
}
export function cuartos(planta) {
  const out = [];
  const add = (id, r, extra) => out.push({ id, planta, ...r && { rect: r }, ...extra });
  const zN = fG, zS = rG;                       // las crujías laterales van de −7,15 a −20,85
  const oeste = crujiaLateral(-1, planta ? [H.west[0]] : H.west, zS, zN);
  const este = crujiaLateral(1, H.east, zS, zN);
  if (planta === 0) {
    add('sala', rect(-X, fC, -H.zaguan.half - t, ZF), { nombre: 'Sala común', tipo: 'sala' });
    add('zaguan', rect(-H.zaguan.half + t, fC, H.zaguan.half - t, ZF), { nombre: 'Zaguán', tipo: 'paso' });
    add('recepcion', rect(H.zaguan.half + t, fC, X, ZF), { nombre: 'Recepción', tipo: 'sala' });
    ['dorm1', 'dorm2', 'dorm3'].forEach((id, i) => add(id, oeste[i], { nombre: 'Dormitorio ' + (i + 1), tipo: 'habitacion' }));
    ['escalera', 'privada1', 'banos'].forEach((id, i) => add(id, este[i], { nombre: ['Escalera', 'Habitación privada 1', 'Baños compartidos'][i], tipo: i ? 'habitacion' : 'paso' }));
    add('cocina', rect(-X, ZR, H.rearPB[0] - t, rC), { nombre: 'Cocina compartida', tipo: 'sala' });
    add('comedor', rect(H.rearPB[0] + t, ZR, X, rC), { nombre: 'Comedor', tipo: 'sala' });
  } else {
    add('dorm4', rect(-X, fC, H.frontP1[0] - t, ZF), { nombre: 'Dormitorio 4', tipo: 'habitacion' });
    add('dorm5', rect(H.frontP1[0] + t, fC, X, ZF), { nombre: 'Dormitorio 5', tipo: 'habitacion' });
    ['dorm6', 'dorm7'].forEach((id, i) => add(id, oeste[i], { nombre: 'Dormitorio ' + (6 + i), tipo: 'habitacion' }));
    ['escalera', 'privada2', 'privada3'].forEach((id, i) => add(id === 'escalera' ? 'escalera-p1' : id, este[i], { nombre: ['Escalera', 'Habitación privada 2', 'Habitación privada 3'][i], tipo: i ? 'habitacion' : 'paso' }));
    const [a, b] = H.rearP1;
    add('dorm8', rect(-X, ZR, a - t, rC), { nombre: 'Dormitorio 8', tipo: 'habitacion' });
    add('banos2', rect(a + t, ZR, b - t, rC), { nombre: 'Baños compartidos', tipo: 'habitacion' });
    add('privada4', rect(b + t, ZR, X, rC), { nombre: 'Habitación privada 4', tipo: 'habitacion' });
  }
  return out;
}
export const cuarto = (id, planta = 0) => cuartos(planta).find(c => c.id === id);

// ── Vanos: puertas, arcos y portón ─────────────────────────────────────────
// muro: 'x' (muro paralelo a z, en x = eje) o 'z' (paralelo a x, en z = eje). pos = coordenada a lo largo.
// cara: signo del lado de la galería/calle (+1 = hacia +x o +z). real: la única que se recorre.
const W = DOOR.width;
export function vanos() {
  const sx = H.sideWallX, fz = H.frontWallZ, rz = H.rearWallZ, zh = H.zaguan.half;
  const v = [];
  const p = (o) => v.push({ ancho: W, alto: DOOR.height, tipo: 'puerta', planta: 0, ...o });
  // Fachada y zaguán
  p({ id: 'porton', tipo: 'porton', muro: 'z', eje: -e / 2, pos: 0, ancho: H.zaguan.door.width, alto: H.zaguan.door.height, cara: 1, etiqueta: 'Portón de entrada', voz: 'el portón' });
  p({ id: 'arco-zaguan-galeria', tipo: 'arco', muro: 'z', eje: fz, pos: 0, ancho: 2.4, alto: 3.2, cara: -1, etiqueta: 'Arco del zaguán al patio', voz: 'el arco' });
  p({ id: 'arco-zaguan-sala', tipo: 'arco', muro: 'x', eje: -zh, pos: -3.6, ancho: 1.8, alto: 2.9, cara: 1, etiqueta: 'Arco a la sala común', voz: 'el arco' });
  p({ id: 'arco-zaguan-recepcion', tipo: 'arco', muro: 'x', eje: zh, pos: -3.6, ancho: 1.8, alto: 2.9, cara: -1, etiqueta: 'Arco a la recepción', voz: 'el arco' });
  p({ id: 'arco-sala-galeria', tipo: 'arco', muro: 'z', eje: fz, pos: -3.6, ancho: 2, alto: 2.9, cara: -1, etiqueta: 'Arco de la sala a la galería', voz: 'el arco' });
  // PB oeste: dormitorios (el 1 es el único real)
  // Dormitorio 1: la puerta va junto a la esquina de su pared (marco incluido) para dejar sitio a las literas.
  p({ id: 'puerta-dorm1', muro: 'x', eje: -sx, pos: cuarto('dorm1').rect.z1 - DOOR.frame - W / 2 - .03, cara: 1, numero: '1', rotulo: 'DORMITORIO 1', sub: '8 camas · mixto', real: true, cuarto: 'dorm1', etiqueta: 'Puerta del dormitorio 1', voz: 'la puerta del dormitorio uno' });
  p({ id: 'puerta-dorm2', muro: 'x', eje: -sx, pos: -15.15, cara: 1, numero: '2', rotulo: 'DORMITORIO 2', sub: '6 camas · femenino', cuarto: 'dorm2', etiqueta: 'Puerta del dormitorio 2', voz: 'la puerta del dormitorio dos', info: 'Dormitorio 2 · femenino de 6 camas: está completo esta noche.' });
  p({ id: 'puerta-dorm3', muro: 'x', eje: -sx, pos: -19, cara: 1, numero: '3', rotulo: 'DORMITORIO 3', sub: '6 camas · mixto', cuarto: 'dorm3', etiqueta: 'Puerta del dormitorio 3', voz: 'la puerta del dormitorio tres', info: 'Dormitorio 3: ocupado. Por favor, no hagas ruido.' });
  // PB este: escalera, privada 1 y baños
  p({ id: 'arco-escalera', tipo: 'arco', muro: 'x', eje: sx, pos: -7.8, ancho: 1.1, alto: 2.6, cara: -1, etiqueta: 'Arco de la escalera', voz: 'la escalera' });
  p({ id: 'puerta-privada1', muro: 'x', eje: sx, pos: -14.5, cara: -1, numero: 'P1', rotulo: 'PRIVADA 1', sub: 'cama doble', cuarto: 'privada1', etiqueta: 'Puerta de la habitación privada 1', voz: 'la puerta de la habitación privada', info: 'Habitación privada 1: ocupada. Cama doble y baño propio.' });
  p({ id: 'puerta-banos', muro: 'x', eje: sx, pos: -18.5, cara: -1, numero: 'WC', rotulo: 'BAÑOS', sub: 'duchas · sanitarios', cuarto: 'banos', etiqueta: 'Puerta de los baños compartidos', voz: 'la puerta de los baños', info: 'Baños compartidos: duchas con agua caliente y sanitarios. Usa chanclas en la ducha.' });
  // PB trasera: cocina y comedor
  p({ id: 'puerta-cocina', muro: 'z', eje: rz, pos: -3.3, cara: 1, numero: '', rotulo: 'COCINA', sub: 'compartida', cuarto: 'cocina', abierta: true, etiqueta: 'Puerta de la cocina', voz: 'la puerta de la cocina' });
  p({ id: 'arco-comedor-1', tipo: 'arco', muro: 'z', eje: rz, pos: .6, ancho: 2, alto: 2.9, cara: 1, etiqueta: 'Arco del comedor', voz: 'el arco' });
  p({ id: 'arco-comedor-2', tipo: 'arco', muro: 'z', eje: rz, pos: 3.6, ancho: 2, alto: 2.9, cara: 1, etiqueta: 'Arco del comedor', voz: 'el arco' });
  p({ id: 'arco-cocina-comedor', tipo: 'arco', muro: 'x', eje: H.rearPB[0], pos: -23.4, ancho: 2.4, alto: 2.9, cara: 1, etiqueta: 'Arco entre la cocina y el comedor', voz: 'el arco' });
  // P1
  const q = o => p({ planta: 1, ...o });
  q({ id: 'puerta-dorm4', muro: 'z', eje: fz, pos: -3, cara: -1, numero: '4', rotulo: 'DORMITORIO 4', sub: '6 camas · mixto', etiqueta: 'Puerta del dormitorio 4', voz: 'la puerta del dormitorio cuatro', info: 'Dormitorio 4: ocupado. Tiene balcón a la calle.' });
  q({ id: 'puerta-dorm5', muro: 'z', eje: fz, pos: 3, cara: -1, numero: '5', rotulo: 'DORMITORIO 5', sub: '6 camas · mixto', etiqueta: 'Puerta del dormitorio 5', voz: 'la puerta del dormitorio cinco', info: 'Dormitorio 5: ocupado. Tiene balcón a la calle.' });
  q({ id: 'puerta-dorm6', muro: 'x', eje: -sx, pos: -10.1, cara: 1, numero: '6', rotulo: 'DORMITORIO 6', sub: '4 camas · mixto', etiqueta: 'Puerta del dormitorio 6', voz: 'la puerta del dormitorio seis', info: 'Dormitorio 6: ocupado.' });
  q({ id: 'puerta-dorm7', muro: 'x', eje: -sx, pos: -17, cara: 1, numero: '7', rotulo: 'DORMITORIO 7', sub: '8 camas · mixto', etiqueta: 'Puerta del dormitorio 7', voz: 'la puerta del dormitorio siete', info: 'Dormitorio 7: ocupado. «No molestar».' });
  q({ id: 'arco-escalera-p1', tipo: 'arco', muro: 'x', eje: sx, pos: -7.8, ancho: 1.1, alto: 2.6, cara: -1, etiqueta: 'Arco de la escalera (planta alta)', voz: 'la escalera' });
  q({ id: 'puerta-privada2', muro: 'x', eje: sx, pos: -14.5, cara: -1, numero: 'P2', rotulo: 'PRIVADA 2', sub: 'dos camas', etiqueta: 'Puerta de la habitación privada 2', voz: 'la puerta de la habitación privada', info: 'Habitación privada 2: ocupada.' });
  q({ id: 'puerta-privada3', muro: 'x', eje: sx, pos: -18.5, cara: -1, numero: 'P3', rotulo: 'PRIVADA 3', sub: 'cama doble', etiqueta: 'Puerta de la habitación privada 3', voz: 'la puerta de la habitación privada', info: 'Habitación privada 3: libre, pero hay que reservarla en recepción.' });
  q({ id: 'puerta-dorm8', muro: 'z', eje: rz, pos: -3.3, cara: 1, numero: '8', rotulo: 'DORMITORIO 8', sub: '10 camas · mixto', etiqueta: 'Puerta del dormitorio 8', voz: 'la puerta del dormitorio ocho', info: 'Dormitorio 8: ocupado.' });
  q({ id: 'puerta-banos2', muro: 'z', eje: rz, pos: 1, cara: 1, numero: 'WC', rotulo: 'BAÑOS', sub: 'duchas · sanitarios', etiqueta: 'Puerta de los baños de la planta alta', voz: 'la puerta de los baños', info: 'Baños de la planta alta: duchas y sanitarios.' });
  q({ id: 'puerta-privada4', muro: 'z', eje: rz, pos: 4.3, cara: 1, numero: 'P4', rotulo: 'PRIVADA 4', sub: 'cama doble', etiqueta: 'Puerta de la habitación privada 4', voz: 'la puerta de la habitación privada', info: 'Habitación privada 4: ocupada.' });
  return v;
}
/** Hueco del vano en coordenadas del muro (x local a lo largo del muro, de oeste a este o de norte a sur). */
export const huecoDe = (vano, muro) => ({ x: muro.local(vano.pos), ancho: vano.ancho, alto: vano.alto, base: vano.base || 0 });

// Ventanas: fachada (PB con reja, P1 balconeras con balcón de madera y ventanas con postigos).
export const VENTANAS = {
  fachadaPB: [-7.4, -4, 4, 7.4].map(x => ({ x, ancho: 1.4, alto: 2.4, base: .8 })),
  fachadaP1: [-7.4, 7.4].map(x => ({ x, ancho: 1.4, alto: 2.4, base: .7 })),
  balconP1: [-2.6, 2.6].map(x => ({ x, ancho: 1.3, alto: 2.7, base: 0, balcon: 2.6 })),
  dorm1Alta: { pos: -10.8, ancho: 1, alto: .6, base: 3 }        // ventanuco enrejado sobre las literas (muro de galería)
};

// ── Columnas del patio ────────────────────────────────────────────────────
export function columnas() {
  const { x, front, rear } = H.patio, out = [];
  const xs = Array.from({ length: K.shortBays + 1 }, (_, i) => -x + 2 * x * i / K.shortBays);
  const zs = Array.from({ length: K.longBays + 1 }, (_, i) => front + (rear - front) * i / K.longBays);
  for (const cx of xs) for (const cz of [front, rear]) out.push([cx, cz]);
  for (const cz of zs.slice(1, -1)) for (const cx of [-x, x]) out.push([cx, cz]);
  return out;
}
export const zsLargas = () => Array.from({ length: K.longBays + 1 }, (_, i) => H.patio.front + (H.patio.rear - H.patio.front) * i / K.longBays);
export const xsCortas = () => Array.from({ length: K.shortBays + 1 }, (_, i) => -H.patio.x + 2 * H.patio.x * i / K.shortBays);

// ── Piscina ───────────────────────────────────────────────────────────────
export const PISCINA = rect(-P.width / 2, P.centerZ - P.length / 2, P.width / 2, P.centerZ + P.length / 2);

// ── Escalera en U (crujía este) ───────────────────────────────────────────
// Tramo A junto al muro exterior sube hacia el fondo (−z); descansillo; tramo B vuelve (+z) y llega a la
// franja de llegada (z > startZ) de la planta siguiente. Devuelve peldaños { x0, x1, z0, z1, y } (y = huella).
export function escalera(y0 = 0) {
  const n = E.perFlight, xa1 = E.xOuter, xa0 = xa1 - E.width, xb1 = xa0 - E.gap, xb0 = xb1 - E.width;
  const zTop = E.startZ - (n - 1) * E.run, pasos = [];
  for (let k = 0; k < n - 1; k++) pasos.push({ tramo: 'A', ...rect(xa0, E.startZ - (k + 1) * E.run, xa1, E.startZ - k * E.run), y: y0 + (k + 1) * E.rise });
  for (let k = 0; k < n - 1; k++) pasos.push({ tramo: 'B', ...rect(xb0, zTop + k * E.run, xb1, zTop + (k + 1) * E.run), y: y0 + (n + k + 1) * E.rise });
  const descanso = { ...rect(xb0, zTop - E.landing, xa1, zTop), y: y0 + n * E.rise };
  const llegada = rect(sC, E.startZ, X, fG);      // franja de llegada (forma parte del forjado superior)
  return { pasos, descanso, llegada, muro: rect(xb1, zTop, xa0, E.startZ), xa: [xa0, xa1], xb: [xb0, xb1], zTop };
}
/** Hueco de la escalera en el forjado: todo el cuarto de la escalera salvo la franja de llegada. */
export const huecoEscalera = () => { const c = cuarto('escalera'); return rect(c.rect.x0, c.rect.z0, c.rect.x1, E.startZ); };

// ── Literas del Dormitorio 1 ──────────────────────────────────────────────
// Dos por muro largo, cabecera al norte, casilleros y cortina hacia el pasillo central.
export function literas() {
  const r = cuarto('dorm1').rect, w = B.bed[0] + 2 * B.post, L = B.bed[1] + 2 * B.post;
  const puerta = vanos().find(v => v.id === 'puerta-dorm1'), libreZ = puerta.pos - puerta.ancho / 2 - DOOR.frame - .08;   // tras el marco de la puerta
  const out = [];
  for (const lado of [-1, 1]) {
    const cx = lado < 0 ? r.x0 + B.wallGap + w / 2 : r.x1 - B.wallGap - w / 2;
    for (let i = 0; i < 2; i++) {
      const z1 = libreZ - i * (L + B.gap), cz = z1 - L / 2;
      out.push({ id: `litera-${lado < 0 ? 'o' : 'e'}${i + 1}`, x: cx, z: cz, ancho: w, largo: L, pasillo: -lado, ...rect(cx - w / 2, cz - L / 2, cx + w / 2, cz + L / 2) });
    }
  }
  return out;
}
export const holguraLitera = () => B.upperDeck - B.post / 2 - (B.lowerDeck + B.mattress);

// ── Muro de calle con portadas ────────────────────────────────────────────
export function portadas() {
  const G = F.gate;
  return [{ id: 'entrada', x: G.x, texto: 'ENTRADA', voz: 'la entrada' }, { id: 'salida', x: -G.x, texto: 'SALIDA', voz: 'la salida' }]
    .map(p => ({ ...p, pilares: [p.x - G.clear / 2 - G.pier / 2, p.x + G.clear / 2 + G.pier / 2] }));
}
/** Tramos de muro entre portadas y vecinos, con pilastras repartidas a ≤ pilasterEvery. */
export function tramosMuroCalle() {
  const G = F.gate, half = F.span / 2, cortes = portadas().flatMap(p => [p.x - G.clear / 2 - G.pier, p.x + G.clear / 2 + G.pier]).sort((a, b) => a - b);
  const lim = [-half, ...cortes, half], out = [];
  for (let i = 0; i < lim.length; i += 2) {
    const a = lim[i], b = lim[i + 1], n = Math.ceil((b - a) / F.pilasterEvery);
    out.push({ x0: a, x1: b, pilastras: n > 1 ? Array.from({ length: n - 1 }, (_, k) => a + (b - a) * (k + 1) / n) : [] });
  }
  return out;
}
export const CALLE = (() => {
  const z0 = F.wallZ + F.thickness / 2, acera = z0 + S.sidewalk, via = acera + S.road, opuesta = via + S.farSidewalk;
  return { acera: [z0, acera], via: [acera, via], aceraOpuesta: [via, opuesta], fondoZ: opuesta };
})();
export const DELANTERO = rect(-H.width / 2, 0, H.width / 2, F.wallZ - F.thickness / 2);

// ── Tejadillo de la galería alta (cubierta a cuatro aguas invertida) ──────
// Borde alto en la cara de galería de los muros; borde bajo sobre el patio, `overhang` más allá de las columnas.
export function tejadillo() {
  const alto = rect(-CARAS.side[0], CARAS.rear[0], CARAS.side[0], CARAS.front[1]);
  const bajo = rect(-H.patio.x + TJ.overhang, H.patio.rear + TJ.overhang, H.patio.x - TJ.overhang, H.patio.front - TJ.overhang);
  const run = CARAS.side[0] - (H.patio.x - TJ.overhang), yBajo = TJ.high - run * Math.tan(TJ.slope);
  const yEn = d => TJ.high - d * Math.tan(TJ.slope);   // altura a distancia d del muro
  return { alto, bajo, yAlto: TJ.high, yBajo, yColumna: yEn(CARAS.side[0] - H.patio.x), run };
}

// ── Luz: salas cubiertas (techo) en el anillo de crujías + galerías ───────
export function salasCubiertas() {
  const xe = H.width / 2 - e / 2, zf = -e / 2, zr = -H.depth + e / 2, { x, front, rear } = H.patio;
  return [[-xe, front, xe, zf], [-xe, zr, xe, rear], [-xe, rear, -x, front], [x, rear, xe, front]];
}

// ── Áreas caminables (primera persona); muros, barandas y puertas cerradas bloquean aparte ──
export function areasCaminables(planta) {
  const casa = rect(-X, ZR, X, ZF), esc = huecoEscalera();
  if (planta === 0) {
    // Las áreas se SOLAPAN a través de los muros (portón, rejas): quien bloquea es el muro, no el borde del área.
    const coping = P.coping + .05, solape = 1;
    return [...restar(rect(-X, ZR, X, ZF + solape), [esc, rect(PISCINA.x0 - coping, PISCINA.z0 - coping, PISCINA.x1 + coping, PISCINA.z1 + coping)]),
      rect(DELANTERO.x0, DELANTERO.z0 - solape, DELANTERO.x1, DELANTERO.z1 + solape), rect(-30, CALLE.acera[0] - solape, 30, CALLE.aceraOpuesta[1] - .6)];
  }
  // Planta alta: sin el vacío del patio (la baranda está en la línea de columnas) ni el de la escalera.
  if (planta === 1) return restar(casa, [esc, rect(PATIO.x0 - .25, PATIO.z0 - .25, PATIO.x1 + .25, PATIO.z1 + .25)]);
  // Azotea: sin el hueco de galería + patio (rodeado de pretil) ni la caseta de la escalera.
  return restar(casa, [GALERIA, rect(sC - .2, esc.z0 - .2, X, fG + .2)]);
}
