import * as T from '../engine/three.js';
import { caja, cilindro, esfera, pieza } from './Piezas.js';
import { volumenRedondeado } from './Formas.js';
import { COLORS as C, BUNK as B } from '../engine/dimensions.js';

// Litera de hostal (madera). Local: largo en z (cabecera en −z), ancho en x, PASILLO en +x.
// Pivot abajo-centro de la huella. Colchones incluidos (son parte de «la litera»).
export function crearLitera() {
  const r = new T.Group(), [bw, bl] = B.bed, p = B.post, w = bw + 2 * p, L = bl + 2 * p, top = B.top, M = C.madera, MO = C.maderaOscura;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(r, 'poste', p, top, p, MO, sx * (w / 2 - p / 2), top / 2, sz * (L / 2 - p / 2), 'medio');
  for (const y of [B.lowerDeck, B.upperDeck]) {
    for (const sx of [-1, 1]) caja(r, 'larguero', .04, .14, L - 2 * p, MO, sx * (w / 2 - .02), y - .07, 0);
    for (const sz of [-1, 1]) caja(r, 'testero', w - 2 * p, .14, .04, MO, 0, y - .07, sz * (L / 2 - .02));
    caja(r, 'tablero', bw, .03, bl, M, 0, y - .015, 0, false);
    caja(r, 'colchon', bw - .02, B.mattress, bl - .02, C.colchon, 0, y + B.mattress / 2, 0);
    caja(r, 'sabana', bw - .01, .02, bl * .62, C.sabana, 0, y + B.mattress + .005, -bl * .19, false);
  }
  // Cabecera cerrada (cubículo) y marco superior para la cortina de la cama alta.
  for (const [y0, y1] of [[B.lowerDeck + B.mattress, B.upperDeck - .14], [B.upperDeck + B.mattress, top - .05]]) caja(r, 'cabecero', w - 2 * p, y1 - y0, .025, M, 0, (y0 + y1) / 2, -L / 2 + p / 2);
  caja(r, 'panel-pared', .025, top - B.lowerDeck - .1, L - 2 * p, M, -(w / 2 - p / 2), B.lowerDeck + (top - B.lowerDeck - .1) / 2 + .05, 0, false);
  for (const sx of [-1, 1]) caja(r, 'marco-alto', .05, .08, L, MO, sx * (w / 2 - .025), top - .04, 0);
  for (const sz of [-1, 1]) caja(r, 'marco-alto-testero', w, .08, .05, MO, 0, top - .04, sz * (L / 2 - .025));
  // Barandilla de la cama alta del lado del pasillo (deja el hueco de la escalera a los pies).
  const yb = B.upperDeck + B.mattress + B.rail - .14, hueco = .5;
  caja(r, 'barandilla', .05, .09, L - hueco - p, MO, w / 2 - .025, yb, -hueco / 2 + p / 2);
  // Barras de cortina (pasillo) bajo la cama alta y en el marco superior.
  for (const y of [B.upperDeck - .2, top - .12]) cilindro(r, 'barra-cortina', .012, L - .1, C.metal, w / 2 + .03, y, 0, false, 6).rotation.x = Math.PI / 2;
  // Escalera a los pies, del lado del pasillo.
  const zl = L / 2 - .06 - hueco / 2, xl = w / 2 + .035;
  for (const dz of [-hueco / 2 + .03, hueco / 2 - .03]) caja(r, 'escalera-larguero', .045, B.upperDeck + .45, .045, MO, xl, (B.upperDeck + .45) / 2, zl + dz);
  for (let y = .32; y < B.upperDeck + .1; y += .3) cilindro(r, 'peldaño', .018, hueco - .06, M, xl, y, zl, false, 8).rotation.x = Math.PI / 2;
  r.userData.huella = { ancho: w, largo: L };
  return r;
}

