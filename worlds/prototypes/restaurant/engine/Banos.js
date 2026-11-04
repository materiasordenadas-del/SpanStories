import * as T from './three.js';
import { HUECOS } from './config.js';
import { ilustracion } from './Kit.js';
import { crearEspejo } from './Reflejos.js';
import { crearPuerta } from './Puertas.js';
import { GEO, vidrios, cuadro, aplique, colgante } from './Decor.js';

/* ── Pasillo y baños ─────────────────────────────────────────────────────
   Pasillo (x −5…−3, z −10…−5) con dos puertas de madera que se abren solas.
   Damas (z −10…−7.5) y caballeros (z −7.5…−5): lavabos de sobre encimera de
   mármol con espejo real, cubículo al fondo, urinarios en caballeros. */

function pictograma(tipo) {
  return (c, w, h) => {
    c.fillStyle = '#f4efe4'; c.beginPath(); c.roundRect(0, 0, w, h, w * .12); c.fill();
    c.strokeStyle = '#b08a3e'; c.lineWidth = w * .04; c.beginPath(); c.roundRect(w * .05, h * .05, w * .9, h * .9, w * .1); c.stroke();
    c.fillStyle = '#2f5a42';
    const x = w / 2, y = h * .36, s = h * .5;
    c.beginPath(); c.arc(x, y - s * .38, s * .12, 0, Math.PI * 2); c.fill();
    if (tipo === 'damas') { c.beginPath(); c.moveTo(x, y - s * .22); c.lineTo(x + s * .26, y + s * .3); c.lineTo(x - s * .26, y + s * .3); c.closePath(); c.fill(); c.fillRect(x - s * .12, y + s * .3, s * .08, s * .22); c.fillRect(x + s * .04, y + s * .3, s * .08, s * .22); }
    else { c.fillRect(x - s * .16, y - s * .22, s * .32, s * .5); c.fillRect(x - s * .16, y + s * .28, s * .12, s * .26); c.fillRect(x + s * .04, y + s * .28, s * .12, s * .26); }
    c.textAlign = 'center'; c.font = `italic bold ${h * .13}px Georgia, serif`; c.fillText(tipo === 'damas' ? 'Damas' : 'Caballeros', x, h * .9);
  };
}

function inodoro(ctx, x, z, ry) {
  const { kit, lote } = ctx, loza = kit.esmalte('loza2', .28, 2), cromo = kit.metal('cromo', .6, 1);
  lote.en(x, 0, z, ry, () => {
    lote.pieza(kit.geo.cil16, loza, 0, .16, .04, .24, .32, .32, { contorno: 'medio', nombre: 'el inodoro' });
    lote.esfera(loza, 0, .36, .1, .4, .18, .5, { contorno: 'medio', nombre: 'el inodoro' });
    lote.pieza(kit.geo.cil24, loza, 0, .44, .1, .4, .03, .48, { contorno: 'medio', nombre: 'el asiento' });
    lote.caja(loza, 0, .72, -.16, .38, .5, .03, { rx: -.12, contorno: 'medio', nombre: 'la tapa' });
    lote.caja(loza, 0, .74, -.26, .42, .38, .17, { contorno: 'medio', nombre: 'la cisterna' });
    lote.cil(cromo, 0, .94, -.26, .05, .02, { contorno: false, nombre: 'el botón de la cisterna' });
    lote.sombra(0, 0, .55, .7, 1);
  });
}
function lavabo(ctx, x, y, z, ry) {
  const { kit, lote } = ctx, loza = kit.esmalte('loza2', .3, 2), cromo = kit.metal('cromo', .65, 1);
  lote.en(x, y, z, ry, () => {
    lote.pieza(GEO.cuenco, loza, 0, 0, .02, 2.5, 1.6, 2.1, { nombre: 'el lavabo' });
    lote.cil(cromo, 0, .12, -.2, .035, .24, { lados: 12, contorno: 'medio', nombre: 'el grifo' });
    lote.cil(cromo, 0, .24, -.13, .025, .16, { rx: Math.PI / 2, lados: 12, contorno: 'medio', nombre: 'el grifo' });
    lote.cil(cromo, 0, .21, -.06, .026, .04, { lados: 12, contorno: false });
    for (const s of [-1, 1]) lote.cil(cromo, s * .1, .03, -.2, .04, .05, { lados: 8, contorno: false, nombre: 'la llave del agua' });
  });
}

