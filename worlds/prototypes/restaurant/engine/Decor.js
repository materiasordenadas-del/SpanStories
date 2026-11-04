import * as T from './three.js';
import { conNormalContorno } from './Luz25D.js';
import { ilustracion, azar, PALETA } from './Kit.js';
import { crearVidrio } from './Reflejos.js';

/* ── Piezas de decoración compartidas por todas las salas ─────────────── */

// Perfiles torneados (x = radio, y = altura), en metros.
const torno = (puntos, lados = 20) => conNormalContorno(new T.LatheGeometry(puntos.map(([x, y]) => new T.Vector2(x, y)), lados));
export const GEO = {
  botellaVino: torno([[0, 0], [.037, 0], [.038, .01], [.038, .2], [.034, .235], [.016, .26], [.013, .27], [.013, .31], [.015, .315], [.015, .325], [0, .325]], 16),
  botellaLicor: torno([[0, 0], [.042, 0], [.043, .01], [.043, .17], [.035, .2], [.014, .22], [.014, .27], [.016, .275], [.016, .29], [0, .29]], 16),
  botellaAgua: torno([[0, 0], [.036, 0], [.037, .01], [.037, .19], [.02, .24], [.016, .27], [.016, .28], [0, .28]], 16),
  fiasco: torno([[0, 0], [.03, 0], [.07, .02], [.085, .06], [.08, .11], [.055, .15], [.02, .18], [.016, .3], [.019, .31], [0, .31]], 18),
  copa: torno([[0, 0], [.035, 0], [.035, .004], [.005, .01], [.004, .1], [.012, .108], [.036, .13], [.042, .165], [.038, .2], [.036, .205]], 18),
  copaInterior: torno([[0, .112], [.03, .128], [.036, .15], [.035, .158], [0, .158]], 14),
  vaso: torno([[0, 0], [.03, 0], [.034, .1], [.033, .1]], 14),
  plato: torno([[0, 0], [.07, 0], [.075, .006], [.1, .01], [.135, .02], [.137, .023], [.13, .022], [.1, .014], [0, .012]], 28),
  cuenco: torno([[0, 0], [.04, 0], [.07, .03], [.085, .06], [.08, .062], [.065, .033], [0, .025]], 20),
  taza: torno([[0, 0], [.028, 0], [.036, .05], [.034, .052], [0, .01]], 14),
  jarra: torno([[0, 0], [.055, 0], [.06, .05], [.05, .15], [.055, .2], [.06, .21], [0, .2]], 16),
  pantalla: torno([[.012, .16], [.06, .14], [.12, .06], [.15, .0], [.145, .0], [.115, .058], [.055, .135], [.008, .155]], 24),
  cupula: torno([[0, .0], [.2, .0], [.2, .012], [.14, .02], [.16, .09], [.15, .16], [.1, .2], [.04, .22], [.03, .25], [0, .25]], 24),
  vela: torno([[0, 0], [.012, 0], [.012, .09], [0, .092]], 10),
  llama: torno([[0, 0], [.007, .006], [.006, .02], [0, .034]], 8),
};

// Materiales de vidrio compartidos (se crean una vez).
let V = null;
export function vidrios() {
  V ??= {
    claro: crearVidrio({ tinte: '#dff0f2', opacidad: .1, fuerza: 1 }),
    copa: crearVidrio({ tinte: '#eef6f7', opacidad: .12, fuerza: 1.1, brillos: .8 }),
    verde: crearVidrio({ tinte: '#1f5a33', opacidad: .72, fuerza: .95, brillos: .9 }),
    ambar: crearVidrio({ tinte: '#8a4a12', opacidad: .7, fuerza: .95, brillos: .9 }),
    oscuro: crearVidrio({ tinte: '#2b1b16', opacidad: .85, fuerza: .9, brillos: .9 }),
    transparente: crearVidrio({ tinte: '#d8ecea', opacidad: .2, fuerza: 1, brillos: .9 }),
    rojo: crearVidrio({ tinte: '#7a1420', opacidad: .75, fuerza: .95, brillos: .9 }),
    ambarLampara: crearVidrio({ tinte: '#f3bd6a', opacidad: .42, fuerza: .55, brillos: .8 }),
    vitrina: crearVidrio({ tinte: '#e4f2f2', opacidad: .06, fuerza: 1, brillos: 1 }),
  };
  return V;
}

/* ── Cuadros de Italia (ilustración plana, marco 3D) ──────────────────── */

