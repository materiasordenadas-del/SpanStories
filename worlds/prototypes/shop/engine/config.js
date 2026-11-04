// Planta de «La Estrella» (Sistema 5 · Comercio) en metros, 1 u = 1 m.
// x al este, z al sur: la calle queda al sur (z > 0) y la fachada mira a la calle.
// Dibujo y fuentes en PLAN.md.  Toda cifra de planta vive aquí; los constructores
// derivan sus posiciones de estas constantes (nada de números sueltos de planta).
import { DIMENSIONS } from './dimensions.js';

export const ALTO_TECHO = DIMENSIONS.ceiling;
export const OJO = 1.62;
export const RADIO_JUGADOR = .24;
export const MURO = .2;

// Interior libre del local (caras interiores de los muros).
export const LOCAL = { x0: -8, x1: 8, z0: -14, z1: 0 };

// Rectángulo cubierto [x0, z0, x1, z1]: sobresale de las caras interiores de los
// muros (si no, la pared parpadea entre luz de techo y sol; ver Farmacia).
export const SALAS = {
  tienda: { nombre: 'La tienda', rect: [LOCAL.x0 - .05, LOCAL.z0 - .05, LOCAL.x1 + .05, LOCAL.z1 + .05] },
};
export const CALLE = { nombre: 'La calle' };

// ── Fachada (z = 0, grosor MURO hacia la calle) ──────────────────────────
export const FACHADA = {
  alto: 4.5,                     // remate del muro de fachada
  letrero: [3.05, 4.15],         // caja de luz del letrero (y)
  vuelo: .28,                    // lo que sobresale el letrero de la fachada
};
// Puerta automática de vidrio: dos hojas correderas.
export const PUERTA = { x: 5.6, ancho: 2.0, alto: 2.4, radioApertura: 2.6 };
// Escaparate: paños de vidrio entre montantes.
export const ESCAPARATE = { x0: -7.6, x1: 3.9, y0: .45, y1: 2.75, paños: 5, montante: .09, fondo: .9 };
export const TOLDO = { y: 2.9, caida: .45, vuelo: 1.0 };

// ── Calle ──────────────────────────────────────────────────────────────
export const ACERA = { z1: 3.6, ancho: 40, alto: .0 };
export const CALZADA = { z0: 3.8, z1: 11.5, bordillo: .15 };
export const FONDO_CALLE = { z: 16, alto: 11, ancho: 70 };
export const VECINOS = { ancho: 12, alto: [6.6, 7.4] };

// ── Caja ───────────────────────────────────────────────────────────────
// Muebles de caja con el largo en z (el cliente avanza hacia la calle/salida).
// x = eje del mueble; el carril del cliente queda al ESTE, el cajero al OESTE.
export const CAJAS = {
  x: [-4.8, -1.8], ancho: .6, z0: -3.9, z1: -2.1, alto: .85,
  carril: 1.1,                   // paso libre del cliente (1–1,2 m)
  cinta: .9,                     // tramo de banda al principio (norte)
  espera: -4.6,                  // línea «Espere aquí» (z)
  fila: 1.0,                     // largo de la zona de espera tras la línea
};
export const carrilCaja = i => CAJAS.x[i] + CAJAS.ancho / 2 + CAJAS.carril / 2;   // centro del carril

// ── Zona de promoción (isla central al entrar) ───────────────────────────
export const ISLA = { x: 4.6, z: -4.6, ancho: 1.8, fondo: 1.1, alto: .8, peldaño: .2, cartel: [.9, .6], cartelY: 2.15 };

// ── Área principal: góndolas dobles con el largo en z ────────────────────
export const GONDOLAS = {
  x: [-5.2, -2.6, 0, 2.6], ancho: .9, alto: 1.6,
  z0: -10.6, modulos: 3, modulo: 1.2,       // z0 = extremo norte del cuerpo
  cabecera: .45,                            // fondo de las cabeceras (ambos extremos)
  baldas: [.12, .5, .88, 1.26],             // altura de cada balda (paso 38 cm: cabe la gaseosa de 1,5 L)
  zocalo: .12,
};
export const largoGondola = () => GONDOLAS.modulos * GONDOLAS.modulo;
export const zSurGondola = () => GONDOLAS.z0 + largoGondola();                    // -7.0