function bano(ctx, sala) {
  const { kit, lote, grupo, colisiones, pulsables } = ctx;
  const damas = sala === 'damas', laton = kit.metal('laton', .55);
  const zN = damas ? -9.9 : -7.4, zS = damas ? -7.6 : -5.1;
  const zc = (zN + zS) / 2;
  // tocador junto a la puerta, contra el muro norte (damas) o sur (caballeros)
  const zPared = damas ? zN + .012 : zS - .012, sgn = damas ? 1 : -1, ry = damas ? 0 : Math.PI;
  const vx = -6.35;
  lote.en(vx, 0, zPared, ry, () => {
    lote.caja('nogal', 0, .42, .27, 1.9, .76, .5, { contorno: 'medio', nombre: 'el mueble del lavabo' });
    for (const s of [-1, 1]) { lote.caja('moldura', s * .47, .43, .525, .85, .6, .02, { contorno: 'medio' }); lote.esfera(laton, s * .08, .55, .545, .03, .03, .03, { contorno: false }); }
    lote.caja(kit.esmalte('marmol', .35, 2), 0, .82, .28, 1.96, .05, .56, { contorno: 'medio', nombre: 'la encimera de mármol' });
    lote.caja(kit.esmalte('marmol', .35, 2), 0, .92, .015, 1.96, .15, .03, { contorno: false });
    lote.sombra(0, .3, 2.2, .8, 1);
    // jabonera, toallas enrolladas, jarrón con flor
    lote.pieza(GEO.botellaAgua, vidrios().ambar, 0, .845, .12, .9, .7, .9, { nombre: 'el jabón líquido' });
    lote.cil(laton, 0, 1.05, .12, .02, .06, { lados: 8, contorno: false });
    for (let k = 0; k < 3; k++) lote.cil('mantel', .8 - k * .09, .88, .33, .08, .24, { rx: Math.PI / 2, lados: 12, contorno: 'medio', nombre: 'la toalla' });
    lote.pieza(GEO.vaso, vidrios().transparente, -.82, .845, .15, .8, 1.5, .8, { nombre: 'el jarrón' });
    lote.cil('hoja', -.82, 1.02, .15, .006, .26, { lados: 6, contorno: false });
    lote.esfera(damas ? '#e78aa0' : '#f2d23c', -.82, 1.16, .15, .07, .06, .07, { contorno: 'medio', nombre: 'la flor' });
    // espejo con marco de latón
    const g = .06, w = 1.7, h = .95;
    for (const s of [-1, 1]) {
      lote.caja(laton, 0, 1.72 + s * (h / 2 + g / 2), .025, w + 2 * g, g, .05, { contorno: 'medio', nombre: 'el marco del espejo' });
      lote.caja(laton, s * (w / 2 + g / 2), 1.72, .025, g, h, .05, { contorno: 'medio', nombre: 'el marco del espejo' });
    }
  });
  for (const dx of [-.45, .45]) lavabo(ctx, vx + dx, .845, zPared + sgn * .3, ry);
  const espejo = crearEspejo(1.7, .95, { tinte: '#eaf0ef', resolucion: .5 });
  espejo.position.set(vx, 1.72, zPared + sgn * .012); espejo.rotation.y = ry; espejo.userData.nombre = 'el espejo'; grupo.add(espejo); pulsables.push(espejo);
  aplique(ctx, vx - 1.12, 1.95, zPared, ry); aplique(ctx, vx + 1.12, 1.95, zPared, ry);
  colisiones.push([vx - 1, Math.min(zPared, zPared + sgn * .58), vx + 1, Math.max(zPared, zPared + sgn * .58)]);
  // dispensador de toallas de papel en la pared de enfrente
  const zOp = damas ? zS - .012 : zN + .012;
  lote.en(-5.75, 1.2, zOp, damas ? Math.PI : 0, () => {
    lote.caja(kit.metal('cromo', .55, 2), 0, 0, .07, .3, .38, .14, { contorno: 'medio', nombre: 'el dispensador de papel' });
    lote.caja('papel', 0, -.2, .1, .2, .04, .02, { contorno: false });
  });
  // cubículo al fondo (oeste): mampara verde, puerta entornada, inodoro
  const xP = -8.2, vano = damas ? [-8.95, -8.25] : [-6.6, -5.9];
  for (const [a, b] of [[zN + .01, vano[0]], [vano[1], zS - .01]]) {
    if (b - a < .05) continue;
    lote.caja('verdeBano', xP, 1.15, (a + b) / 2, .04, 2.0, b - a, { contorno: 'medio', nombre: 'la mampara' });
    colisiones.push([xP - .05, a, xP + .05, b]);
  }
  lote.caja('verdeBano', xP, 2.17, (vano[0] + vano[1]) / 2, .06, .06, vano[1] - vano[0], { contorno: 'medio' });
  lote.en(xP, 0, vano[0], -.9, () => {
    lote.caja('verdeBano', .33, 1.15, 0, .66, 1.9, .035, { contorno: 'medio', nombre: 'la puerta del cubículo' });
    lote.caja(kit.metal('cromo', .6, 1), .6, 1.05, .03, .02, .1, .02, { contorno: false });
  });
  lote.caja('verdeBano', xP, .08, (zN + zS) / 2, .05, .02, zS - zN, { contorno: false });
  inodoro(ctx, -9.58, (vano[0] + vano[1]) / 2 + (damas ? .05 : -.05), Math.PI / 2);
  lote.en(-9.88, .75, (vano[0] + vano[1]) / 2 + (damas ? .5 : -.5), Math.PI / 2, () => {
    lote.cil(kit.metal('cromo', .6, 1), 0, 0, .08, .03, .16, { rz: Math.PI / 2, lados: 8, contorno: false });
    lote.cil('papel', 0, 0, .08, .11, .1, { rz: Math.PI / 2, contorno: 'medio', nombre: 'el papel higiénico' });
  });
  colisiones.push([-9.9, zN, -9.25, zS]);
  // urinarios en caballeros (muro norte) con separador
  if (!damas) {
    const loza = kit.esmalte('loza2', .28, 2);
    for (const x of [-7.35, -6.55]) lote.en(x, 0, zN + .012, 0, () => {
      lote.caja(loza, 0, .82, .16, .38, .62, .3, { contorno: 'medio', nombre: 'el urinario' });
      lote.esfera(loza, 0, .6, .22, .38, .3, .34, { contorno: 'medio', nombre: 'el urinario' });
      lote.cil(kit.metal('cromo', .6, 1), 0, 1.24, .05, .04, .2, { lados: 8, contorno: false });
    });
    lote.caja('verdeBano', -6.95, 1.1, zN + .3, .03, .9, .55, { contorno: 'medio', nombre: 'el separador' });
    colisiones.push([-7.6, zN, -6.3, zN + .42]);
  }
  // luz de techo: plafón de vidrio opal
  lote.cil(kit.emisivo('#fff6e2'), -7, 3.52, zc, .42, .1, { lados: 24 });
  lote.cil(laton, -7, 3.58, zc, .48, .04, { lados: 24, contorno: 'medio', nombre: 'el plafón' });
  ctx.lamparas.push({ pos: [-7, 3.2, zc], color: '#fff2dc', intensidad: .9, radio: 3.4 });
}

