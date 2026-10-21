import * as T from '../engine/three.js';
import { caja, cilindro, esfera, pieza, barra } from './Piezas.js';
import { crearCartel } from './Carteles.js';
import { COLORS as C } from '../engine/dimensions.js';

// Cocina compartida y comedor. Pivot abajo-centro; frente (el lado que se usa) hacia +z local.
// El comedor NO lleva comida (la pondrá el usuario después): solo bandejas, vajilla y termos vacíos.
const ACERO = '#c8cdcf', ENCIMERA = '#e9e2d2', FRENTE = '#6f9c8e';

export function crearMuebleBajo({ largo = 1.2, fondo = .6, alto = .9, encimera = true } = {}) {
  const r = new T.Group(), n = Math.max(1, Math.round(largo / .6));
  caja(r, 'zocalo', largo - .04, .1, fondo - .06, C.negro, 0, .05, -.02, false);
  caja(r, 'cuerpo', largo, alto - .14, fondo - .02, FRENTE, 0, .1 + (alto - .14) / 2, -.01);
  for (let i = 0; i < n; i++) { const x = -largo / 2 + (i + .5) * largo / n; caja(r, 'puerta', largo / n - .02, alto - .2, .02, '#7fae9f', x, .1 + (alto - .2) / 2 + .02, fondo / 2, false); caja(r, 'tirador', .1, .02, .02, ACERO, x, alto - .2, fondo / 2 + .02, false); }
  if (encimera) caja(r, 'encimera', largo, .04, fondo + .02, ENCIMERA, 0, alto - .02, 0);
  return r;
}
/** Módulo de lavaplatos (en Colombia, el fregadero): mueble bajo con poceta y grifo. */
export function crearLavaplatos({ largo = 1 } = {}) {
  const r = crearMuebleBajo({ largo, encimera: false }), a = .9;
  for (const [x, w] of [[-largo / 2 + .08, .16], [largo / 2 - .08, .16]]) caja(r, 'encimera', w, .04, .62, ENCIMERA, x, a - .02, 0);
  for (const z of [-.25, .25]) caja(r, 'encimera', largo - .32, .04, .12, ENCIMERA, 0, a - .02, z);
  caja(r, 'poceta', largo - .32, .2, .38, ACERO, 0, a - .12, 0, false); caja(r, 'fondo-poceta', largo - .36, .01, .34, '#9fa6a8', 0, a - .2, 0, false);
  cilindro(r, 'grifo', .018, .3, ACERO, 0, a + .15, -.26, false, 8); barra(r, 'caño', [0, a + .3, -.26], [0, a + .3, -.08], .03, ACERO, false);
  esfera(r, 'manija', .03, ACERO, .1, a + .05, -.26, false); return r;
}
/** Estufa de gas de cuatro puestos con horno. */
export function crearEstufa() {
  const r = new T.Group(), w = .6, a = .9;
  caja(r, 'cuerpo', w, a, .6, '#e8e6e0', 0, a / 2, 0); caja(r, 'puerta-horno', w - .08, .45, .02, '#2f3332', 0, .35, .31, false);
  caja(r, 'manija-horno', w - .16, .025, .03, ACERO, 0, .63, .33, false); caja(r, 'mesón', w, .02, .6, '#2b2f2e', 0, a + .01, 0, false);
  for (const [x, z] of [[-.15, -.14], [.15, -.14], [-.15, .12], [.15, .12]]) { cilindro(r, 'quemador', .06, .03, '#5a5f5e', x, a + .035, z, false, 12); caja(r, 'parrilla', .2, .015, .02, C.negro, x, a + .055, z, false); caja(r, 'parrilla', .02, .015, .2, C.negro, x, a + .055, z, false); }
  for (let i = 0; i < 4; i++) cilindro(r, 'perilla', .02, .025, C.negro, -.2 + i * .133, .8, .31, false, 10).rotation.x = Math.PI / 2;
  caja(r, 'salpicadero', w, .1, .03, '#e8e6e0', 0, a + .05, -.285, false); return r;
}
/** Nevera de dos puertas con notas y fotos pegadas con imanes. */
export function crearNevera({ color = '#eef0ee' } = {}) {
  const r = new T.Group(), w = .7, a = 1.8;
  caja(r, 'cuerpo', w, a, .68, color, 0, a / 2, 0);
  caja(r, 'junta', w, .015, .02, '#b9bdbd', 0, 1.2, .345, false);
  for (const [y, h] of [[1.5, .4], [.65, .7]]) caja(r, 'manija', .03, h, .04, ACERO, w / 2 - .07, y, .37, false);
  for (const [x, y, col] of [[-.15, 1.5, C.tela2], [.05, 1.35, C.crema], [-.1, .9, '#f6e27a'], [.1, .7, C.agua]]) caja(r, 'nota', .12, .12, .005, col, x, y, .343, false);
  return r;
}
export function crearMicroondas() { const r = new T.Group(); caja(r, 'cuerpo', .5, .3, .38, '#e8e6e0', 0, .15, 0); caja(r, 'puerta', .34, .24, .01, '#2f3332', -.06, .15, .195, false); caja(r, 'panel', .1, .24, .01, '#cfd2d0', .19, .15, .195, false); return r; }
/** Gabinetes altos de pared: pivot ABAJO-centro a la altura de montaje. */
export function crearGabineteAlto({ largo = 1.2, alto = .7, fondo = .35 } = {}) {
  const r = new T.Group(), n = Math.max(1, Math.round(largo / .5)); caja(r, 'cuerpo', largo, alto, fondo, FRENTE, 0, alto / 2, 0);
  for (let i = 0; i < n; i++) { const x = -largo / 2 + (i + .5) * largo / n; caja(r, 'puerta', largo / n - .02, alto - .04, .02, '#7fae9f', x, alto / 2, fondo / 2 + .01, false); caja(r, 'tirador', .02, .1, .02, ACERO, x + (i % 2 ? -1 : 1) * (largo / n / 2 - .06), .1, fondo / 2 + .03, false); }
  return r;
}
/** Repisa con canastas rotuladas por huésped (para guardar lo propio). Frente +z. */
export function crearRepisaCanastas({ largo = 2.2, nombres = ['ANA', 'TOM', 'LÉA', 'JUAN', 'KENJI', 'SOFÍA', 'MAX', 'LUCÍA'] } = {}) {
  const r = new T.Group(), filas = 2, porFila = Math.ceil(nombres.length / filas), cols = [C.tela2, C.tela3, C.tela1, C.tela4];
  for (let f = 0; f <= filas; f++) caja(r, 'balda', largo, .03, .38, C.madera, 0, f * .4, 0, false);
  for (const s of [-1, 1]) caja(r, 'costado', .03, filas * .4, .38, C.maderaOscura, s * largo / 2, filas * .2, 0);
  nombres.forEach((n, i) => { const f = Math.floor(i / porFila), k = i % porFila, x = -largo / 2 + (k + .5) * largo / porFila;
    caja(r, 'canasta', largo / porFila - .08, .24, .32, cols[i % 4], x, f * .4 + .015 + .12, 0);
    const et = crearCartel({ ancho: .2, alto: .07, fondo: C.crema, borde: null, grosor: 0, lineas: [{ texto: n, tam: .8, color: C.tinta, peso: 700, fuente: 'system-ui, sans-serif' }], px: 64 }); et.position.set(x, f * .4 + .14, .165); r.add(et); });
  return r;
}
/** Barra de pared con ollas y sartenes colgadas. Pivot en la barra. */
export function crearOllasColgadas({ largo = 1.2 } = {}) {
  const r = new T.Group(); cilindro(r, 'barra', .012, largo, ACERO, 0, 0, .06, false, 8).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) caja(r, 'soporte', .03, .03, .08, ACERO, s * largo / 2, 0, .03, false);
  const items = [['olla', .13, .16], ['sarten', .14, .04], ['olla', .1, .12], ['sarten', .12, .035], ['cucharon', .04, .02]];
  items.forEach(([tipo, rad, h], i) => { const x = -largo / 2 + (i + .5) * largo / items.length; barra(r, 'gancho', [x, 0, .06], [x, -.08, .06], .01, ACERO, false);
    if (tipo === 'cucharon') { caja(r, 'mango', .015, .3, .01, ACERO, x, -.23, .06, false); cilindro(r, 'cazo', .045, .03, ACERO, x, -.39, .1, false, 10); return; }
    const c = cilindro(r, tipo, rad, h, tipo === 'sarten' ? '#2f3332' : ACERO, x, -.1 - rad, .06 + h / 2 + .02, true, 18); c.rotation.x = Math.PI / 2; });
  return r;
}
export function crearEscurridor() {
  const r = new T.Group(); caja(r, 'bandeja', .45, .02, .32, ACERO, 0, .01, 0, false);
  for (let i = 0; i < 6; i++) { const p = cilindro(r, 'plato', .11, .012, '#f6f4ee', -.15 + i * .06, .12, 0, true, 18); p.rotation.z = Math.PI / 2; }
  for (const s of [-1, 1]) caja(r, 'marco', .02, .16, .3, ACERO, s * .21, .08, 0, false); return r;
}
export function crearCafetera() { const r = new T.Group(); caja(r, 'base', .2, .05, .22, C.negro, 0, .025, 0); caja(r, 'torre', .2, .32, .08, C.negro, 0, .21, -.07); pieza(r, 'jarra', new T.CylinderGeometry(.07, .08, .14, 14), '#cfe3e6', [0, .12, .03], false); caja(r, 'tapa', .2, .04, .22, C.negro, 0, .39, 0, false); return r; }

