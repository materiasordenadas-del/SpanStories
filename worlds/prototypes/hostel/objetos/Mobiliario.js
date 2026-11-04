import * as T from '../engine/three.js';
import { caja, cilindro, esfera, pieza, barra } from './Piezas.js';
import { volumenRedondeado } from './Formas.js';
import { crearCartel } from './Carteles.js';
import { COLORS as C } from '../engine/dimensions.js';

// Mobiliario de las zonas comunes. Pivot abajo-centro; frente (donde se sienta/usa) hacia +z local.
let semilla = 5; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;

export function crearSofa({ ancho = 2.1, color = C.tela3 } = {}) {
  const r = new T.Group(), f = .9;
  caja(r, 'base', ancho, .28, f, C.maderaOscura, 0, .14, 0);
  for (const s of [-1, 1]) pieza(r, 'brazo', volumenRedondeado(.2, .62, f, .06), color, [s * (ancho / 2 - .1), .31, 0]);
  pieza(r, 'respaldo', volumenRedondeado(ancho - .4, .48, .22, .06), color, [0, .62, -f / 2 + .11]);
  const n = Math.max(2, Math.round((ancho - .4) / .8));
  for (let i = 0; i < n; i++) pieza(r, 'cojin', volumenRedondeado((ancho - .4) / n - .02, .16, f - .26, .05), color, [-(ancho - .4) / 2 + (i + .5) * (ancho - .4) / n, .36, .1]);
  for (const s of [-1, 1]) pieza(r, 'cojin-deco', volumenRedondeado(.36, .34, .1, .04), s < 0 ? C.tela2 : C.tela1, [s * (ancho / 2 - .42), .6, -f / 2 + .3]).rotation.x = -.25;
  return r;
}
export function crearMesa({ ancho = 1.2, fondo = .7, alto = .75, color = C.madera, redonda = false } = {}) {
  const r = new T.Group();
  if (redonda) { cilindro(r, 'tablero', ancho / 2, .04, color, 0, alto - .02, 0, true, 24); cilindro(r, 'pie', .05, alto - .04, C.maderaOscura, 0, (alto - .04) / 2); cilindro(r, 'base', .25, .03, C.maderaOscura, 0, .015); return r; }
  caja(r, 'tablero', ancho, .045, fondo, color, 0, alto - .0225, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(r, 'pata', .06, alto - .045, .06, C.maderaOscura, sx * (ancho / 2 - .08), (alto - .045) / 2, sz * (fondo / 2 - .08));
  return r;
}
export function crearSilla({ color = C.madera, asiento = C.tela1 } = {}) {
  const r = new T.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(r, 'pata', .04, .45, .04, C.maderaOscura, sx * .19, .225, sz * .19);
  caja(r, 'asiento', .44, .05, .44, asiento, 0, .47, 0);
  for (const sx of [-1, 1]) caja(r, 'paral', .04, .48, .04, C.maderaOscura, sx * .19, .71, -.2);
  for (const y of [.62, .86]) caja(r, 'travesaño', .42, .06, .03, color, 0, y, -.2);
  return r;
}
export function crearBanca({ largo = 1.6, alto = .45, color = C.madera } = {}) {
  const r = new T.Group(); caja(r, 'asiento', largo, .05, .36, color, 0, alto - .025, 0);
  for (const s of [-1, 1]) caja(r, 'pata', .06, alto - .05, .32, C.maderaOscura, s * (largo / 2 - .12), (alto - .05) / 2, 0);
  caja(r, 'riostra', largo - .3, .05, .04, C.maderaOscura, 0, .15, 0, false); return r;
}
export function crearTaburete({ alto = .75 } = {}) {
  const r = new T.Group(); cilindro(r, 'asiento', .18, .05, C.madera, 0, alto - .025, 0, true, 16);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; caja(r, 'pata', .035, alto - .05, .035, C.maderaOscura, Math.cos(a) * .12, (alto - .05) / 2, Math.sin(a) * .12); }
  caja(r, 'aro', .26, .03, .26, C.maderaOscura, 0, .25, 0, false); return r;
}
/** Estantería de intercambio de libros: repisas llenas de lomos de colores. Frente +z. */
export function crearEstanteria({ ancho = 1.8, alto = 2, fondo = .32, repisas = 5 } = {}) {
  const r = new T.Group(), cols = [C.tela1, C.tela2, C.tela3, C.tela4, C.crema, C.zocalo, '#8a5a8c'];
  for (const s of [-1, 1]) caja(r, 'costado', .03, alto, fondo, C.maderaOscura, s * (ancho / 2 - .015), alto / 2, 0);
  caja(r, 'fondo', ancho, alto, .015, C.madera, 0, alto / 2, -fondo / 2 + .0075, false);
  for (let i = 0; i <= repisas; i++) {
    const y = .05 + i * (alto - .1) / repisas; caja(r, 'repisa', ancho - .06, .025, fondo, C.maderaOscura, 0, y, 0, false);
    if (i === repisas) break;
    let x = -ancho / 2 + .05; const hmax = (alto - .1) / repisas - .06;
    while (x < ancho / 2 - .12) { const w = .025 + azar() * .03, h = hmax * (.65 + azar() * .3); caja(r, 'libro', w, h, fondo * .8, cols[Math.floor(azar() * cols.length)], x + w / 2, y + .0125 + h / 2, .01, false); x += w + .004; if (azar() < .06) x += .08; }
  }
  return r;
}
/** Guitarra en su soporte, apoyada mirando a +z. */
export function crearGuitarra() {
  const r = new T.Group(), g = new T.Group(); g.position.set(0, .12, 0); g.rotation.x = -.2; r.add(g);
  for (const [y, rad] of [[.2, .19], [.45, .15]]) { const c = cilindro(g, 'caja', rad, .09, C.madera, 0, y, 0, true, 24); c.rotation.x = Math.PI / 2; }
  const boca = cilindro(g, 'boca', .045, .092, C.negro, 0, .36, .001, false, 16); boca.rotation.x = Math.PI / 2;
  caja(g, 'mastil', .05, .5, .03, C.maderaOscura, 0, .82, 0); caja(g, 'clavijero', .08, .16, .03, C.maderaOscura, 0, 1.13, 0);
  caja(r, 'soporte', .32, .05, .3, C.negro, 0, .025, 0, false); caja(r, 'atril', .03, .3, .03, C.negro, 0, .2, -.1, false);
  return r;
}
/** Televisor plano de pared (pantalla apagada). Pivot en el centro de la pantalla. */
export function crearTelevisor({ ancho = 1.2 } = {}) {
  const r = new T.Group(), alto = ancho * .58; caja(r, 'marco', ancho, alto, .05, C.negro, 0, 0, .025);
  caja(r, 'pantalla', ancho - .04, alto - .04, .01, '#1f2a2e', 0, 0, .053, false); return r;
}
/** Alfombra tejida con franjas (estilo wayuu). */
export function crearAlfombra({ ancho = 2.4, fondo = 1.7 } = {}) {
  const r = new T.Group(), cols = [C.tela1, C.tela2, C.tela3, C.tela4, C.crema], n = 9;
  for (let i = 0; i < n; i++) caja(r, 'franja', ancho, .012, fondo / n, cols[i % cols.length], 0, .006, -fondo / 2 + (i + .5) * fondo / n, false);
  return r;
}
export function crearLamparaPie() {
  const r = new T.Group(); cilindro(r, 'base', .16, .03, C.negro, 0, .015, 0, true, 16); cilindro(r, 'vara', .015, 1.45, C.negro, 0, .74, 0, false, 8);
  pieza(r, 'pantalla', new T.CylinderGeometry(.16, .22, .28, 16, 1, true), C.crema, [0, 1.5, 0]); return r;
}
export function crearJuegoMesa() {
  const r = new T.Group(); caja(r, 'caja-1', .4, .07, .28, C.tela4, 0, .035, 0); caja(r, 'caja-2', .3, .06, .3, C.tela2, .02, .1, 0);
  caja(r, 'cartas', .09, .03, .06, C.crema, -.12, .145, .05, false); return r;
}
export function crearCuadro({ ancho = .9, alto = .6, motivo = 0 } = {}) {
  const r = new T.Group(); caja(r, 'marco', ancho + .06, alto + .06, .03, C.maderaOscura, 0, 0, 0);
  const cols = [[C.tela3, C.tela2, C.crema], [C.tela1, C.agua, C.tela2], [C.tela4, C.fachada, C.postigo]][motivo % 3];
  caja(r, 'cielo', ancho, alto * .55, .01, cols[0], 0, alto * .225, .017, false); caja(r, 'tierra', ancho, alto * .45, .01, cols[1], 0, -alto * .275, .017, false);
  esfera(r, 'sol', alto * .12, cols[2], ancho * .25, alto * .25, .02, false).scale.z = .1; return r;
}
export function crearReloj() {
  const r = new T.Group(); const c = cilindro(r, 'esfera', .17, .04, C.crema, 0, 0, .02, true, 24); c.rotation.x = Math.PI / 2;
  caja(r, 'aguja-h', .02, .09, .01, C.negro, 0, .04, .045, false); const m = caja(r, 'aguja-m', .015, .13, .01, C.negro, .05, -.02, .047, false); m.rotation.z = -2.2; return r;
}

