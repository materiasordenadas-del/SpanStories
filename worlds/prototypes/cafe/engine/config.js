// Planta de la cafetería STARBACK en metros, 1 u = 1 m.
// x al este, z al sur: la calle queda al sur (z > 0) y la fachada mira a la calle.
// Dibujo y fuentes en PLAN.md.  Toda cifra de planta vive aquí; los constructores
// derivan sus posiciones de estas constantes (nada de números sueltos de planta).
import { DIMENSIONS } from './dimensions.js';

export const ALTO_TECHO = DIMENSIONS.ceiling;
export const OJO = 1.62;
export const RADIO_JUGADOR = DIMENSIONS.playerRadius;
export const MURO = .2;

// Interior libre del local (caras interiores de los muros).
export const LOCAL = { x0: -6, x1: 6, z0: -10, z1: 0 };

// Rectángulo cubierto [x0, z0, x1, z1]: sobresale de las caras interiores de los
// muros (si no, la pared parpadea entre luz de techo y sol; ver Farmacia).
export const SALAS = {
  cafe: { nombre: 'La cafetería', rect: [LOCAL.x0 - .05, LOCAL.z0 - .05, LOCAL.x1 + .05, LOCAL.z1 + .05] },
};
export const CALLE = { nombre: 'La terraza y la calle' };

// ── Barra (a lo largo del muro del fondo) ──────────────────────────────────
// De atrás adelante: contrabarra pegada al muro → pasillo del barista → mostrador.
// Medidas: barra de pie 1,07 m, mesa de trabajo 0,91 m, pasillo 1,0–1,2 m (PLAN.md).
export const BARRA = {
  x0: -3.2, x1: LOCAL.x1,
  contrabarra: { fondo: .6, alto: .91 },
  pasillo: 1.1,
  mostrador: { fondo: .7, alto: 1.07 },
  // Tramos del mostrador de oeste a este: [x0, x1].  La caja es el tramo accesible (0,91 m).
  tramos: {
    entrega: [-3.2, -1.8],
    espresso: [-1.8, 1.6],
    caja: [1.6, 3.2],
    vitrina: [3.2, 5.0],
    cierre: [5.0, LOCAL.x1],
  },
  altoCaja: .91,
  vitrinaAlto: 1.38,           // tope del vidrio de la vitrina del pan
  puertecilla: .95,            // media puerta «Solo personal» al oeste del pasillo del barista
};
export const zContrabarra = () => LOCAL.z0 + BARRA.contrabarra.fondo;                 // -9.4
export const zTrasMostrador = () => zContrabarra() + BARRA.pasillo;                    // -8.3
export const zFrenteBarra = () => zTrasMostrador() + BARRA.mostrador.fondo;            // -7.6
export const centroTramo = k => (BARRA.tramos[k][0] + BARRA.tramos[k][1]) / 2;

// Muro del fondo sobre la contrabarra: azulejo y menús colgados.
export const AZULEJO = { y0: BARRA.contrabarra.alto, y1: 1.95 };
export const MENUS = { x0: -2.3, x1: 5.3, y0: 2.08, y1: 3.02, n: 4, hueco: .1, separacion: .06 };
// Carteles colgantes «Pide aquí» / «Recoge aquí»: por debajo de los menús (y centro) y delante del mostrador.
export const COLGADOS = { y: 1.98, alto: .26, retranqueo: .32 };

// ── Fachada (z = 0, grosor MURO hacia la calle) ────────────────────────────
// Puerta doble de vidrio alineada con la fila: se entra y se ve la vitrina.
export const PUERTA = { x: 4.1, ancho: 1.8, alto: DIMENSIONS.doorHeight, radioApertura: 2.2 };
export const FACHADA = {
  alto: 4.3,
  vidrio: { x0: LOCAL.x0 + .25, y0: .32, y1: 2.9, paños: 6, montante: .08 },   // hasta la puerta
  letrero: [3.08, 3.92],       // franja del letrero (y)
  vuelo: .22,
};
export const TOLDO = { y: 3.0, caida: .5, vuelo: 1.15 };