// ── Paredes ──────────────────────────────────────────────────────────────
export const MURAL = { x0: LOCAL.x0, fondo: .55, z0: -12.8, modulos: 6, modulo: 1.2, alto: 2.0,
  baldas: [.12, .5, .88, 1.26, 1.64] };


// ── Fondo: refrigeradores (súper) o exposición especial (general) ─────────
export const FRIO = { x0: LOCAL.x0 + .2, z0: LOCAL.z0, n: 9, ancho: 1.3, fondo: .8, alto: 2.1 };

// ── Almacén (esquina noreste) ────────────────────────────────────────────
export const ALMACEN = { x0: 4.2, x1: LOCAL.x1, z0: LOCAL.z0, z1: -11.3, muro: .15,
  puerta: { x: 5.9, ancho: 1.0, alto: 2.2 },            // puerta «Solo personal» en el muro sur
  servicio: { z: -12.6, ancho: 1.1, alto: 2.2 } };      // puerta de servicio al muro este

// Frescos (pared este): empiezan a 30 cm del muro del almacén, derivado de él.
export const FRESCOS = { x1: LOCAL.x1, fondo: 1.25, z0: ALMACEN.z1 + ALMACEN.muro + .3, modulos: 5, modulo: 1.3 };

// ── Espera y entrada ─────────────────────────────────────────────────────
export const BANCA = { x: 7.45, z: -1.9, largo: 1.4, fondo: .45 };
export const CANASTAS = { x: 7.35, z: -3.45 };

// ── Techo: filas de tubos fluorescentes alineadas con los pasillos ────────
export const LUMINARIAS = {
  x: [-6.55, -3.9, -1.3, 1.3, 4.8, 7.1],
  z: [-12.2, -10.0, -8.0, -6.0, -4.0, -2.0],
};

// ── Recorrido: x, z, rumbo (0 = norte, +π/2 = este), cabeceo ───────────────
export const VISTAS = [
  { id: 'calle', nombre: '1 · La calle', x: 1.2, z: 9.2, yaw: .02, pitch: .1 },
  { id: 'escaparate', nombre: '2 · El escaparate', x: -2.6, z: 2.4, yaw: -.05, pitch: -.12 },
  { id: 'entrada', nombre: '3 · Al entrar', x: PUERTA.x, z: -1.0, yaw: -.3, pitch: -.04 },
  { id: 'promocion', nombre: '4 · Ofertas', x: ISLA.x - .2, z: ISLA.z + 1.75, yaw: 0, pitch: -.42 },
  { id: 'pasillo', nombre: '5 · Un pasillo', x: -1.3, z: -6.1, yaw: 0, pitch: -.06 },
  { id: 'pared', nombre: '6 · Pared de exposición', x: -5.95, z: -7.4, yaw: -1.25, pitch: -.1 },
  { id: 'frescos', nombre: '7 · Pared del este', x: 4.6, z: -7.6, yaw: 1.3, pitch: -.18 },
  { id: 'fondo', nombre: '8 · Zona especial', x: -1.3, z: -10.9, yaw: -.35, pitch: -.2 },
  { id: 'almacen', nombre: '9 · Almacén', x: 5.9, z: -10.3, yaw: .05, pitch: -.08 },
  { id: 'fila', nombre: '10 · La fila', x: carrilCaja(0), z: CAJAS.espera - .55, yaw: Math.PI, pitch: -.15 },
  { id: 'caja', nombre: '11 · En la caja', x: carrilCaja(0) + .25, z: -2.35, yaw: -Math.PI / 2 - .12, pitch: -.36 },
];

export const MODOS = {
  super: { nombre: 'Supermercado', letrero: 'Supermercado' },
  general: { nombre: 'Tienda general', letrero: 'Tienda general' },
};