/** Casillero bajo la cama: cajón de madera con candado. Frente +z local. */
export function crearCasillero({ ancho = .95 } = {}) {
  const r = new T.Group(), h = B.locker.height, d = B.locker.depth;
  caja(r, 'cuerpo', ancho, h, d, C.maderaOscura, 0, h / 2, 0);
  caja(r, 'frente', ancho - .04, h - .06, .02, C.madera, 0, h / 2, d / 2 + .01);
  caja(r, 'tirador', .22, .03, .03, C.metal, 0, h * .7, d / 2 + .035, false);
  caja(r, 'aldaba', .05, .08, .015, C.metal, ancho / 2 - .12, h * .55, d / 2 + .03, false);
  pieza(r, 'candado-arco', new T.TorusGeometry(.022, .006, 6, 12, Math.PI), C.metal, [ancho / 2 - .12, h * .5, d / 2 + .05], false);
  caja(r, 'candado', .05, .055, .025, C.gold, ancho / 2 - .12, h * .5 - .035, d / 2 + .05, false);
  return r;
}

/** Cortina recogida a un lado: pliegues verticales colgando de la barra. Frente +z, cuelga hacia −y desde y = 0. */
export function crearCortina({ ancho = .7, caida = .8, color = C.cortina } = {}) {
  const r = new T.Group(), n = Math.max(3, Math.round(ancho / .09));
  for (let i = 0; i < n; i++) caja(r, 'pliegue-' + i, ancho / n + .01, caida, .02, i % 2 ? color : '#b24f37', -ancho / 2 + (i + .5) * ancho / n, -caida / 2, (i % 2) * .03, false);
  caja(r, 'jareta', ancho, .05, .05, color, 0, -.025, .015, false);
  for (let k = 0; k < 3; k++) pieza(r, 'anilla', new T.TorusGeometry(.02, .004, 4, 10), C.metal, [-ancho / 2 + (k + .5) * ancho / 3, .012, .015], false);
  return r;
}
export function crearAlmohada() { const r = new T.Group(); pieza(r, 'almohada', volumenRedondeado(.58, .12, .34, .05), '#fbfaf5', [0, .06, 0]); return r; }
/** Cobija doblada a los pies, con franja. */
export function crearCobija({ color = C.cobija } = {}) {
  const r = new T.Group(); caja(r, 'cobija', .84, .07, .46, color, 0, .035, 0);
  caja(r, 'franja', .845, .072, .07, C.crema, 0, .036, .12, false); return r;
}
/** Lámpara de lectura con su enchufe, montada en el cabecero. Frente +z (hacia la cama). */
export function crearLamparaLectura() {
  const r = new T.Group();
  caja(r, 'placa', .1, .16, .02, C.crema, 0, 0, 0);
  caja(r, 'enchufe', .07, .07, .01, '#e9e6dc', 0, -.04, .015, false);
  for (const dx of [-.012, .012]) caja(r, 'clavija', .005, .015, .004, C.negro, dx, -.04, .021, false);
  cilindro(r, 'brazo', .008, .14, C.negro, 0, .1, .04, false, 6).rotation.x = .9;
  const pantalla = pieza(r, 'pantalla', new T.ConeGeometry(.05, .08, 12, 1, true), C.negro, [0, .15, .1], false); pantalla.rotation.x = -.6;
  const bombillo = new T.Mesh(new T.SphereGeometry(.025, 8, 6), new T.MeshBasicMaterial({ color: '#ffe7b0' })); bombillo.position.set(0, .13, .11); bombillo.name = 'bombillo'; r.add(bombillo);
  return r;
}
/** Perchero de pared con cuatro ganchos. Frente +z. */
export function crearPerchero({ ancho = 1.1 } = {}) {
  const r = new T.Group(); caja(r, 'listón', ancho, .1, .025, C.madera, 0, 0, 0);
  for (let i = 0; i < 4; i++) { const x = -ancho / 2 + (i + .5) * ancho / 4; cilindro(r, 'gancho', .012, .1, C.metal, x, -.01, .06, false, 6).rotation.x = Math.PI / 2; esfera(r, 'bolita', .02, C.metal, x, -.01, .11, false); }
  return r;
}
/** Espejo de pared con marco de madera. */
export function crearEspejo({ ancho = .5, alto = .8 } = {}) {
  const r = new T.Group(); caja(r, 'marco', ancho + .08, alto + .08, .03, C.maderaOscura, 0, 0, 0);
  caja(r, 'luna', ancho, alto, .01, '#cfe3e6', 0, 0, .018, false); return r;
}