// ── Comedor (tipo buffet, sin comida) ─────────────────────────────────────
/** Mostrador de buffet con protector de vidrio y lámpara; el cliente se sirve desde +z. */
export function crearMostradorBuffet({ largo = 3 } = {}) {
  const r = new T.Group(), a = .9, f = .7;
  caja(r, 'cuerpo', largo, a - .04, f, C.maderaOscura, 0, (a - .04) / 2, 0);
  const n = Math.round(largo / .16); for (let i = 0; i < n; i++) caja(r, 'tabla', largo / n - .012, a - .22, .02, i % 2 ? C.madera : '#a7744d', -largo / 2 + (i + .5) * largo / n, .18 + (a - .22) / 2, f / 2 + .01, false);
  caja(r, 'zocalo', largo, .16, .025, C.zocalo, 0, .08, f / 2 + .012, false);
  caja(r, 'encimera', largo + .06, .04, f + .06, ENCIMERA, 0, a - .02, 0);
  caja(r, 'deslizador', largo, .03, .22, C.madera, 0, a - .1, f / 2 + .12);   // repisa para deslizar el plato
  for (const s of [-1, 1]) caja(r, 'soporte-vidrio', .03, .45, .03, ACERO, s * (largo / 2 - .05), a + .22, .1, false);
  const v = caja(r, 'protector', largo - .06, .02, .34, '#cfe7ea', 0, a + .44, .18, false); v.rotation.x = -.35;
  caja(r, 'lampara', largo - .2, .04, .08, ACERO, 0, a + .45, -.05, false);
  return r;
}
/** Bandeja de buffet VACÍA en su marco (rechaud sin encender). */
export function crearBandejaBuffet() {
  const r = new T.Group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(r, 'pata', .02, .12, .02, ACERO, sx * .25, .06, sz * .15, false);
  caja(r, 'marco', .56, .02, .36, ACERO, 0, .12, 0, false); caja(r, 'bandeja', .52, .07, .32, '#dfe3e4', 0, .16, 0); caja(r, 'interior', .48, .01, .28, '#b9c0c2', 0, .195, 0, false);
  caja(r, 'tapa-apoyada', .52, .02, .1, ACERO, 0, .21, -.19, false); return r;
}
export function crearPilaPlatos({ n = 12 } = {}) { const r = new T.Group(); for (let i = 0; i < n; i++) cilindro(r, 'plato', .13, .012, '#f6f4ee', 0, .006 + i * .014, 0, i === n - 1, 20); return r; }
export function crearVasos() { const r = new T.Group(); caja(r, 'bandeja', .4, .015, .3, C.madera, 0, .0075, 0, false); for (let i = 0; i < 12; i++) pieza(r, 'vaso', new T.CylinderGeometry(.03, .035, .1, 10), '#d8ecef', [-.15 + (i % 4) * .1, .065, -.1 + Math.floor(i / 4) * .1], false); return r; }
export function crearTermo({ color = C.tela1 } = {}) { const r = new T.Group(); pieza(r, 'termo', new T.CylinderGeometry(.09, .1, .34, 16), color, [0, .17, 0]); cilindro(r, 'tapa', .06, .05, C.negro, 0, .365, 0, false, 12); caja(r, 'pico', .04, .03, .08, C.negro, 0, .3, .1, false); return r; }
export function crearCubiertero() { const r = new T.Group(); for (let i = 0; i < 3; i++) { cilindro(r, 'vaso-cubiertos', .045, .12, ACERO, -.1 + i * .1, .06, 0, true, 12); for (let k = 0; k < 4; k++) caja(r, 'mango', .012, .1, .005, ACERO, -.1 + i * .1 + (k - 1.5) * .012, .15, 0, false); } return r; }
export function crearServilletero() { const r = new T.Group(); caja(r, 'base', .16, .015, .08, C.madera, 0, .0075, 0, false); caja(r, 'servilletas', .14, .1, .02, '#fbfaf5', 0, .065, 0, false); for (const s of [-1, 1]) caja(r, 'lado', .015, .12, .07, C.madera, s * .075, .06, 0, false); return r; }