// ── Recepción ─────────────────────────────────────────────────────────────
/** Mostrador de recepción: frente de tablas con zócalo de azulejo; el cliente está en +z. */
export function crearMostrador({ largo = 3, alto = 1.05, fondo = .65 } = {}) {
  const r = new T.Group();
  caja(r, 'cuerpo', largo, alto - .05, fondo, C.maderaOscura, 0, (alto - .05) / 2, 0);
  const n = Math.round(largo / .16); for (let i = 0; i < n; i++) caja(r, 'tabla', largo / n - .012, alto - .25, .02, i % 2 ? C.madera : '#a7744d', -largo / 2 + (i + .5) * largo / n, .2 + (alto - .25) / 2, fondo / 2 + .01, false);
  caja(r, 'zocalo-azulejo', largo, .18, .025, C.zocalo, 0, .09, fondo / 2 + .012, false);
  caja(r, 'encimera', largo + .08, .05, fondo + .12, C.madera, 0, alto - .025, .04);
  caja(r, 'repisa-trabajo', largo - .1, .03, .4, C.madera, 0, .76, -fondo / 2 + .2, false);
  return r;
}
export function crearTimbre() { const r = new T.Group(); cilindro(r, 'base', .06, .02, C.negro, 0, .01, 0, true, 14); pieza(r, 'campana', new T.SphereGeometry(.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.gold, [0, .02, 0]); esfera(r, 'boton', .012, C.gold, 0, .075, 0, false); return r; }
export function crearLibroRegistro() {
  const r = new T.Group(); for (const s of [-1, 1]) { const h = caja(r, 'hoja', .2, .02, .28, C.crema, s * .1, .012, 0); h.rotation.z = -s * .06; }
  caja(r, 'tapa', .42, .008, .3, C.tela4, 0, .004, 0, false); cilindro(r, 'esfero', .006, .15, C.tela4, .12, .03, .05, false, 6).rotation.z = Math.PI / 2; return r;
}
export function crearDatafono() { const r = new T.Group(); caja(r, 'cuerpo', .08, .03, .16, C.negro, 0, .015, 0); caja(r, 'pantalla', .06, .004, .045, '#86b6a8', 0, .032, -.04, false); for (let i = 0; i < 9; i++) caja(r, 'tecla', .014, .004, .012, '#d0d0c8', (i % 3 - 1) * .02, .032, .015 + Math.floor(i / 3) * .02, false); return r; }
export function crearComputador() {
  const r = new T.Group(); caja(r, 'pie', .18, .02, .14, C.negro, 0, .01, 0); caja(r, 'cuello', .04, .18, .03, C.negro, 0, .11, -.03);
  caja(r, 'monitor', .52, .32, .03, C.negro, 0, .34, -.02); caja(r, 'pantalla', .48, .28, .005, '#3f6a73', 0, .34, -.003, false);
  caja(r, 'teclado', .42, .015, .14, '#3b3f3e', 0, .008, .22, false); return r;
}
/** Tablero de llaves con ganchos numerados (de pared). Pivot en el centro. */
export function crearTableroLlaves() {
  const r = new T.Group(); caja(r, 'tablero', .7, .5, .025, C.madera, 0, 0, 0);
  for (let i = 0; i < 12; i++) { const x = -.27 + (i % 6) * .108, y = .12 - Math.floor(i / 6) * .22; esfera(r, 'gancho', .012, C.gold, x, y, .02, false); if (i % 5 !== 2) { caja(r, 'llave', .02, .07, .006, C.gold, x, y - .05, .02, false); caja(r, 'llavero', .045, .03, .008, [C.tela1, C.tela3, C.tela2][i % 3], x, y - .1, .022, false); } }
  return r;
}
/** Consigna de equipaje: estante metálico de dos alturas. Frente +z. */
export function crearConsigna({ ancho = 1.6 } = {}) {
  const r = new T.Group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(r, 'paral', .04, 1.6, .04, C.hierro, sx * (ancho / 2 - .02), .8, sz * .25);
  for (const y of [.12, .82, 1.55]) caja(r, 'balda', ancho, .03, .54, C.madera, 0, y, 0, false); return r;
}
/** Mochila de viajero (sin personas, solo equipaje). Frente +z. */
export function crearMochila({ color = C.tela4, alto = .62 } = {}) {
  const r = new T.Group(); pieza(r, 'cuerpo', volumenRedondeado(.38, alto, .26, .08), color, [0, alto / 2, 0]);
  pieza(r, 'bolsillo', volumenRedondeado(.28, alto * .35, .08, .03), new T.Color(color).offsetHSL(0, 0, -.08).getStyle(), [0, alto * .3, .15]);
  caja(r, 'tapa', .36, .06, .3, new T.Color(color).offsetHSL(0, 0, -.12).getStyle(), 0, alto - .02, .01);
  for (const s of [-1, 1]) caja(r, 'correa', .05, alto * .8, .02, C.negro, s * .1, alto * .5, -.14, false); return r;
}

// ── Patio y azotea ────────────────────────────────────────────────────────
/** Hamaca colombiana colgada entre dos puntos (x,y,z): tela a franjas con flecos y cabuyas. */
export function crearHamaca(a, b, { comba = .75, ancho = .95 } = {}) {
  const r = new T.Group(), A = new T.Vector3(...a), Bv = new T.Vector3(...b), n = 14, cols = [C.tela1, C.tela2, C.tela3, C.tela4, C.crema];
  const largo = A.distanceTo(Bv), punta = .35;          // cabuyas a cada lado
  const at = t => { const p = A.clone().lerp(Bv, t); p.y -= Math.sin(Math.PI * t) * comba; return p; };
  const dir = Bv.clone().sub(A).setY(0).normalize(), lado = new T.Vector3(-dir.z, 0, dir.x);
  for (let i = 0; i < n; i++) {
    const t0 = punta / largo + (1 - 2 * punta / largo) * i / n, t1 = punta / largo + (1 - 2 * punta / largo) * (i + 1) / n, p0 = at(t0), p1 = at(t1);
    const w = ancho * (.45 + .55 * Math.sin(Math.PI * (i + .5) / n)), seg = p0.distanceTo(p1) + .01;
    const m = caja(r, 'tela-' + i, w, .02, seg, cols[Math.floor(i / 3) % cols.length], (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, false);
    m.lookAt(p1);
    if (i === Math.floor(n / 2)) for (const s of [-1, 1]) caja(r, 'fleco', .02, .2, seg, C.tela2, (p0.x + p1.x) / 2 + lado.x * s * w / 2, (p0.y + p1.y) / 2 - .1, (p0.z + p1.z) / 2 + lado.z * s * w / 2, false).lookAt(p1.x + lado.x * s * w / 2, p1.y - .1, p1.z + lado.z * s * w / 2);
  }
  for (const [t, p] of [[punta / largo, A], [1 - punta / largo, Bv]]) { const q = at(t); for (const s of [-1, 0, 1]) barra(r, 'cabuya', [p.x, p.y, p.z], [q.x + lado.x * s * ancho * .2, q.y, q.z + lado.z * s * ancho * .2], .012, C.crema, false); esfera(r, 'argolla', .03, C.hierro, p.x, p.y, p.z, false); }
  return r;
}
/** Soporte de hamaca (azotea): arco de madera con dos ganchos. Eje largo en x local. */
export function crearSoporteHamaca({ largo = 3.2 } = {}) {
  const r = new T.Group(), alto = 1.35;
  caja(r, 'viga-suelo', largo, .1, .12, C.maderaOscura, 0, .05, 0);
  // Brazos inclinados hacia fuera: su extremo alto queda en ±(largo/2 − 0,03), a ~1,4 m.
  for (const s of [-1, 1]) { const p = caja(r, 'brazo', .12, 1.5, .12, C.maderaOscura, s * (largo / 2 - .32), .72, 0); p.rotation.z = -s * .4; caja(r, 'pie', .1, .06, .6, C.maderaOscura, s * (largo / 2 - .1), .03, 0, false); }
  r.userData.ganchos = [[-(largo / 2 - .02), alto], [largo / 2 - .02, alto]]; return r;
}
export function crearAsoleadora() {
  const r = new T.Group(); for (const sx of [-1, 1]) for (const z of [-.8, .7]) caja(r, 'pata', .05, .3, .05, C.maderaOscura, sx * .3, .15, z);
  caja(r, 'bastidor', .66, .06, 1.6, C.madera, 0, .33, .05); caja(r, 'colchoneta', .6, .07, 1.1, C.tela3, 0, .4, .3);
  const resp = caja(r, 'respaldo', .6, .07, .7, C.tela3, 0, .6, -.62); resp.rotation.x = .75; return r;
}
export function crearSombrilla({ radio = 1.2, alto = 2.3 } = {}) {
  const r = new T.Group(); cilindro(r, 'base', .22, .08, C.piedraOscura, 0, .04); cilindro(r, 'mastil', .025, alto, C.madera, 0, alto / 2, 0, false, 8);
  pieza(r, 'lona', new T.ConeGeometry(radio, .45, 8, 1, true), C.tela2, [0, alto - .1, 0]);
  pieza(r, 'lona-int', new T.CircleGeometry(radio * .97, 8).rotateX(Math.PI / 2), '#e2a637', [0, alto - .1 - .22, 0], false);   // cara inferior de la lona
  return r;
}
/** Luces colgantes entre dos puntos: cable con bombillos (emisivos). */
export function crearGuirnalda(a, b, { comba = .35, cada = .5 } = {}) {
  const r = new T.Group(), A = new T.Vector3(...a), Bv = new T.Vector3(...b), n = Math.max(2, Math.round(A.distanceTo(Bv) / cada));
  const at = t => { const p = A.clone().lerp(Bv, t); p.y -= Math.sin(Math.PI * t) * comba; return p; };
  const foco = new T.MeshBasicMaterial({ color: '#ffe3a1' });
  for (let i = 0; i < n; i++) { const p0 = at(i / n), p1 = at((i + 1) / n); barra(r, 'cable', p0.toArray(), p1.toArray(), .012, C.negro, false);
    if (i) { const b = new T.Mesh(new T.SphereGeometry(.045, 8, 6), foco); b.position.copy(p0).y -= .07; b.name = 'bombillo'; r.add(b); } }
  return r;
}
/** Poste de madera para la guirnalda (azotea). */
export function crearPoste({ alto = 2.6 } = {}) { const r = new T.Group(); caja(r, 'poste', .1, alto, .1, C.maderaOscura, 0, alto / 2, 0, 'fino'); caja(r, 'base', .3, .12, .3, C.piedraOscura, 0, .06, 0); return r; }
/** Tanque de agua plástico sobre base (típico de las azoteas colombianas). */
export function crearTanqueAgua() {
  const r = new T.Group(); caja(r, 'base', 1.3, .3, 1.3, C.piedraOscura, 0, .15, 0);
  pieza(r, 'tanque', new T.CylinderGeometry(.55, .6, 1.1, 20), '#33403f', [0, .85, 0]); cilindro(r, 'tapa', .3, .08, '#2a3332', 0, 1.44, 0, true, 16);
  for (const y of [.55, 1.05]) pieza(r, 'aro', new T.TorusGeometry(.585, .02, 6, 24), '#2a3332', [0, y, 0], false).rotation.x = Math.PI / 2; return r;
}
/** Lavadero de cemento (zona de ropas): pila con estregadero. Frente +z. */
export function crearLavadero() {
  const r = new T.Group(); caja(r, 'mueble', 1.2, .85, .65, '#c9c4ba', 0, .425, 0);
  caja(r, 'pila', .55, .3, .5, '#a9a49a', -.28, .78, .02, false); caja(r, 'estregadero', .55, .04, .5, '#b7b2a8', .3, .87, .02, false);
  for (let i = 0; i < 6; i++) caja(r, 'estria', .5, .012, .02, '#9d988e', .3, .9, -.18 + i * .07, false);
  cilindro(r, 'llave', .02, .25, C.metal, -.28, 1.0, -.3, false, 8); caja(r, 'grifo', .03, .03, .14, C.metal, -.28, 1.11, -.24, false); return r;
}
/** Tendedero: dos postes con cuerdas y toallas colgadas. Eje largo en x local. */
export function crearTendedero({ largo = 3 } = {}) {
  const r = new T.Group(), alto = 1.8, cols = [C.tela2, C.crema, C.tela3, C.tela1, C.crema];
  for (const s of [-1, 1]) { caja(r, 'poste', .07, alto, .07, C.hierro, s * largo / 2, alto / 2, 0, 'fino'); caja(r, 'cruceta', .06, .05, .7, C.hierro, s * largo / 2, alto, 0, false); }
  for (const dz of [-.3, 0, .3]) barra(r, 'cuerda', [-largo / 2, alto, dz], [largo / 2, alto, dz], .008, C.crema, false);
  for (let i = 0; i < 5; i++) { const x = -largo / 2 + .4 + i * (largo - .8) / 4, dz = [-.3, 0, .3][i % 3]; caja(r, 'toalla', .5, .75, .015, cols[i], x, alto - .38, dz, false); for (const dx of [-.18, .18]) caja(r, 'gancho', .02, .05, .03, C.tela4, x + dx, alto + .005, dz, false); }
  return r;
}
/** Barra pequeña de la azotea (sin bebidas). Frente del cliente en +z. */
export function crearBarra({ largo = 2.4 } = {}) {
  const r = new T.Group(); caja(r, 'cuerpo', largo, 1.0, .55, C.maderaOscura, 0, .5, 0);
  const n = Math.round(largo / .14); for (let i = 0; i < n; i++) caja(r, 'tabla', largo / n - .01, .9, .02, i % 2 ? C.madera : '#a7744d', -largo / 2 + (i + .5) * largo / n, .5, .285, false);
  caja(r, 'encimera', largo + .1, .05, .7, C.madera, 0, 1.075, .05); caja(r, 'reposapies', largo, .04, .04, C.metal, 0, .22, .33, false);
  const t = caja(r, 'techo', largo + .6, .06, 1.5, C.teja, 0, 2.45, -.15); t.rotation.x = .12;
  for (const s of [-1, 1]) caja(r, 'pilar', .1, 2.4, .1, C.maderaOscura, s * (largo / 2 + .15), 1.2, -.75, 'fino');
  return r;
}
/** Ducha exterior junto a la piscina. */
export function crearDucha() {
  const r = new T.Group(); caja(r, 'rejilla', .6, .03, .6, C.piedraOscura, 0, .015, 0, false); cilindro(r, 'tubo', .025, 2.2, C.metal, -.25, 1.1, -.25, false, 8);
  caja(r, 'brazo', .3, .03, .03, C.metal, -.1, 2.18, -.25, false); cilindro(r, 'regadera', .09, .04, C.metal, .05, 2.15, -.25, false, 12);
  caja(r, 'llave', .08, .08, .04, C.metal, -.25, 1.1, -.2, false); return r;
}
export { crearCartel };