export function construirBanos(ctx) {
  const { kit, lote, grupo, pulsables } = ctx, laton = kit.metal('laton', .55);
  bano(ctx, 'damas'); bano(ctx, 'caballeros');
  // puertas de madera con placa: bisagra en el lado norte del vano, abren hacia el baño
  for (const [clave, tipo] of [['damas', 'damas'], ['caballeros', 'caballeros']]) {
    const h = HUECOS[clave], z0 = h.z - h.ancho / 2 + .01, hoja = h.ancho - .02;
    const p = crearPuerta(ctx, {
      bisagra: [-5, z0], giroCerrada: -Math.PI / 2, abre: -1.35, sensor: [-4.6, h.z], radio: 1.35,
      construir: l => {
        l.caja('nogal', hoja / 2, h.alto / 2, 0, hoja, h.alto - .01, .045, { contorno: 'medio', nombre: 'la puerta del baño' });
        for (const s of [-1, 1]) for (const y of [.55, 1.45]) l.caja('moldura', hoja / 2, y, s * .026, hoja - .2, .7, .01, { contorno: false });
        for (const s of [-1, 1]) l.cil(laton, hoja - .08, 1.0, s * .05, .05, .02, { rx: Math.PI / 2, contorno: 'medio', nombre: 'el pomo' });
      },
    });
    const placa = ilustracion(.26, .32, 256, pictograma(tipo));
    placa.position.set(hoja / 2, 1.5, -.045); placa.rotation.y = Math.PI; placa.userData.nombre = tipo === 'damas' ? 'el baño de damas' : 'el baño de caballeros';
    p.pivote.add(placa); pulsables.push(placa);
    // marco de la puerta en el lado del pasillo
    for (const s of [-1, 1]) lote.caja('nogalOscuro', -4.88, h.alto / 2, h.z + s * (h.ancho / 2 + .04), .05, h.alto + .08, .08, { contorno: 'medio' });
    lote.caja('nogalOscuro', -4.88, h.alto + .04, h.z, .05, .08, h.ancho + .16, { contorno: 'medio' });
  }
  // pasillo: consola con flores bajo un cuadro, aplique y lámpara
  lote.en(-4, 0, -9.88, 0, () => {
    lote.caja('nogal', 0, .8, .18, 1.1, .05, .34, { contorno: 'medio', nombre: 'la consola' });
    for (const s of [-1, 1]) lote.caja('nogal', s * .5, .39, .18, .05, .78, .3, { contorno: 'medio' });
    lote.pieza(GEO.jarra, vidrios().transparente, 0, .825, .18, 1, 1.2, 1, { nombre: 'el jarrón' });
    for (let k = 0; k < 5; k++) lote.esfera(k % 2 ? '#e78aa0' : '#f4efe4', Math.cos(k * 1.3) * .08, 1.16 + (k % 2) * .04, .18 + Math.sin(k * 1.3) * .06, .09, .08, .09, { contorno: 'medio', nombre: 'las flores' });
    lote.sombra(0, .18, 1.3, .6, 1);
  });
  ctx.colisiones.push([-4.6, -9.9, -3.4, -9.5]);
  cuadro(ctx, -4, 1.85, -9.88, 0, .9, .65, 'napoles');
  cuadro(ctx, -3.12, 1.85, -8.4, -Math.PI / 2, .55, .75, 'toscana', { marco: 'nogalOscuro' });
  colgante(ctx, -4, -7.4, 2.35, { potencia: .8 });
}