const PINTURAS = {
  coliseo(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f2c98f'); g.addColorStop(1, '#f7e5c4'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d99b62'; c.beginPath(); c.ellipse(w * .5, h * .72, w * .44, h * .1, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c98a55'; c.fillRect(w * .1, h * .3, w * .8, h * .42);
    c.fillStyle = '#e8b27a'; c.beginPath(); c.moveTo(w * .1, h * .3); c.lineTo(w * .62, h * .22); c.lineTo(w * .9, h * .26); c.lineTo(w * .9, h * .72); c.lineTo(w * .1, h * .72); c.fill();
    c.fillStyle = '#7a4a2e';
    for (let f = 0; f < 3; f++) for (let i = 0; i < 9; i++) { c.beginPath(); c.roundRect(w * (.14 + i * .085), h * (.36 + f * .12), w * .045, h * .08, [w * .02, w * .02, 0, 0]); c.fill(); }
    c.fillStyle = '#6f8f4a'; c.fillRect(0, h * .8, w, h * .2);
  },
  venecia(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fd0e8'); g.addColorStop(.55, '#f5e3c8'); g.addColorStop(.56, '#3f8aa4'); g.addColorStop(1, '#2d6f88');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const casas = ['#d97a52', '#e8c070', '#c4553f', '#e9a778', '#b9d0c2'];
    for (let i = 0; i < 6; i++) { c.fillStyle = casas[i % 5]; const x = i * w / 6, hh = h * (.25 + (i % 3) * .06); c.fillRect(x, h * .55 - hh, w / 6 + 1, hh);
      c.fillStyle = '#5c3a2c'; for (let k = 0; k < 2; k++) c.fillRect(x + w * .03 + k * w * .06, h * .55 - hh + h * .06, w * .025, h * .06); }
    c.fillStyle = '#1c1a1a'; c.beginPath(); c.moveTo(w * .25, h * .74); c.quadraticCurveTo(w * .5, h * .82, w * .8, h * .7); c.quadraticCurveTo(w * .55, h * .77, w * .25, h * .74); c.fill();
    c.fillRect(w * .66, h * .56, w * .008, h * .16);
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(w * (i / 12), h * (.63 + (i % 4) * .08)); c.lineTo(w * (i / 12 + .05), h * (.63 + (i % 4) * .08)); c.stroke(); }
  },
  toscana(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h * .5); g.addColorStop(0, '#f7c77e'); g.addColorStop(1, '#fbe6c0'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const colinas = ['#b9c46a', '#94a85a', '#7d9448', '#c9b35d'];
    colinas.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * (.45 + i * .12));
      c.bezierCurveTo(w * .3, h * (.35 + i * .12), w * .6, h * (.6 + i * .1), w, h * (.42 + i * .13)); c.lineTo(w, h); c.fill(); });
    c.fillStyle = '#2f4a2c'; for (const [x, y, s] of [[.62, .47, 1], [.67, .5, .8], [.3, .6, 1.2], [.34, .62, 1]]) { c.beginPath(); c.ellipse(w * x, h * y, w * .012 * s, h * .08 * s, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#e8c9a0'; c.fillRect(w * .44, h * .43, w * .1, h * .06); c.fillStyle = '#b5563a'; c.fillRect(w * .43, h * .41, w * .12, h * .025);
  },
  pisa(c, w, h) {
    c.fillStyle = '#bfe0ef'; c.fillRect(0, 0, w, h); c.fillStyle = '#8fbf6a'; c.fillRect(0, h * .82, w, h * .18);
    c.save(); c.translate(w * .5, h * .82); c.rotate(.09);
    c.fillStyle = '#f3ecdc'; c.fillRect(-w * .12, -h * .7, w * .24, h * .7);
    c.fillStyle = '#d5cbb5'; for (let i = 0; i < 7; i++) c.fillRect(-w * .12, -h * (.1 + i * .09), w * .24, h * .012);
    c.fillStyle = '#b9ad95'; for (let i = 0; i < 7; i++) for (let k = 0; k < 4; k++) c.fillRect(-w * .1 + k * w * .058, -h * (.18 + i * .09), w * .025, h * .05);
    c.restore();
  },
  vespa(c, w, h) {
    c.fillStyle = '#f0e4c8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c23b30'; c.fillRect(0, 0, w, h * .18);
    c.fillStyle = '#f7efe0'; c.font = `bold ${h * .1}px Georgia, serif`; c.textAlign = 'center'; c.fillText('ROMA 1962', w / 2, h * .12);
    c.fillStyle = '#7fb8a6'; c.beginPath(); c.ellipse(w * .5, h * .55, w * .3, h * .14, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(w * .25, h * .55); c.quadraticCurveTo(w * .3, h * .3, w * .38, h * .3); c.lineTo(w * .4, h * .55); c.fill();
    c.fillStyle = '#2b2b2b'; for (const x of [.28, .72]) { c.beginPath(); c.arc(w * x, h * .7, w * .08, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ddd'; c.beginPath(); c.arc(w * x, h * .7, w * .03, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2b2b2b'; }
    c.fillStyle = '#6e5a48'; c.fillRect(w * .6, h * .38, w * .16, h * .04);
    c.fillStyle = '#2f5a42'; c.font = `italic ${h * .08}px Georgia, serif`; c.fillText('Dolce vita', w / 2, h * .92);
  },
  pasta(c, w, h) {
    c.fillStyle = '#f5d98c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f5a42'; c.fillRect(w * .06, h * .05, w * .88, h * .9);
    c.fillStyle = '#f5d98c'; c.fillRect(w * .1, h * .08, w * .8, h * .84);
    c.fillStyle = '#c23b30'; c.font = `italic bold ${h * .11}px Georgia, serif`; c.textAlign = 'center'; c.fillText('Pasta', w / 2, h * .22);
    c.fillStyle = '#2f5a42'; c.font = `${h * .05}px Georgia, serif`; c.fillText('FATTA IN CASA', w / 2, h * .3);
    c.fillStyle = '#fbf4e2'; c.beginPath(); c.ellipse(w / 2, h * .62, w * .32, h * .12, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e8b04a'; c.lineWidth = 5; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(w / 2 + (i % 5 - 2) * 12, h * .6, w * (.08 + (i % 3) * .05), h * .05, i * .4, 0, Math.PI * 1.5); c.stroke(); }
    c.fillStyle = '#c23b30'; c.beginPath(); c.ellipse(w / 2, h * .57, w * .1, h * .035, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4f8a4a'; c.beginPath(); c.ellipse(w / 2 + 10, h * .545, w * .03, h * .012, .5, 0, Math.PI * 2); c.fill();
  },
  nonna(c, w, h) {
    const g = c.createRadialGradient(w / 2, h * .4, 10, w / 2, h / 2, w * .7); g.addColorStop(0, '#caa36c'); g.addColorStop(1, '#6d4a2c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a3f55'; c.beginPath(); c.moveTo(w * .15, h); c.quadraticCurveTo(w * .5, h * .55, w * .85, h); c.fill();
    c.fillStyle = '#efd3b5'; c.beginPath(); c.ellipse(w / 2, h * .42, w * .17, h * .17, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e9e6e0'; c.beginPath(); c.ellipse(w / 2, h * .29, w * .19, h * .09, 0, Math.PI, 0); c.fill(); c.beginPath(); c.arc(w / 2, h * .22, w * .07, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2a22'; for (const s of [-1, 1]) { c.beginPath(); c.arc(w / 2 + s * w * .065, h * .41, w * .012, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#3a2a22'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h * .46, w * .06, .3, Math.PI - .3); c.stroke();
    c.strokeStyle = '#8a8a8a'; c.lineWidth = 2; for (const s of [-1, 1]) { c.beginPath(); c.arc(w / 2 + s * w * .065, h * .41, w * .035, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#e9a0a0'; for (const s of [-1, 1]) { c.globalAlpha = .4; c.beginPath(); c.arc(w / 2 + s * w * .1, h * .47, w * .03, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1;
    c.fillStyle = '#f6f0e4'; c.font = `italic ${h * .06}px Georgia, serif`; c.textAlign = 'center'; c.fillText('Nonna Rosa · 1962', w / 2, h * .95);
  },
  napoles(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6b77c'); g.addColorStop(.5, '#fbdcae'); g.addColorStop(.51, '#5d9cc0'); g.addColorStop(1, '#3f7ea4'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#8d7a8e'; c.beginPath(); c.moveTo(w * .15, h * .5); c.lineTo(w * .45, h * .18); c.lineTo(w * .52, h * .2); c.lineTo(w * .85, h * .5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(w * .49, h * .13, w * .06, h * .03, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e0a36a'; c.fillRect(0, h * .74, w, h * .26); c.fillStyle = '#c96a3f'; for (let i = 0; i < 8; i++) c.fillRect(i * w / 8 + 4, h * .7, w / 10, h * .06);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w * .6, h * .6); c.lineTo(w * .66, h * .47); c.lineTo(w * .66, h * .6); c.fill();
  },
};
export const TIPOS_CUADRO = Object.keys(PINTURAS);

/** Cuadro con marco dorado o de madera sobre una pared. ry = hacia dónde mira. */
export function cuadro(ctx, x, y, z, ry, ancho, alto, tipo, { marco = 'dorado', nombre = 'el cuadro' } = {}) {
  const { kit, lote, grupo } = ctx;
  const m = marco === 'dorado' ? kit.metal('laton', .45, 2) : marco;
  lote.en(x, y, z, ry, () => {
    const g = .06;
    lote.caja(m, 0, alto / 2 + g / 2, .02, ancho + 2 * g, g, .04, { contorno: 'medio', nombre });
    lote.caja(m, 0, -alto / 2 - g / 2, .02, ancho + 2 * g, g, .04, { contorno: 'medio', nombre });
    for (const s of [-1, 1]) lote.caja(m, s * (ancho / 2 + g / 2), 0, .02, g, alto, .04, { contorno: 'medio', nombre });
    lote.caja('nogalOscuro', 0, 0, .006, ancho, alto, .012, { contorno: false });
  });
  const lienzo = ilustracion(ancho, alto, 512, PINTURAS[tipo]);
  lienzo.position.set(x + Math.sin(ry) * .014, y, z + Math.cos(ry) * .014); lienzo.rotation.y = ry;
  lienzo.userData.nombre = nombre; ctx.pulsables.push(lienzo);
  grupo.add(lienzo);
}

/** Aplique de pared de latón con pantalla de tela encendida. */
export function aplique(ctx, x, y, z, ry, { lampara = true } = {}) {
  const { kit, lote } = ctx, laton = kit.metal('laton', .5);
  lote.en(x, y, z, ry, () => {
    lote.cil(laton, 0, 0, .015, .09, .03, { rx: Math.PI / 2, contorno: 'medio', nombre: 'el aplique' });
    lote.caja(laton, 0, .04, .1, .02, .02, .18, { rx: -.5, contorno: false });
    lote.pieza(kit.geo.tambor, kit.pantalla, 0, .17, .17, .2, .15, .2, { contorno: 'medio', nombre: 'el aplique' });
    lote.esfera(kit.emisivo('#fff4d8'), 0, .15, .17, .06, .07, .06);
    lote.cil(laton, 0, .1, .17, .025, .05, { lados: 8, contorno: false });
  });
  if (lampara) ctx.lamparas.push({ pos: [x + Math.sin(ry) * .3, y + .1, z + Math.cos(ry) * .3], color: '#ffd8a0', intensidad: .7, radio: 1.8 });
}

/** Lámpara colgante de cúpula de vidrio ámbar, cable de latón desde el techo. */
export function colgante(ctx, x, z, y = 2.1, { techo = 3.6, nombre = 'la lámpara colgante', potencia = 1 } = {}) {
  const { kit, lote } = ctx, laton = kit.metal('laton', .55);
  lote.cil('negro', x, (techo + y + .25) / 2, z, .008, techo - y - .25, { lados: 8, contorno: false });
  lote.cil(laton, x, techo - .02, z, .1, .04, { contorno: 'medio' });
  lote.cil(laton, x, y + .26, z, .045, .06, { contorno: 'medio' });
  lote.pieza(GEO.cupula, vidrios().ambarLampara, x, y, z, 1, 1, 1, { nombre });
  lote.esfera(kit.emisivo('#fff0c8'), x, y + .1, z, .07);
  ctx.lamparas.push({ pos: [x, y - .1, z], color: '#ffcf8a', intensidad: .95 * potencia, radio: 2.5 });
}

/** Olivo o ficus en maceta de terracota (volúmenes toon). */
export function planta(ctx, x, z, { alto = 1.8, nombre = 'el olivo', semilla = 1 } = {}) {
  const { lote } = ctx, r = azar(semilla * 13 + 7);
  lote.en(x, 0, z, r() * 6, () => {
    lote.cil('maceta', 0, .26, 0, .5, .52, { contorno: 'medio', nombre: 'la maceta' });
    lote.cil('ladrilloOscuro', 0, .5, 0, .56, .06, { contorno: 'medio' });
    lote.cil('#5b4636', 0, .52, 0, .46, .02, { contorno: false });
    lote.cil('tronco', 0, .52 + alto * .3, 0, .06, alto * .6, { lados: 8, rz: .08, contorno: 'medio' });
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, d = .1 + r() * .22, y = .5 + alto * (.55 + r() * .4);
      lote.esfera(i % 2 ? 'hoja' : 'hojaOscura', Math.cos(a) * d, y, Math.sin(a) * d, .42 + r() * .2, .32 + r() * .12, .42 + r() * .2, { contorno: 'medio', nombre });
    }
    lote.sombra(0, 0, .9, .9, 1);
  });
  ctx.colisiones.push([x - .3, z - .3, x + .3, z + .3]);
}

/** Cortinas de café (media altura) en un riel de latón, del lado interior. */
export function cortinaCafe(ctx, x0, x1, z, { y0 = 1.02, y1 = 1.72 } = {}) {
  const { kit, lote } = ctx, laton = kit.metal('laton', .5);
  lote.cil(laton, (x0 + x1) / 2, y1 + .03, z, .018, x1 - x0 + .1, { rz: Math.PI / 2, lados: 8, contorno: 'medio' });
  const pliegues = Math.round((x1 - x0) / .07);
  for (let i = 0; i < pliegues; i++) {
    const x = x0 + (i + .5) * (x1 - x0) / pliegues;
    if (Math.abs(x - (x0 + x1) / 2) < .03) continue;
    lote.caja('papel', x, (y0 + y1) / 2, z + (i % 2 ? .012 : -.012), (x1 - x0) / pliegues * 1.08, y1 - y0, .01, { ry: i % 2 ? .45 : -.45, contorno: false, nombre: 'la cortina' });
  }
  for (let i = 0; i < 12; i++) lote.cil(laton, x0 + (i + .5) * (x1 - x0) / 12, y1 + .03, z, .03, .01, { rz: Math.PI / 2, lados: 8, contorno: false });
}

/** Botella de vino con etiqueta.  vidrio: clave de vidrios(). */
export function botella(ctx, x, y, z, { tipo = 'botellaVino', vidrio = 'verde', etiqueta = 'papel', capsula = null, rx = 0, ry = 0, rz = 0, nombre = 'la botella de vino', lote = ctx.lote } = {}) {
  const V = vidrios(), geo = GEO[tipo];
  lote.pieza(geo, V[vidrio], x, y, z, 1, 1, 1, { rx, ry, rz, nombre });
  // cápsula y etiqueta (toon)
  const e = new T.Euler(rx, ry, rz), up = new T.Vector3(0, 1, 0).applyEuler(e);
  const tope = tipo === 'botellaLicor' ? .28 : .3;
  lote.cil(capsula ?? (tipo === 'botellaLicor' ? 'dorado' : 'vinoTinto'), x + up.x * tope, y + up.y * tope, z + up.z * tope, .03, .045, { rx, ry, rz, lados: 8, contorno: false });
  const cy = tipo === 'botellaLicor' ? .09 : .11;
  lote.cil(etiqueta, x + up.x * cy, y + up.y * cy, z + up.z * cy, tipo === 'botellaLicor' ? .088 : .079, .075, { rx, ry, rz, lados: 16, contorno: false });
}

/** Cubierto: plato llano, servilleta, tenedor y cuchillo, copa. Mira hacia +z local (el comensal está en +z). */
export function cubierto(ctx, { copa = true, servilleta = 'cuadroRojo', lote = ctx.lote } = {}) {
  const { kit } = ctx, cromo = kit.metal('cromo', .6, 1);
  lote.pieza(GEO.plato, kit.esmalte('loza', .25, 2.5), 0, .001, 0, 1, 1, 1, { nombre: 'el plato' });
  lote.caja(servilleta, -.19, .012, 0, .1, .016, .2, { contorno: false, nombre: 'la servilleta' });
  lote.caja(cromo, -.19, .025, 0, .018, .004, .19, { contorno: false, nombre: 'el tenedor' });
  lote.caja(cromo, .19, .004, 0, .016, .004, .21, { contorno: false, nombre: 'el cuchillo' });
  if (copa) lote.pieza(GEO.copa, vidrios().copa, .17, 0, -.2, 1, 1, 1, { nombre: 'la copa de vino' });
}