// ── Salón ───────────────────────────────────────────────────────────────
export const FILA = {
  x: PUERTA.x,                 // la fila sigue la línea de la puerta hasta la vitrina
  cabeza: zFrenteBarra() + .5, // donde espera el primero
  cartel: -2.7,                // poste «Haga su fila aquí» (z)
  ancho: 1.1,
};
export const VENTANA = { x0: LOCAL.x0 + .15, x1: 2.55, fondo: .42, alto: 1.07, bancos: 7 };   // barra de ventana
export const COMUNAL = { cx: -.8, cz: -4.9, largo: 3.6, fondo: 1.0, alto: .76, sillasPorLado: 3 };
export const BISTRO = { mesas: [{ x: -1.95, z: -2.35 }, { x: .6, z: -2.35 }], diam: .62, alto: .75 };
export const SILLONES = { x0: LOCAL.x0 + .15, x1: -3.2, z0: -4.25, z1: -1.55, mesita: .56 };
export const CONDIMENTOS = { x0: LOCAL.x0 + .1, x1: -3.75, fondo: .6, alto: .91 };
export const SANITARIOS = { z: -6.7, ancho: .9, alto: 2.2 };          // puerta en el muro oeste
export const MURAL = { z0: -5.95, z1: -1.2, y0: .95, y1: 3.1 };        // muro oeste, sobre los sillones
export const MURO_VERDE = { z0: -7.35, z1: -5.15, y0: .85, y1: 3.05 }; // muro este
export const ESTANTE = { z0: -4.85, z1: -2.75, fondo: .38, alto: 1.95, baldas: [.35, .8, 1.25, 1.7] };   // café en bolsa

// ── Techo: listones de madera sobre el salón; negro con rieles sobre la barra ─
export const LISTONES = { z0: zFrenteBarra() + .3, z1: LOCAL.z1, paso: .3, ancho: .07, canto: .14, y: ALTO_TECHO - .22 };

// ── Lámparas colgantes (y = altura de la pantalla) ───────────────────────
export const COLGANTES = {
  comunal: { x: [-2.0, -.8, .4], z: COMUNAL.cz, y: 2.05 },
  // barra: entre los carteles colgantes de entrega y caja
  barra: { x: [-1.4, -.1, 1.2], z: zTrasMostrador() + BARRA.mostrador.fondo / 2, y: 2.25 },
  bistro: { y: 2.1 },
  ventana: { x: [-4.4, -1.6, 1.2], z: LOCAL.z1 - .35, y: 2.3 },
  condimentos: { x: [(CONDIMENTOS.x0 + CONDIMENTOS.x1) / 2], z: LOCAL.z0 + .9, y: 2.2 },
};

// ── Calle y terraza ──────────────────────────────────────────────────────
export const ACERA = { z1: 3.8, ancho: 40 };
export const CALZADA = { z0: 4.0, z1: 11.5, bordillo: .15 };
export const FONDO_CALLE = { z: 16, alto: 11, ancho: 70 };
export const VECINOS = { ancho: 12, alto: [6.8, 7.6] };
export const TERRAZA = { mesas: [-4.3, -1.5, 1.3], z: 2.15, diam: .7, sombrilla: 1.9, jardineras: { z: 3.35, x: [-5.2, -2.9, -.1, 2.3] } };

// ── Recorrido: x, z, rumbo (0 = norte, +π/2 = este), cabeceo ───────────────
export const VISTAS = [
  { id: 'calle', nombre: '1 · La calle', x: .4, z: 9.4, yaw: .05, pitch: .08 },
  { id: 'terraza', nombre: '2 · La terraza', x: 1.1, z: 3.05, yaw: -.75, pitch: -.12 },
  { id: 'entrada', nombre: '3 · Al entrar', x: PUERTA.x - .2, z: -1.0, yaw: -.35, pitch: -.02 },
  { id: 'fila', nombre: '4 · La fila', x: FILA.x, z: FILA.cabeza + .9, yaw: -.12, pitch: -.18 },
  { id: 'caja', nombre: '5 · Pedir en caja', x: centroTramo('caja') - .15, z: zFrenteBarra() + 1.05, yaw: .05, pitch: -.24 },
  { id: 'barra', nombre: '6 · La barra de espresso', x: centroTramo('espresso'), z: zFrenteBarra() + 1.2, yaw: 0, pitch: -.18 },
  { id: 'entrega', nombre: '7 · Recoge aquí', x: centroTramo('entrega') + .1, z: zFrenteBarra() + .95, yaw: .05, pitch: -.18 },
  { id: 'condimentos', nombre: '8 · Leche y azúcar', x: (CONDIMENTOS.x0 + CONDIMENTOS.x1) / 2 + .3, z: LOCAL.z0 + 1.35, yaw: -.25, pitch: -.4 },
  { id: 'comunal', nombre: '9 · Mesa comunal', x: 1.9, z: -3.3, yaw: -1.1, pitch: -.25 },
  { id: 'sillones', nombre: '10 · Los sillones', x: -2.4, z: -1.2, yaw: -1.25, pitch: -.12 },
  { id: 'ventana', nombre: '11 · Barra de la ventana', x: -1.0, z: -1.7, yaw: Math.PI, pitch: -.12 },
];
